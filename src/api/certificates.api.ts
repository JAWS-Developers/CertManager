import { API_BASE } from '../config/config';
import type { CertActionResult, ReadInboxResult, Settings } from '../types/service.types';

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

/**
 * Poll the configured IMAP inbox for ZeroSSL verification emails and
 * automatically click the verification links for this service's certificate.
 */
export async function pollEmailVerification(serviceId: string): Promise<CertActionResult> {
  const res = await fetch(`${API_BASE}/cert.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'poll_email', service_id: serviceId }),
  });
  return res.json();
}

/**
 * Read the configured IMAP inbox for ZeroSSL verification emails and return
 * the links and DCV codes found in them WITHOUT clicking anything.
 */
export async function readInbox(serviceId: string): Promise<ReadInboxResult> {
  const res = await fetch(`${API_BASE}/cert.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'read_inbox', service_id: serviceId }),
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
  return data.settings ?? { has_api_key: false, has_imap_config: false };
}

export async function saveSettings(settings: Record<string, string | number>): Promise<void> {
  const res = await fetch(`${API_BASE}/settings.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify(settings),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? 'Failed to save settings');
}

export async function testImapConnection(
  imapSettings: Partial<{
    imap_host: string;
    imap_port: number;
    imap_encryption: string;
    imap_username: string;
    imap_password: string;
  }>
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/settings.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'test_imap', ...imapSettings }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? 'Connection test failed');
  return data;
}
