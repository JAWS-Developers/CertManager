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
                $certPath    = $input['cert_path'] ?? '';
                $webrootPath = $input['webroot_path'] ?? '';
                $verMethod   = $input['verification_method'] ?? 'http';
                $splitFiles  = !empty($input['split_files']);
                $caPath      = $input['ca_path'] ?? '';
                $keyPath     = $input['key_path'] ?? '';

                $result = [
                    'success'      => true,
                    'cert_path'    => null,
                    'ca_path'      => null,
                    'key_path'     => null,
                    'webroot_path' => null,
                ];

                if ($certPath !== '') {
                    $result['cert_path'] = validatePath($certPath, 'cert');
                }
                if ($webrootPath !== '' && $verMethod === 'http') {
                    $result['webroot_path'] = validatePath($webrootPath, 'webroot');
                }
                if ($splitFiles) {
                    if ($caPath !== '') {
                        $result['ca_path'] = validatePath($caPath, 'cert');
                    }
                    if ($keyPath !== '') {
                        $result['key_path'] = validatePath($keyPath, 'cert');
                    }
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
 * For 'cert' paths the value is a *full file path* (not a directory).
 *   - If the file already exists it must be writable.
 *   - If the file does not exist the parent directory must exist and be writable.
 *   - The basename must be non-empty (i.e. the path must include a filename).
 *
 * For 'webroot' paths the directory must already exist and be writable.
 *
 * @return array{valid: bool, exists: bool, writable: bool, error?: string, note?: string}
 */
function validatePath(string $path, string $type = 'cert'): array
{
    $path = rtrim($path, '/');

    if ($type === 'cert') {
        // Ensure the path includes a filename (basename must be non-empty and
        // not the same as the directory portion).
        $basename = basename($path);
        if ($basename === '' || $basename === '.') {
            return [
                'valid'    => false,
                'exists'   => false,
                'writable' => false,
                'error'    => 'Certificate path must include a filename (e.g. /etc/nginx/ssl/mysite.pem)',
            ];
        }

        // File already exists — must be writable
        if (file_exists($path)) {
            if (!is_writable($path)) {
                return [
                    'valid'    => false,
                    'exists'   => true,
                    'writable' => false,
                    'error'    => "Certificate file is not writable: {$path}",
                ];
            }
            return ['valid' => true, 'exists' => true, 'writable' => true];
        }

        // File doesn't exist — check parent directory
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
                'error'    => "Parent directory is not writable (cannot create file): {$parent}",
            ];
        }
        return [
            'valid'    => true,
            'exists'   => false,
            'writable' => true,
            'note'     => "File will be created: {$path}",
        ];
    }

    // ── webroot ───────────────────────────────────────────────────────────
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

/**
 * Run all relevant path checks for a service payload and return a list of
 * human-readable error messages (empty array = all OK).
 */
function collectPathErrors(array $input): array
{
    $errors     = [];
    $certPath   = $input['cert_path'] ?? '';
    $webroot    = $input['webroot_path'] ?? '';
    $verMethod  = $input['verification_method'] ?? 'http';
    $splitFiles = !empty($input['split_files']);

    if ($certPath !== '') {
        $check = validatePath($certPath, 'cert');
        if (!$check['valid']) {
            $errors[] = $check['error'];
        }
    }

    if ($splitFiles) {
        foreach (['ca_path', 'key_path'] as $field) {
            $path = $input[$field] ?? '';
            if ($path !== '') {
                $check = validatePath($path, 'cert');
                if (!$check['valid']) {
                    $errors[] = $check['error'];
                }
            }
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

