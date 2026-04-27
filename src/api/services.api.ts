import { API_BASE } from '../config/config';
import type { Service, ServiceFormData, PathsValidationResult } from '../types/service.types';

const headers = { 'Content-Type': 'application/json' };

export async function fetchServices(): Promise<Service[]> {
  const res = await fetch(`${API_BASE}/services.php`);
  const data = await res.json();
  return data.services ?? [];
}

export async function fetchService(id: string): Promise<Service | null> {
  const res = await fetch(`${API_BASE}/services.php?id=${encodeURIComponent(id)}`);
  const data = await res.json();
  return data.service ?? null;
}

export async function createService(formData: ServiceFormData): Promise<Service> {
  const res = await fetch(`${API_BASE}/services.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'create', ...formData }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? 'Failed to create service');
  return data.service;
}

export async function updateService(id: string, formData: Partial<ServiceFormData>): Promise<Service> {
  const res = await fetch(`${API_BASE}/services.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'update', id, ...formData }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? 'Failed to update service');
  return data.service;
}

export async function deleteService(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/services.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'delete', id }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? 'Failed to delete service');
}

export async function checkPaths(
  certPath: string,
  webrootPath: string,
  verificationMethod: string,
  splitFiles?: boolean,
  caPath?: string,
  keyPath?: string,
): Promise<PathsValidationResult> {
  const res = await fetch(`${API_BASE}/services.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'validate_paths',
      cert_path: certPath,
      webroot_path: webrootPath,
      verification_method: verificationMethod,
      split_files: splitFiles ?? false,
      ca_path: caPath ?? '',
      key_path: keyPath ?? '',
    }),
  });
  return res.json();
}
