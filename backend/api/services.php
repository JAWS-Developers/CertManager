<?php

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/Services.php';

$services = new Services(SERVICES_FILE);

$method = $_SERVER['REQUEST_METHOD'];
$input  = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($method) {
    case 'GET':
        $id = $_GET['id'] ?? null;
        if ($id) {
            $service = $services->getById($id);
            if (!$service) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Service not found']);
                exit;
            }
            echo json_encode(['success' => true, 'service' => $service]);
        } else {
            echo json_encode(['success' => true, 'services' => $services->getAll()]);
        }
        break;

    case 'POST':
        $action = $input['action'] ?? 'create';

        switch ($action) {
            case 'validate_paths':
                $certPath   = $input['cert_path'] ?? '';
                $webrootPath = $input['webroot_path'] ?? '';
                $verMethod  = $input['verification_method'] ?? 'http';

                $result = ['success' => true, 'cert_path' => null, 'webroot_path' => null];

                if ($certPath !== '') {
                    $result['cert_path'] = validatePath($certPath, 'cert');
                }
                if ($webrootPath !== '' && $verMethod === 'http') {
                    $result['webroot_path'] = validatePath($webrootPath, 'webroot');
                }

                echo json_encode($result);
                break;

            case 'create':
                $required = ['name', 'domains', 'cert_path'];
                foreach ($required as $field) {
                    if (empty($input[$field])) {
                        http_response_code(400);
                        echo json_encode(['success' => false, 'error' => "Field '{$field}' is required"]);
                        exit;
                    }
                }

                // Validate paths before persisting
                $pathErrors = collectPathErrors($input);
                if ($pathErrors) {
                    http_response_code(422);
                    echo json_encode(['success' => false, 'error' => implode(' | ', $pathErrors), 'path_errors' => $pathErrors]);
                    exit;
                }

                $service = $services->create($input);
                echo json_encode(['success' => true, 'service' => $service]);
                break;

            case 'update':
                $id = $input['id'] ?? null;
                if (!$id) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Service ID is required']);
                    exit;
                }

                // Validate paths before persisting
                $pathErrors = collectPathErrors($input);
                if ($pathErrors) {
                    http_response_code(422);
                    echo json_encode(['success' => false, 'error' => implode(' | ', $pathErrors), 'path_errors' => $pathErrors]);
                    exit;
                }

                $updated = $services->update($id, $input);
                if (!$updated) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Service not found']);
                    exit;
                }
                echo json_encode(['success' => true, 'service' => $updated]);
                break;

            case 'delete':
                $id = $input['id'] ?? null;
                if (!$id) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Service ID is required']);
                    exit;
                }
                $deleted = $services->delete($id);
                if (!$deleted) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Service not found']);
                    exit;
                }
                echo json_encode(['success' => true]);
                break;

            default:
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Unknown action']);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
}

// ---------------------------------------------------------------------------
// Path validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a single filesystem path.
 *
 * For 'cert' paths the directory may not exist yet; in that case the parent
 * directory must exist and be writable so that CertManager can create it.
 *
 * For 'webroot' paths the directory must already exist and be writable.
 *
 * @return array{valid: bool, exists: bool, writable: bool, error?: string, note?: string}
 */
function validatePath(string $path, string $type = 'cert'): array
{
    $path = rtrim($path, '/');

    if ($type === 'webroot') {
        if (!is_dir($path)) {
            return [
                'valid'    => false,
                'exists'   => false,
                'writable' => false,
                'error'    => "Webroot directory does not exist: {$path}",
            ];
        }
        if (!is_writable($path)) {
            return [
                'valid'    => false,
                'exists'   => true,
                'writable' => false,
                'error'    => "Webroot directory is not writable: {$path}",
            ];
        }
        return ['valid' => true, 'exists' => true, 'writable' => true];
    }

    // cert_path: directory may not exist yet
    if (is_dir($path)) {
        if (!is_writable($path)) {
            return [
                'valid'    => false,
                'exists'   => true,
                'writable' => false,
                'error'    => "Certificate directory is not writable: {$path}",
            ];
        }
        return ['valid' => true, 'exists' => true, 'writable' => true];
    }

    if (file_exists($path)) {
        return [
            'valid'    => false,
            'exists'   => true,
            'writable' => false,
            'error'    => "Path exists but is not a directory: {$path}",
        ];
    }

    // Directory doesn't exist – check that the parent is writable
    $parent = dirname($path);
    if (!is_dir($parent)) {
        return [
            'valid'    => false,
            'exists'   => false,
            'writable' => false,
            'error'    => "Parent directory does not exist: {$parent}",
        ];
    }
    if (!is_writable($parent)) {
        return [
            'valid'    => false,
            'exists'   => false,
            'writable' => false,
            'error'    => "Parent directory is not writable (cannot create {$path}): {$parent}",
        ];
    }
    return [
        'valid'    => true,
        'exists'   => false,
        'writable' => true,
        'note'     => "Directory will be created automatically: {$path}",
    ];
}

/**
 * Run all relevant path checks for a service payload and return a list of
 * human-readable error messages (empty array = all OK).
 */
function collectPathErrors(array $input): array
{
    $errors    = [];
    $certPath  = $input['cert_path'] ?? '';
    $webroot   = $input['webroot_path'] ?? '';
    $verMethod = $input['verification_method'] ?? 'http';

    if ($certPath !== '') {
        $check = validatePath($certPath, 'cert');
        if (!$check['valid']) {
            $errors[] = $check['error'];
        }
    }

    if ($verMethod === 'http' && $webroot !== '') {
        $check = validatePath($webroot, 'webroot');
        if (!$check['valid']) {
            $errors[] = $check['error'];
        }
    }

    return $errors;
}

