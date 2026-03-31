<?php

class CertManager
{
    /**
     * Generate a 2048-bit RSA private key and return it as a PEM string.
     */
    public function generatePrivateKey(): string
    {
        $privKey = openssl_pkey_new([
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);
        if ($privKey === false) {
            throw new RuntimeException('Failed to generate private key: ' . openssl_error_string());
        }
        openssl_pkey_export($privKey, $pem);
        return $pem;
    }

    /**
     * Generate a Certificate Signing Request (CSR) for the given domains.
     *
     * @param string $privateKeyPem PEM-encoded private key.
     * @param array  $domains       List of domain names (first is used as CN).
     * @return string PEM-encoded CSR.
     */
    public function generateCSR(string $privateKeyPem, array $domains): string
    {
        if (empty($domains)) {
            throw new InvalidArgumentException('At least one domain is required');
        }

        $primaryDomain = $domains[0];

        $dn = [
            'commonName'         => $primaryDomain,
            'organizationName'   => 'CertManager',
            'countryName'        => 'US',
        ];

        $privKey = openssl_pkey_get_private($privateKeyPem);
        if ($privKey === false) {
            throw new RuntimeException('Invalid private key');
        }

        // Build SAN config for multiple domains
        $sanList = implode(',', array_map(fn($d) => "DNS:{$d}", $domains));
        $configPath = $this->buildOpenSSLConfig($sanList);

        $csrOptions = [];
        if ($configPath) {
            $csrOptions['config'] = $configPath;
        }

        $csr = openssl_csr_new($dn, $privKey, $csrOptions);
        if ($csr === false) {
            $this->cleanupTmpConfig($configPath);
            throw new RuntimeException('Failed to generate CSR: ' . openssl_error_string());
        }

        openssl_csr_export($csr, $csrPem);
        $this->cleanupTmpConfig($configPath);
        return $csrPem;
    }

    /**
     * Write a single combined PEM certificate file to the given file path.
     *
     * The file contains, in order:
     *   1. The leaf certificate
     *   2. The CA bundle / intermediate chain
     *   3. The private key
     *
     * This all-in-one format is accepted by nginx, Apache, HAProxy and most
     * other servers.  The file is created with mode 0600 because it contains
     * the private key.  The parent directory is created automatically if it
     * does not already exist.
     *
     * @param string $certPem        Leaf certificate PEM.
     * @param string $caBundlePem    CA bundle PEM.
     * @param string $privateKeyPem  Private key PEM.
     * @param string $certFilePath   Full path to the target file
     *                               (e.g. /etc/nginx/ssl/mysite.pem).
     */
    public function installCertificate(
        string $certPem,
        string $caBundlePem,
        string $privateKeyPem,
        string $certFilePath
    ): void {
        $dir = dirname($certFilePath);
        if (!is_dir($dir)) {
            if (!mkdir($dir, 0755, true)) {
                throw new RuntimeException("Cannot create directory: {$dir}");
            }
        }

        $combined = rtrim($certPem) . "\n\n"
            . rtrim($caBundlePem) . "\n\n"
            . rtrim($privateKeyPem) . "\n";

        $this->writeFile($certFilePath, $combined, 0600);
    }

    /**
     * Create the HTTP file-based validation file at the web root.
     *
     * ZeroSSL expects: http://{domain}/.well-known/pki-validation/{filename}
     *
     * @param string $webrootPath       The document root of the web server.
     * @param string $validationFilename The filename provided by ZeroSSL.
     * @param string $validationContent  The content provided by ZeroSSL.
     */
    public function createValidationFile(
        string $webrootPath,
        string $validationFilename,
        string $validationContent
    ): void {
        $validationDir = rtrim($webrootPath, '/') . '/.well-known/pki-validation';
        if (!is_dir($validationDir)) {
            if (!mkdir($validationDir, 0755, true)) {
                throw new RuntimeException("Cannot create validation directory: {$validationDir}");
            }
        }
        $this->writeFile("{$validationDir}/{$validationFilename}", $validationContent, 0644);
    }

    /**
     * Remove the HTTP validation file after certificate issuance.
     */
    public function removeValidationFile(string $webrootPath, string $validationFilename): void
    {
        $filePath = rtrim($webrootPath, '/') . '/.well-known/pki-validation/' . $validationFilename;
        if (file_exists($filePath)) {
            unlink($filePath);
        }
    }

    /**
     * Execute a shell command and return its output and exit code.
     *
     * Execution modes (first match wins):
     *   1. SSH  — $sshHost is set: connects to the remote host and runs the
     *             command.  Authentication order:
     *             a) PHP ssh2 extension (password or key-based) — no external binary needed.
     *             b) sshpass binary (searched in common paths) + openssh client.
     *             c) Plain openssh client (key / agent — only when no password given).
     *   2. Sudo — $sshHost is empty but $sshPassword is set: runs the command
     *             locally via "sudo -S", feeding the password through a pipe.
     *   3. Local — no credentials: runs as the current PHP process user.
     *
     * @param string $command      Shell command to execute.
     * @param string $sshHost      Remote host (or empty for local execution).
     * @param string $sshUser      SSH / sudo username (defaults to "root" for SSH).
     * @param string $sshPassword  Password for SSH or sudo (leave empty for key-based SSH).
     * @return array{output: string, exit_code: int}
     */
    public function executeCommand(
        string $command,
        string $sshHost = '',
        string $sshUser = '',
        string $sshPassword = ''
    ): array {
        if (empty(trim($command))) {
            return ['output' => '', 'exit_code' => 0];
        }

        if (!empty($sshHost)) {
            return $this->executeViaSsh($command, $sshHost, $sshUser, $sshPassword);
        }

        if (!empty($sshPassword)) {
            return $this->executeViaSudo($command, $sshUser, $sshPassword);
        }

        // ── Local execution as current user ───────────────────────────────
        $out      = [];
        $exitCode = 0;
        exec(escapeshellcmd($command) . ' 2>&1', $out, $exitCode);
        return ['output' => implode("\n", $out), 'exit_code' => $exitCode];
    }

    // ------------------------------------------------------------------
    // Private SSH / sudo helpers
    // ------------------------------------------------------------------

    /**
     * Run a command on a remote host via SSH.
     *
     * Tries (in order):
     *   1. PHP ssh2 extension — no external binary required.
     *   2. sshpass + ssh      — searched in common PATH locations.
     *   3. Plain ssh          — usable when no password is required (key/agent auth).
     *
     * @return array{output: string, exit_code: int}
     */
    private function executeViaSsh(
        string $command,
        string $host,
        string $user,
        string $password
    ): array {
        $user = !empty($user) ? $user : 'root';

        // ── Strategy 1: PHP ssh2 extension ────────────────────────────────
        if (extension_loaded('ssh2')) {
            return $this->executeViaSsh2Extension($command, $host, $user, $password);
        }

        // ── Strategy 2: sshpass binary ────────────────────────────────────
        if (!empty($password)) {
            $sshpass = $this->findBinary('sshpass');
            if ($sshpass !== null) {
                $ssh = $this->findBinary('ssh') ?? 'ssh';
                $sshCmd = $ssh
                    . ' -o StrictHostKeyChecking=no'
                    . ' -o UserKnownHostsFile=/dev/null'
                    . ' -o LogLevel=ERROR'
                    . ' -o ConnectTimeout=10 '
                    . escapeshellarg("{$user}@{$host}") . ' '
                    . escapeshellarg($command);
                $fullCmd = $sshpass . ' -p ' . escapeshellarg($password) . ' ' . $sshCmd . ' 2>&1';
                $out      = [];
                $exitCode = 0;
                exec($fullCmd, $out, $exitCode);
                return ['output' => implode("\n", $out), 'exit_code' => $exitCode];
            }

            // sshpass not found and password was supplied — abort with a clear message
            return [
                'output'    => 'SSH with password requires either the PHP ssh2 extension'
                             . ' (php-ssh2) or the sshpass utility to be installed on the server.',
                'exit_code' => 127,
            ];
        }

        // ── Strategy 3: plain ssh (key / agent-based) ─────────────────────
        $ssh = $this->findBinary('ssh') ?? 'ssh';
        $fullCmd = $ssh
            . ' -o StrictHostKeyChecking=no'
            . ' -o UserKnownHostsFile=/dev/null'
            . ' -o LogLevel=ERROR'
            . ' -o ConnectTimeout=10 '
            . escapeshellarg("{$user}@{$host}") . ' '
            . escapeshellarg($command) . ' 2>&1';
        $out      = [];
        $exitCode = 0;
        exec($fullCmd, $out, $exitCode);
        return ['output' => implode("\n", $out), 'exit_code' => $exitCode];
    }

    /**
     * Use PHP's ssh2 extension to run a command on a remote host.
     *
     * @return array{output: string, exit_code: int}
     */
    private function executeViaSsh2Extension(
        string $command,
        string $host,
        string $user,
        string $password
    ): array {
        $conn = @ssh2_connect($host, 22);
        if ($conn === false) {
            return ['output' => "SSH: Could not connect to {$host}", 'exit_code' => 1];
        }

        if (!empty($password)) {
            if (!@ssh2_auth_password($conn, $user, $password)) {
                return ['output' => "SSH: Password authentication failed for {$user}@{$host}", 'exit_code' => 1];
            }
        } elseif (!@ssh2_auth_agent($conn, $user)) {
            return ['output' => "SSH: Agent/key authentication failed for {$user}@{$host}", 'exit_code' => 1];
        }

        $stream = @ssh2_exec($conn, $command . ' 2>&1');
        if ($stream === false) {
            return ['output' => 'SSH: Failed to execute remote command', 'exit_code' => 1];
        }

        stream_set_blocking($stream, true);
        $output = (string) stream_get_contents($stream);
        fclose($stream);

        return ['output' => rtrim($output), 'exit_code' => 0];
    }

    /**
     * Run a command locally via sudo, feeding the password through a pipe.
     *
     * Uses proc_open so the password goes directly to sudo's stdin without
     * being visible in the process list (avoids "echo pass | sudo").
     *
     * @return array{output: string, exit_code: int}
     */
    private function executeViaSudo(string $command, string $user, string $password): array
    {
        $sudoUser = !empty($user) ? ' -u ' . escapeshellarg($user) : '';
        $fullCmd  = 'sudo -S' . $sudoUser . ' ' . escapeshellcmd($command) . ' 2>&1';

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $proc = @proc_open($fullCmd, $descriptors, $pipes);
        if (!is_resource($proc)) {
            return ['output' => 'Failed to start sudo process', 'exit_code' => 1];
        }

        fwrite($pipes[0], $password . "\n");
        fclose($pipes[0]);

        $stdout = (string) stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        fclose($pipes[2]);

        $exitCode = proc_close($proc);

        $combined = rtrim($stdout . ($stderr ? "\n" . $stderr : ''));
        return ['output' => $combined, 'exit_code' => $exitCode];
    }

    /**
     * Find the full path of a system binary by checking common directories
     * and then falling back to `which`.
     */
    private function findBinary(string $name): ?string
    {
        $candidates = [
            "/usr/bin/{$name}",
            "/bin/{$name}",
            "/usr/local/bin/{$name}",
            "/usr/sbin/{$name}",
        ];
        foreach ($candidates as $path) {
            if (is_executable($path)) {
                return $path;
            }
        }
        // `which` fallback
        $found = trim((string) shell_exec('which ' . escapeshellarg($name) . ' 2>/dev/null'));
        return ($found !== '' && is_executable($found)) ? $found : null;
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    private function writeFile(string $path, string $content, int $mode): void
    {
        if (file_put_contents($path, $content) === false) {
            throw new RuntimeException("Cannot write file: {$path}");
        }
        chmod($path, $mode);
    }

    private function buildOpenSSLConfig(string $sanList): ?string
    {
        $tmpFile = tempnam(sys_get_temp_dir(), 'openssl_');
        if ($tmpFile === false) {
            return null;
        }
        $config = <<<EOT
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]

[v3_req]
subjectAltName = {$sanList}
EOT;
        file_put_contents($tmpFile, $config);
        return $tmpFile;
    }

    private function cleanupTmpConfig(?string $path): void
    {
        if ($path && file_exists($path)) {
            unlink($path);
        }
    }
}
