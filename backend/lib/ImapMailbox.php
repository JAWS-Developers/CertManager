<?php

/**
 * IMAP mailbox helper for automatically processing ZeroSSL domain-verification
 * emails.
 *
 * Requires the PHP `imap` extension (php-imap / php8.x-imap).
 */
class ImapMailbox
{
    private string $host;
    private int    $port;
    private string $encryption; // 'ssl' | 'tls' | 'none'
    private string $username;
    private string $password;
    private string $folder;

    public function __construct(
        string $host,
        int    $port,
        string $encryption,
        string $username,
        string $password,
        string $folder = 'INBOX'
    ) {
        $this->host       = $host;
        $this->port       = $port;
        $this->encryption = strtolower($encryption);
        $this->username   = $username;
        $this->password   = $password;
        $this->folder     = $folder;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Open the mailbox, find every unseen ZeroSSL verification email, click
     * the verification link inside each one, and mark the email as seen.
     *
     * @return array<int, array{url: string, success: bool, message: string}>
     * @throws RuntimeException when the IMAP extension is missing or the
     *                          connection fails.
     */
    public function processVerificationEmails(): array
    {
        $this->requireImapExtension();

        $connection = $this->openConnection();

        try {
            $results = $this->findAndProcessLinks($connection);
        } finally {
            @imap_close($connection, CL_EXPUNGE);
        }

        return $results;
    }

    /**
     * Test the IMAP connection and return basic mailbox statistics.
     *
     * @return array{mailbox: string, nmsgs: int, recent: int}
     * @throws RuntimeException on failure.
     */
    public function testConnection(): array
    {
        $this->requireImapExtension();

        $connection = $this->openConnection();
        $check      = imap_check($connection);
        @imap_close($connection);

        return [
            'mailbox' => $check->Mailbox ?? $this->buildMailboxString(),
            'nmsgs'   => $check->Nmsgs   ?? 0,
            'recent'  => $check->Recent  ?? 0,
        ];
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /** @throws RuntimeException */
    private function requireImapExtension(): void
    {
        if (!function_exists('imap_open')) {
            throw new RuntimeException(
                'PHP IMAP extension is not available. ' .
                'Install php-imap (e.g. apt install php-imap) and restart PHP.'
            );
        }
    }

    /** @return resource */
    private function openConnection()
    {
        // Disable PHP warnings; capture error via imap_last_error()
        $connection = @imap_open(
            $this->buildMailboxString(),
            $this->username,
            $this->password,
            0,
            1
        );

        if ($connection === false) {
            throw new RuntimeException(
                'IMAP connection failed: ' . (imap_last_error() ?: 'unknown error')
            );
        }

        return $connection;
    }

    private function buildMailboxString(): string
    {
        $flags = '/imap';

        switch ($this->encryption) {
            case 'ssl':
                $flags .= '/ssl';
                break;
            case 'tls':
                $flags .= '/tls';
                break;
            default:
                $flags .= '/notls';
        }

        return '{' . $this->host . ':' . $this->port . $flags . '}' . $this->folder;
    }

    /**
     * @param resource $connection
     * @return array<int, array{url: string, success: bool, message: string}>
     */
    private function findAndProcessLinks($connection): array
    {
        // Search for unseen messages whose sender contains "trust-provider.com"
        $uids = @imap_search($connection, 'FROM "trust-provider.com" UNSEEN', SE_UID);

        if (empty($uids)) {
            return [];
        }

        $processed = [];

        foreach ($uids as $uid) {
            $body  = $this->fetchBody($connection, $uid);
            $links = $this->extractVerificationLinks($body);

            foreach ($links as $url) {
                $clickResult = $this->clickVerificationLink($url);
                $processed[] = [
                    'url'     => $url,
                    'success' => $clickResult['success'],
                    'message' => $clickResult['message'],
                ];
            }

            // Mark the message as seen so we won't process it again
            @imap_setflag_full($connection, (string) $uid, '\\Seen', ST_UID);
        }

        return $processed;
    }

    /**
     * Fetch and decode the full text body of a message (plain text + HTML parts).
     *
     * @param resource $connection
     */
    private function fetchBody($connection, int $uid): string
    {
        $structure = imap_fetchstructure($connection, $uid, FT_UID);
        $body      = '';

        if (!empty($structure->parts)) {
            foreach ($structure->parts as $index => $part) {
                $sectionNum = $index + 1;
                $subtype    = strtolower($part->subtype ?? '');

                if ($subtype === 'plain' || $subtype === 'html') {
                    $raw   = imap_fetchbody($connection, $uid, (string) $sectionNum, FT_UID);
                    $body .= ' ' . $this->decodePart($raw, $part->encoding ?? ENC7BIT);
                }
            }
        } else {
            $raw  = @imap_body($connection, $uid, FT_UID);
            $body = $this->decodePart($raw ?: '', $structure->encoding ?? ENC7BIT);
        }

        return $body;
    }

    private function decodePart(string $raw, int $encoding): string
    {
        switch ($encoding) {
            case ENCBASE64:
                return base64_decode($raw);
            case ENCQUOTEDPRINTABLE:
                return quoted_printable_decode($raw);
            default:
                return $raw;
        }
    }

    /**
     * Extract ZeroSSL verification URLs from an email body (handles both HTML
     * href attributes and plain-text URLs).
     *
     * @return list<string>
     */
    private function extractVerificationLinks(string $body): array
    {
        $links = [];

        // 1. Look inside HTML href attributes first
        if (preg_match_all(
            '/href=["\']([^"\']*app\.zerossl\.com[^"\']*)["\']/',
            $body,
            $matches
        )) {
            foreach ($matches[1] as $url) {
                $links[] = html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
        }

        // 2. Also scan plain text (after stripping HTML tags)
        $plain = html_entity_decode(strip_tags($body), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        if (preg_match_all('#https://app\.zerossl\.com/[^\s\'"<>]+#i', $plain, $matches)) {
            foreach ($matches[0] as $url) {
                $url = rtrim($url, '.,;:)>"\']');
                if (!in_array($url, $links, true)) {
                    $links[] = $url;
                }
            }
        }

        // Deduplicate, validate, and restrict to the expected ZeroSSL domain
        $links = array_unique($links);

        return array_values(array_filter($links, static function (string $url): bool {
            if (!filter_var($url, FILTER_VALIDATE_URL)) {
                return false;
            }
            $host = parse_url($url, PHP_URL_HOST);
            return $host !== false && $host !== null
                && str_ends_with($host, 'zerossl.com');
        }));
    }

    /**
     * Make an HTTPS GET request to a ZeroSSL verification URL (i.e. "click" the
     * link on behalf of the user).
     *
     * @return array{success: bool, message: string, http_code?: int}
     */
    private function clickVerificationLink(string $url): array
    {
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            return ['success' => false, 'message' => "Invalid URL: {$url}"];
        }

        $host = parse_url($url, PHP_URL_HOST);
        if (!$host || !str_ends_with($host, 'zerossl.com')) {
            return ['success' => false, 'message' => "URL does not belong to zerossl.com: {$url}"];
        }

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT      => 'CertManager/1.0',
        ]);

        $response  = curl_exec($ch);
        $httpCode  = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return ['success' => false, 'message' => "cURL error: {$curlError}", 'http_code' => 0];
        }

        $success = ($httpCode >= 200 && $httpCode < 400);

        return [
            'success'   => $success,
            'message'   => ($success ? 'Clicked' : 'Failed to click') . " verification link (HTTP {$httpCode}): {$url}",
            'http_code' => $httpCode,
        ];
    }
}
