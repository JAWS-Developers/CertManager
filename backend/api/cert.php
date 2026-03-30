<?php

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/Services.php';
require_once __DIR__ . '/../lib/ZeroSSL.php';
require_once __DIR__ . '/../lib/CertManager.php';
require_once __DIR__ . '/../lib/ImapMailbox.php';

$serviceStore = new Services(SERVICES_FILE);
$certManager  = new CertManager();

$method = $_SERVER['REQUEST_METHOD'];
$input  = json_decode(file_get_contents('php://input'), true) ?? [];

// Load ZeroSSL API key from settings
function getZeroSSL(): ZeroSSL
{
    $settingsRaw = file_get_contents(SETTINGS_FILE);
    $settings    = json_decode($settingsRaw ?? '{}', true) ?? [];
    $apiKey      = $settings['zerossl_api_key'] ?? '';
    if (empty($apiKey)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'ZeroSSL API key is not configured. Go to Settings to add it.']);
        exit;
    }
    return new ZeroSSL($apiKey);
}

switch ($method) {
    case 'GET':
        handleGet();
        break;
    case 'POST':
        handlePost($input);
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
}

// ---------------------------------------------------------------------------

function handleGet(): void
{
    global $serviceStore;
    $action    = $_GET['action'] ?? 'status';
    $serviceId = $_GET['service_id'] ?? null;

    if ($action === 'status') {
        if (!$serviceId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'service_id is required']);
            return;
        }
        $service = $serviceStore->getById($serviceId);
        if (!$service) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Service not found']);
            return;
        }
        if (empty($service['cert_id'])) {
            echo json_encode(['success' => true, 'cert_status' => 'none', 'service' => $service]);
            return;
        }

        $zerossl = getZeroSSL();
        $cert    = $zerossl->getCertificate($service['cert_id']);
        if (!empty($cert['id'])) {
            $serviceStore->update($serviceId, [
                'cert_status' => mapZeroSSLStatus($cert['status'] ?? ''),
                'cert_expiry' => $cert['expires'] ?? null,
            ]);
        }
        echo json_encode(['success' => true, 'cert' => $cert, 'service' => $serviceStore->getById($serviceId)]);
        return;
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Unknown action']);
}

// ---------------------------------------------------------------------------

