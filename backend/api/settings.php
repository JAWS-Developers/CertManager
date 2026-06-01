<?php

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/ImapMailbox.php';

$method = $_SERVER['REQUEST_METHOD'];
$input  = json_decode(file_get_contents('php://input'), true) ?? [];

// Keys that are persisted to settings.json (all others are silently ignored)
$SETTINGS_ALLOWED = [
    'zerossl_api_key',
    'imap_host',
    'imap_port',
    'imap_encryption',
    'imap_username',
    'imap_password',
];

function loadSettings(): array
{
    if (!file_exists(SETTINGS_FILE)) {
        return [];
    }
    $raw  = file_get_contents(SETTINGS_FILE);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function saveSettingsData(array $settings): void
{
    file_put_contents(SETTINGS_FILE, json_encode($settings, JSON_PRETTY_PRINT));
}

switch ($method) {
    case 'GET':
        $settings = loadSettings();
        $masked   = $settings;

        // ZeroSSL API key masking
        if (!empty($masked['zerossl_api_key'])) {
            $key = $masked['zerossl_api_key'];
            $len = strlen($key);
            $masked['zerossl_api_key_masked'] = $len <= 8
                ? str_repeat('*', $len)
                : substr($key, 0, 4) . str_repeat('*', $len - 8) . substr($key, -4);
            $masked['has_api_key'] = true;
        } else {
            $masked['has_api_key'] = false;
        }
        unset($masked['zerossl_api_key']);

        // IMAP password masking
        $masked['has_imap_config'] = !empty($settings['imap_host']) && !empty($settings['imap_username']);
        if (!empty($masked['imap_password'])) {
            $masked['imap_password_masked'] = '••••••••';
        }
        unset($masked['imap_password']);

        echo json_encode(['success' => true, 'settings' => $masked]);
        break;

    case 'POST':
        $action = $input['action'] ?? 'save';

        if ($action === 'test_imap') {
            handleTestImap($input);
            break;
        }

        // Save settings — only allowed keys, don't overwrite password with empty string
        global $SETTINGS_ALLOWED;
        $current = loadSettings();
        $patch   = array_intersect_key($input, array_flip($SETTINGS_ALLOWED));

        if (array_key_exists('imap_password', $patch) && $patch['imap_password'] === '') {
            unset($patch['imap_password']);
        }

        saveSettingsData(array_merge($current, $patch));
        echo json_encode(['success' => true, 'message' => 'Settings saved']);
        break;

    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
}

// ---------------------------------------------------------------------------

function handleTestImap(array $input): void
{
    $settings   = loadSettings();
    $host       = $input['imap_host']       ?? $settings['imap_host']       ?? '';
    $port       = (int) ($input['imap_port'] ?? $settings['imap_port']      ?? 993);
    $encryption = $input['imap_encryption'] ?? $settings['imap_encryption'] ?? 'ssl';
    $username   = $input['imap_username']   ?? $settings['imap_username']   ?? '';
    $password   = $input['imap_password']   ?? $settings['imap_password']   ?? '';

    if (empty($host) || empty($username) || empty($password)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'IMAP host, username, and password are required']);
        return;
    }

    try {
        $imap = new ImapMailbox($host, $port, $encryption, $username, $password);
        $info = $imap->testConnection();
        echo json_encode([
            'success' => true,
            'message' => "Connected successfully. Mailbox has {$info['nmsgs']} message(s), {$info['recent']} recent.",
            'info'    => $info,
        ]);
    } catch (Throwable $e) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}
