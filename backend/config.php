<?php

define('DATA_DIR', __DIR__ . '/data/');
define('SERVICES_FILE', DATA_DIR . 'services.json');
define('SETTINGS_FILE', DATA_DIR . 'settings.json');
define('ZEROSSL_API_BASE', 'https://api.zerossl.com');

// CORS headers for development
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
