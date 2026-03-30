<?php

class ZeroSSL
{
    private string $apiKey;
    private string $apiBase;

    public function __construct(string $apiKey, string $apiBase = ZEROSSL_API_BASE)
    {
        $this->apiKey  = $apiKey;
        $this->apiBase = rtrim($apiBase, '/');
    }

    /**
     * Create a new certificate request.
     *
     * @param array  $domains  List of domains (first is the primary CN).
     * @param string $csr      PEM-encoded Certificate Signing Request.
     * @param int    $days     Validity in days (30 or 90 for free tier).
     */
    public function createCertificate(array $domains, string $csr, int $days = 90): array
    {
        $payload = [
            'certificate_domains'      => implode(',', $domains),
            'certificate_validity_days' => $days,
            'certificate_csr'           => $csr,
        ];
        return $this->request('POST', '/certificates', $payload);
    }

    /**
     * Initiate domain validation.
     *
     * @param string       $certId          ZeroSSL certificate ID.
     * @param string       $method          EMAIL | HTTP_CSR_HASH | CNAME_CSR_HASH
     * @param string|array $validationEmail For EMAIL method: a single email address,
     *                                      or an associative array [domain => email]
     *                                      (only the first value is used; the
     *                                      /challenges endpoint requires a flat
     *                                      validation_email=email parameter).
     */
    public function initiateVerification(string $certId, string $method, string|array $validationEmail = '', array $domains = []): array
    {
        $payload = ['validation_method' => $method];

        if ($method === 'EMAIL') {
            // The /challenges endpoint only accepts a flat validation_email=email
            // parameter — per-domain bracket keys cause missing_validation_email.
            if (is_string($validationEmail) && $validationEmail !== '') {
                $payload['validation_email'] = $validationEmail;
            } elseif (is_array($validationEmail) && !empty($validationEmail)) {
                // Flat: use the first (or only) email value from the map
                $payload['validation_email'] = reset($validationEmail);
            }
        }

        return $this->request('POST', "/certificates/{$certId}/challenges", $payload);
    }

    /**
     * Re-trigger or check challenge verification.
     *
     * @param string $certId ZeroSSL certificate ID.
     * @param string $method Validation method used.
     */
    public function verifyDomain(string $certId, string $method): array
    {
        $payload = ['validation_method' => $method];
        return $this->request('POST', "/certificates/{$certId}/challenges", $payload);
    }

    /**
     * Download the issued certificate as a zip archive (base64 encoded contents).
     * Returns array with keys: certificate.crt, ca_bundle.crt
     */
    public function downloadCertificate(string $certId): array
    {
        return $this->request('GET', "/certificates/{$certId}/download/return");
    }

    /**
     * Get certificate details and current status.
     */
    public function getCertificate(string $certId): array
    {
        return $this->request('GET', "/certificates/{$certId}");
    }

    /**
     * Cancel a pending certificate.
     */
    public function cancelCertificate(string $certId): array
    {
        return $this->request('DELETE', "/certificates/{$certId}");
    }

    /**
     * List all certificates in the account.
     */
    public function listCertificates(): array
    {
        return $this->request('GET', '/certificates');
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    private function request(string $method, string $path, array $payload = []): array
    {
        $url = $this->apiBase . $path . '?access_key=' . urlencode($this->apiKey);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        switch (strtoupper($method)) {
            case 'POST':
                curl_setopt($ch, CURLOPT_POST, true);
                $parts = [];
                foreach ($payload as $key => $value) {
                    $parts[] = urlencode($key) . '=' . urlencode((string) $value);
                }
                curl_setopt($ch, CURLOPT_POSTFIELDS, implode('&', $parts));
                curl_setopt($ch, CURLOPT_HTTPHEADER, [
                    'Content-Type: application/x-www-form-urlencoded',
                ]);
                break;
            case 'DELETE':
                curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
                break;
            case 'GET':
            default:
                break;
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return ['success' => false, 'error' => "cURL error: {$curlError}"];
        }

        $decoded = json_decode($response, true);
        if (!is_array($decoded)) {
            return [
                'success'  => false,
                'error'    => 'Invalid JSON response from ZeroSSL',
                'raw'      => $response,
                'http_code' => $httpCode,
            ];
        }

        return $decoded;
    }
}
