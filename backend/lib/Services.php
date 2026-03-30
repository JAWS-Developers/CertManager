<?php

class Services
{
    private string $filePath;

    public function __construct(string $filePath)
    {
        $this->filePath = $filePath;
        if (!file_exists($filePath)) {
            file_put_contents($filePath, json_encode(['services' => []]));
        }
    }

    private function load(): array
    {
        $raw = file_get_contents($this->filePath);
        if ($raw === false) {
            return ['services' => []];
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : ['services' => []];
    }

    private function save(array $data): void
    {
        file_put_contents($this->filePath, json_encode($data, JSON_PRETTY_PRINT));
    }

    public function getAll(): array
    {
        $data = $this->load();
        return $data['services'] ?? [];
    }

    public function getById(string $id): ?array
    {
        $services = $this->getAll();
        foreach ($services as $service) {
            if ($service['id'] === $id) {
                return $service;
            }
        }
        return null;
    }

    public function create(array $serviceData): array
    {
        $data = $this->load();
        $service = array_merge([
            'id'                  => $this->generateId(),
            'name'                => '',
            'description'         => '',
            'domains'             => [],
            'cert_path'           => '',
            'webroot_path'        => '',
            'restart_command'     => '',
            'verification_method' => 'http',
            'verification_email'  => '',
            'cert_id'             => null,
            'cert_status'         => 'none',
            'cert_expiry'         => null,
            'last_updated'        => date('c'),
            'created_at'          => date('c'),
        ], $serviceData);

        $data['services'][] = $service;
        $this->save($data);
        return $service;
    }

    public function update(string $id, array $updateData): ?array
    {
        $data = $this->load();
        foreach ($data['services'] as &$service) {
            if ($service['id'] === $id) {
                $updateData['last_updated'] = date('c');
                // Prevent overwriting the ID
                unset($updateData['id']);
                $service = array_merge($service, $updateData);
                $this->save($data);
                return $service;
            }
        }
        return null;
    }

    public function delete(string $id): bool
    {
        $data = $this->load();
        $original = count($data['services']);
        $data['services'] = array_values(
            array_filter($data['services'], fn($s) => $s['id'] !== $id)
        );
        if (count($data['services']) < $original) {
            $this->save($data);
            return true;
        }
        return false;
    }

    private function generateId(): string
    {
        return bin2hex(random_bytes(8));
    }
}
