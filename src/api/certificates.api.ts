import { API_BASE } from '../config/config';
import type { CertActionResult, Settings } from '../types/service.types';

const headers = { 'Content-Type': 'application/json' };

export async function requestCertificate(serviceId: string): Promise<CertActionResult> {
  const res = await fetch(`${API_BASE}/cert.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'request', service_id: serviceId }),
  });
  return res.json();
}

export async function verifyCertificate(serviceId: string): Promise<CertActionResult> {
  const res = await fetch(`${API_BASE}/cert.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'verify', service_id: serviceId }),
  });
  return res.json();
}

export async function installCertificate(serviceId: string): Promise<CertActionResult> {
  const res = await fetch(`${API_BASE}/cert.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'install', service_id: serviceId }),
  });
  return res.json();
}

export async function renewCertificate(serviceId: string): Promise<CertActionResult> {
  const res = await fetch(`${API_BASE}/cert.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'renew', service_id: serviceId }),
  });
  return res.json();
}

export async function getCertStatus(serviceId: string): Promise<CertActionResult & { cert?: unknown }> {
  const res = await fetch(`${API_BASE}/cert.php?action=status&service_id=${encodeURIComponent(serviceId)}`);
  return res.json();
}

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch(`${API_BASE}/settings.php`);
  const data = await res.json();
  return data.settings ?? { has_api_key: false };
}

export async function saveSettings(settings: { zerossl_api_key: string }): Promise<void> {
  const res = await fetch(`${API_BASE}/settings.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify(settings),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? 'Failed to save settings');
}
