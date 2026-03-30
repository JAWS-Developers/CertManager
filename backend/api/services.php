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
            case 'create':
                $required = ['name', 'domains', 'cert_path'];
                foreach ($required as $field) {
                    if (empty($input[$field])) {
                        http_response_code(400);
                        echo json_encode(['success' => false, 'error' => "Field '{$field}' is required"]);
                        exit;
                    }
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
