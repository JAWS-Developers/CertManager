<?php
echo phpinfo();

if (!extension_loaded('openssl')) {
    throw new Exception('This app needs the Open SSL PHP extension.');
} else {
    echo 'Open SSL PHP extension is loaded.';
}
