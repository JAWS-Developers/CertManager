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
     *   1. SSH  — $sshHost is set: run the command on a remote host via SSH.
     *             If $sshPassword is also set, authentication uses sshpass(1);
     *             otherwise key-based authentication is assumed.
     *   2. Sudo — $sshHost is empty but $sshPassword is set: run the command
     *             on the local machine via "sudo -S" (reads password from stdin).
     *   3. Local — no credentials: run as the current PHP process user (legacy
     *             behaviour, useful when the web server already has permission or
     *             when a sudoers NOPASSWD rule is in place).
     *
     * @param string $command      Shell command to execute.
     * @param string $sshHost      Remote host (or empty for local execution).
     * @param string $sshUser      SSH / sudo username (defaults to "root" for SSH).
     * @param string $sshPassword  SSH or sudo password (leave empty for key-based SSH).
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

        $output   = [];
        $exitCode = 0;

        if (!empty($sshHost)) {
            // ── Remote execution via SSH ───────────────────────────────────
            $user    = !empty($sshUser) ? $sshUser : 'root';
            $sshBase = 'HOME=/tmp /usr/bin/ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 '
                . escapeshellarg("{$user}@{$sshHost}") . ' '
                . escapeshellarg($command) . ' 2>&1';

            $fullCmd = '/bin/sshpass -p '
                . escapeshellarg($sshPassword) . ' ' . $sshBase;

            exec($fullCmd, $output, $exitCode);
        } elseif (!empty($sshPassword)) {
            // ── Local execution with sudo ──────────────────────────────────
            $sudoUser = !empty($sshUser) ? ' -u ' . escapeshellarg($sshUser) : '';
            $fullCmd  = 'echo ' . escapeshellarg($sshPassword)
                . ' | sudo -S' . $sudoUser . ' '
                . escapeshellcmd($command) . ' 2>&1';
            exec($fullCmd, $output, $exitCode);
        } else {
            // ── Local execution as current user ────────────────────────────
            exec(escapeshellcmd($command) . ' 2>&1', $output, $exitCode);
        }

        return [
            'output'    => implode("\n", $output),
            'exit_code' => $exitCode,
        ];
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
