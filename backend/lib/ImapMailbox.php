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
     * Open the mailbox, find every unseen ZeroSSL verification email and
     * return their parsed contents (links, DCV code, order number) WITHOUT
     * clicking anything or marking emails as seen.
     *
     * Each item in the returned array represents one email:
     *   uid          – IMAP message UID
     *   subject      – decoded Subject header
     *   links        – list of EnterDCVCode URLs found in the email
     *   dcv_code     – DCV code extracted from the first link (if present)
     *   order_number – order number extracted from the first link (if present)
     *
     * @return array<int, array{uid: int, subject: string, links: list<string>, dcv_code: string, order_number: string}>
     * @throws RuntimeException when the IMAP extension is missing or the connection fails.
     */
    public function fetchVerificationEmails(): array
    {
        $this->requireImapExtension();
        $connection = $this->openConnection();
        try {
            $emails = $this->readEmailData($connection);
        } finally {
            @imap_close($connection);
        }
        return $emails;
    }

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
     * @return array<int, array{uid: int, subject: string, links: list<string>, dcv_code: string, order_number: string}>
     */
    private function readEmailData($connection): array
    {
        $uids = @imap_search($connection, 'FROM "noreply@trust-provider.com"', SE_UID);

        if (empty($uids)) {
            return [];
        }

        $emails = [];

        foreach ($uids as $uid) {
            $msgNo = imap_msgno($connection, $uid);
            if ($msgNo === 0) {
                continue; // UID no longer exists in this session
            }

            $headerInfo = @imap_headerinfo($connection, $msgNo);
            $subject = '';
            if ($headerInfo && !empty($headerInfo->subject)) {
                $decoded = imap_mime_header_decode($headerInfo->subject);
                foreach ($decoded as $part) {
                    $subject .= $part->text;
                }
            }

            $body  = $this->fetchBody($connection, $uid);
            $links = $this->extractVerificationLinks($body);

            if (empty($links)) {
                continue;
            }

            // Extract DCV code and order number from the first link's query string.
            // ZeroSSL/trust-provider.com uses camelCase (dcvCode, orderNumber) but
            // the casing may vary across API versions, so we check both forms.
            $dcvCode     = '';
            $orderNumber = '';
            $parsedUrl   = parse_url($links[0]);
            if (!empty($parsedUrl['query'])) {
                parse_str($parsedUrl['query'], $params);
                $dcvCode     = $params['dcvCode']     ?? $params['DcvCode']     ?? '';
                $orderNumber = $params['orderNumber'] ?? $params['ordernumber'] ?? '';
            }

            $emails[] = [
                'uid'          => $uid,
                'subject'      => $subject,
                'links'        => array_values($links),
                'dcv_code'     => $dcvCode,
                'order_number' => $orderNumber,
            ];
        }

        return $emails;
    }

    /**
     * @param resource $connection
     * @return array<int, array{url: string, success: bool, message: string}>
     */
    private function findAndProcessLinks($connection): array
    {
        // Search for unseen messages whose sender contains "trust-provider.com"
        // (ZeroSSL's Comodo/Sectigo backend) OR "zerossl.com" as a fallback.
        $uids = @imap_search($connection, 'FROM "noreply@trust-provider.com"', SE_UID);


        if (empty($uids)) {
            return [];
        }

        $processed = [];

        foreach ($uids as $uid) {
            $body  = $this->fetchBody($connection, $uid);
            $links = $this->extractVerificationLinks($body);

            // Skip emails with no actionable verification links (don't mark as seen)
            if (empty($links)) {
                continue;
            }

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
     * Extract ZeroSSL domain-verification URLs from an email body.
     *
     * ZeroSSL verification emails are sent via Comodo/Sectigo infrastructure and
     * contain links on secure.trust-provider.com. The email has two link types:
     *   • EnterDCVCode  — the URL we MUST click to confirm ownership
     *   • RejectDCVCode — the URL we must NEVER click (it cancels the certificate)
     *
     * The method handles both the HTML part (href attributes) and the plain-text
     * part of a multipart/alternative email.
     *
     * @return list<string>
     */
    private function extractVerificationLinks(string $body): array
    {
        $links = [];

        // 1. Extract from HTML href attributes — match EnterDCVCode links on
        //    trust-provider.com or app.zerossl.com (future-proof).
        if (preg_match_all(
            '/href=["\']([^"\']*(?:secure\.trust-provider\.com\/products\/EnterDCVCode|app\.zerossl\.com)[^"\']*)["\']/',
            $body,
            $matches
        )) {
            foreach ($matches[1] as $url) {
                $links[] = html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
        }

        // 2. Scan the plain-text part (after stripping HTML tags) for bare URLs.
        $plain = html_entity_decode(strip_tags($body), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // trust-provider.com EnterDCVCode links (the actual ZeroSSL email format)
        if (preg_match_all(
            '#https://secure\.trust-provider\.com/products/EnterDCVCode[^\s\'"<>]+#i',
            $plain,
            $matches
        )) {
            foreach ($matches[0] as $url) {
                $url = rtrim($url, '.,;:)>"\']');
                if (!in_array($url, $links, true)) {
                    $links[] = $url;
                }
            }
        }

        // app.zerossl.com links as a fallback for any future format changes
        if (preg_match_all('#https://app\.zerossl\.com/[^\s\'"<>]+#i', $plain, $matches)) {
            foreach ($matches[0] as $url) {
                $url = rtrim($url, '.,;:)>"\']');
                if (!in_array($url, $links, true)) {
                    $links[] = $url;
                }
            }
        }

        // Deduplicate
        $links = array_unique($links);

        // Validate URLs and restrict to the expected domains.
        // NEVER include RejectDCVCode links — clicking them cancels the certificate.
        return array_values(array_filter($links, static function (string $url): bool {
            if (!filter_var($url, FILTER_VALIDATE_URL)) {
                return false;
            }
            // Hard reject any rejection/cancellation links
            if (stripos($url, 'RejectDCVCode') !== false) {
                return false;
            }
            $host = parse_url($url, PHP_URL_HOST);
            if ($host === false || $host === null) {
                return false;
            }
            return str_ends_with($host, 'zerossl.com')
                || str_ends_with($host, 'trust-provider.com');
        }));
    }

    /**
     * Make an HTTPS GET request to a ZeroSSL/trust-provider.com verification URL
     * (i.e. "click" the EnterDCVCode link on behalf of the user).
     *
     * @return array{success: bool, message: string, http_code?: int}
     */
    private function clickVerificationLink(string $url): array
    {
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            return ['success' => false, 'message' => "Invalid URL: {$url}"];
        }

        // Safety guard: never click rejection/cancellation links
        if (stripos($url, 'RejectDCVCode') !== false) {
            return ['success' => false, 'message' => "Refused to click rejection link: {$url}"];
        }

        $host = parse_url($url, PHP_URL_HOST);
        if (
            !$host
            || (!str_ends_with($host, 'zerossl.com') && !str_ends_with($host, 'trust-provider.com'))
        ) {
            return ['success' => false, 'message' => "URL does not belong to an expected domain: {$url}"];
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
