<?php

require_once __DIR__ . '/../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$input  = json_decode(file_get_contents('php://input'), true) ?? [];

function loadSettings(): array
{
    if (!file_exists(SETTINGS_FILE)) {
        return ['zerossl_api_key' => ''];
    }
    $raw = file_get_contents(SETTINGS_FILE);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : ['zerossl_api_key' => ''];
}

function saveSettings(array $settings): void
{
    file_put_contents(SETTINGS_FILE, json_encode($settings, JSON_PRETTY_PRINT));
}

switch ($method) {
    case 'GET':
        $settings = loadSettings();
        // Mask the API key for display
        $masked = $settings;
        if (!empty($masked['zerossl_api_key'])) {
            $key = $masked['zerossl_api_key'];
            $len = strlen($key);
            if ($len <= 8) {
                $masked['zerossl_api_key_masked'] = str_repeat('*', $len);
            } else {
                $masked['zerossl_api_key_masked'] = substr($key, 0, 4) . str_repeat('*', $len - 8) . substr($key, -4);
            }
            $masked['has_api_key'] = true;
        } else {
            $masked['has_api_key'] = false;
        }
        echo json_encode(['success' => true, 'settings' => $masked]);
        break;

    case 'POST':
        $current  = loadSettings();
        $updated  = array_merge($current, array_intersect_key($input, ['zerossl_api_key' => true]));
        saveSettings($updated);
        echo json_encode(['success' => true, 'message' => 'Settings saved']);
        break;

    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
}