function handlePost(array $input): void
{
    global $serviceStore, $certManager;

    $action    = $input['action'] ?? '';
    $serviceId = $input['service_id'] ?? null;

    if (!$serviceId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'service_id is required']);
        return;
    }

    $service = $serviceStore->getById($serviceId);
    if (!$service) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Service not found']);
        return;
    }

    switch ($action) {
        case 'request':
            actionRequest($service, $certManager);
            break;
        case 'verify':
            actionVerify($service, $certManager);
            break;
        case 'install':
            actionInstall($service, $certManager);
            break;
        case 'renew':
            actionRenew($service, $certManager);
            break;
        case 'poll_email':
            actionPollEmail($service);
            break;
        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Unknown action']);
    }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function actionRequest(array $service, CertManager $certManager): void
{
    global $serviceStore;

    $domains = $service['domains'] ?? [];
    if (empty($domains)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No domains configured for this service']);
        return;
    }

    try {
        // 1. Generate private key + CSR
        $privateKey = $certManager->generatePrivateKey();
        $csr        = $certManager->generateCSR($privateKey, $domains);

        // 2. Create certificate request on ZeroSSL
        $zerossl = getZeroSSL();
        $cert    = $zerossl->createCertificate($domains, $csr, 90);

        if (!empty($cert['error'])) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => $cert['error']['type'] ?? 'ZeroSSL error', 'details' => $cert]);
            return;
        }

        $certId            = $cert['id'] ?? null;
        $validationDetails = $cert['validation'] ?? [];

        if (!$certId) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No certificate ID returned by ZeroSSL', 'raw' => $cert]);
            return;
        }

        // 3. Store the private key and cert info
        $serviceStore->update($service['id'], [
            'cert_id'        => $certId,
            'cert_status'    => 'pending_validation',
            'private_key'    => $privateKey,
            'validation'     => $validationDetails,
            'cert_expiry'    => null,
        ]);

        // 4. Handle verification method
        $verificationMethod = $service['verification_method'] ?? 'http';

        if ($verificationMethod === 'http') {
            $result = handleHttpValidation($service, $certId, $validationDetails, $certManager, $zerossl);
            echo json_encode($result);
        } else {
            // EMAIL verification – initiate it, user checks their inbox
            $email     = $service['verification_email'] ?? '';
            $challenge = $zerossl->initiateVerification($certId, 'EMAIL', $email);
            echo json_encode([
                'success'     => true,
                'message'     => 'Verification email sent. Please check your inbox and click the link to verify ownership.',
                'cert_id'     => $certId,
                'cert_status' => 'pending_validation',
                'challenge'   => $challenge,
            ]);
        }
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function actionVerify(array $service, CertManager $certManager): void
{
    global $serviceStore;

    $certId = $service['cert_id'] ?? null;
    if (!$certId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No certificate request found for this service. Request a certificate first.']);
        return;
    }

    try {
        $zerossl           = getZeroSSL();
        $verificationMethod = $service['verification_method'] ?? 'http';
        $zsMethod          = ($verificationMethod === 'http') ? 'HTTP_CSR_HASH' : 'EMAIL';

        // Re-trigger validation if needed
        $challenge = $zerossl->verifyDomain($certId, $zsMethod);

        // Poll status
        $cert = $zerossl->getCertificate($certId);
        $status = mapZeroSSLStatus($cert['status'] ?? '');

        $serviceStore->update($service['id'], [
            'cert_status' => $status,
            'cert_expiry' => $cert['expires'] ?? null,
        ]);

        echo json_encode([
            'success'     => true,
            'cert_status' => $status,
            'cert'        => $cert,
            'challenge'   => $challenge,
        ]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function actionInstall(array $service, CertManager $certManager): void
{
    global $serviceStore;

    $certId     = $service['cert_id'] ?? null;
    $privateKey = $service['private_key'] ?? null;

    if (!$certId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No certificate request found. Request a certificate first.']);
        return;
    }
    if (!$privateKey) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Private key not found. Please request a new certificate.']);
        return;
    }

    try {
        $zerossl = getZeroSSL();

        // 1. Check that cert is issued
        $cert   = $zerossl->getCertificate($certId);
        $status = $cert['status'] ?? '';
        if ($status !== 'issued') {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error'   => "Certificate is not issued yet (status: {$status}). Verify domain ownership first.",
            ]);
            return;
        }

        // 2. Download certificate
        $download = $zerossl->downloadCertificate($certId);
        if (empty($download['certificate.crt'])) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to download certificate', 'raw' => $download]);
            return;
        }

        $certPem   = $download['certificate.crt'];
        $caBundlePem = $download['ca_bundle.crt'] ?? '';
        $certPath  = $service['cert_path'] ?? '';

        if (empty($certPath)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Certificate path is not configured']);
            return;
        }

        // 3. Write files to disk
        $certManager->installCertificate($certPem, $caBundlePem, $privateKey, $certPath);

        // 4. Execute restart command
        $restartCommand = $service['restart_command'] ?? '';
        $cmdResult      = $certManager->executeCommand($restartCommand);

        // 5. Clean up HTTP validation file if present
        $webrootPath = $service['webroot_path'] ?? '';
        $validation  = $service['validation'] ?? [];
        $filename    = extractValidationFilename($validation, $service['domains'][0] ?? '');
        if ($webrootPath && $filename) {
            $certManager->removeValidationFile($webrootPath, $filename);
        }

        // 6. Update service record
        $serviceStore->update($service['id'], [
            'cert_status' => 'issued',
            'cert_expiry' => $cert['expires'] ?? null,
        ]);

        echo json_encode([
            'success'          => true,
            'message'          => 'Certificate installed successfully',
            'cert_expiry'      => $cert['expires'] ?? null,
            'restart_output'   => $cmdResult['output'],
            'restart_exit_code' => $cmdResult['exit_code'],
        ]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function actionRenew(array $service, CertManager $certManager): void
{
    global $serviceStore;

    // Cancel old cert if still pending
    $oldCertId = $service['cert_id'] ?? null;
    if ($oldCertId) {
        try {
            $zerossl = getZeroSSL();
            $oldCert = $zerossl->getCertificate($oldCertId);
            if (in_array($oldCert['status'] ?? '', ['draft', 'pending_validation'], true)) {
                $zerossl->cancelCertificate($oldCertId);
            }
        } catch (Throwable) {
            // Best effort – continue even if cancel fails
        }
    }

    // Clear old cert data and request a fresh certificate
    $serviceStore->update($service['id'], [
        'cert_id'     => null,
        'cert_status' => 'none',
        'private_key' => null,
        'validation'  => null,
    ]);

    // Reload updated service and request a new one
    $updatedService = $serviceStore->getById($service['id']);
    actionRequest($updatedService, $certManager);
}

// ---------------------------------------------------------------------------

function actionPollEmail(array $service): void
{
    global $serviceStore;

    $settingsRaw = @file_get_contents(SETTINGS_FILE);
    $settings    = json_decode($settingsRaw ?: '{}', true) ?? [];

    $host       = $settings['imap_host']       ?? '';
    $port       = (int) ($settings['imap_port'] ?? 993);
    $encryption = $settings['imap_encryption'] ?? 'ssl';
    $username   = $settings['imap_username']   ?? '';
    $password   = $settings['imap_password']   ?? '';

    if (empty($host) || empty($username) || empty($password)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error'   => 'IMAP mailbox is not configured. Go to Settings to set up the verification inbox.',
        ]);
        return;
    }

    try {
        $imap    = new ImapMailbox($host, $port, $encryption, $username, $password);
        $results = $imap->processVerificationEmails();

        // Re-check cert status on ZeroSSL after clicking any links
        $certId     = $service['cert_id'] ?? null;
        $certStatus = $service['cert_status'];
        $certExpiry = $service['cert_expiry'] ?? null;

        if ($certId) {
            $zerossl    = getZeroSSL();
            $cert       = $zerossl->getCertificate($certId);
            $certStatus = mapZeroSSLStatus($cert['status'] ?? '');
            $certExpiry = $cert['expires'] ?? null;
            $serviceStore->update($service['id'], [
                'cert_status' => $certStatus,
                'cert_expiry' => $certExpiry,
            ]);
        }

        $found   = count($results);
        $clicked = count(array_filter($results, fn($r) => $r['success']));

        $message = $found > 0
            ? "Processed {$clicked}/{$found} verification link(s). Certificate status: {$certStatus}."
            : 'No new ZeroSSL verification emails found in the inbox. The email may not have arrived yet — try again in a moment.';

        echo json_encode([
            'success'       => true,
            'message'       => $message,
            'cert_status'   => $certStatus,
            'links_found'   => $found,
            'links_clicked' => $clicked,
            'details'       => $results,
            'resluts'       => $results,
        ]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleHttpValidation(
    array $service,
    string $certId,
    array $validationDetails,
    CertManager $certManager,
    ZeroSSL $zerossl
): array {
    global $serviceStore;

    // Initiate HTTP_CSR_HASH challenge
    $challenge = $zerossl->initiateVerification($certId, 'HTTP_CSR_HASH');

    // Extract file info from validation details
    $domain   = $service['domains'][0] ?? '';
    $domainValidation = $validationDetails['other_methods'][$domain] ?? $validationDetails['other_methods'][array_key_first($validationDetails['other_methods'] ?? [])] ?? null;

    $filename = null;
    $content  = null;

    if ($domainValidation) {
        $fileUrl = $domainValidation['file_validation_url_http'] ?? $domainValidation['file_validation_url_https'] ?? '';
        $parts   = explode('/', $fileUrl);
        $filename = end($parts);
        $content  = implode("\n", $domainValidation['file_validation_content'] ?? []);
    }

    // Fallback: parse from challenge response
    if (!$filename && !empty($challenge['details'])) {
        foreach ($challenge['details'] as $domainChallenge) {
            if (!empty($domainChallenge['file_validation_url_http'])) {
                $parts   = explode('/', $domainChallenge['file_validation_url_http']);
                $filename = end($parts);
                $content  = implode("\n", $domainChallenge['file_validation_content'] ?? []);
                break;
            }
        }
    }

    $webrootPath = $service['webroot_path'] ?? '';
    if ($webrootPath && $filename && $content) {
        $certManager->createValidationFile($webrootPath, $filename, $content);
        $serviceStore->update($service['id'], [
            'validation_filename' => $filename,
        ]);

        return [
            'success'     => true,
            'message'     => 'Validation file created. Waiting for ZeroSSL to verify it (this may take a few minutes).',
            'cert_id'     => $certId,
            'cert_status' => 'pending_validation',
            'validation_url' => "http://{$domain}/.well-known/pki-validation/{$filename}",
        ];
    }

    return [
        'success'     => true,
        'message'     => 'Certificate request created. Please verify domain ownership manually.',
        'cert_id'     => $certId,
        'cert_status' => 'pending_validation',
        'challenge'   => $challenge,
        'validation'  => $validationDetails,
    ];
}

function mapZeroSSLStatus(string $status): string
{
    return match ($status) {
        'draft', 'pending_validation' => 'pending_validation',
        'issued'                       => 'issued',
        'cancelled', 'revoked'         => 'cancelled',
        'expiring_soon'                => 'expiring_soon',
        default                        => $status ?: 'none',
    };
}

function extractValidationFilename(array $validation, string $domain): ?string
{
    $domainValidation = $validation['other_methods'][$domain] ?? null;
    if (!$domainValidation) {
        return null;
    }
    $fileUrl = $domainValidation['file_validation_url_http'] ?? '';
    if (!$fileUrl) {
        return null;
    }
    $parts = explode('/', $fileUrl);
    return end($parts) ?: null;
}
