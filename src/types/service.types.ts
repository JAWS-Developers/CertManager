export type CertStatus =
  | 'none'
  | 'pending_validation'
  | 'issued'
  | 'expiring_soon'
  | 'expired'
  | 'cancelled'
  | 'error';

export type VerificationMethod = 'http' | 'email';

export interface Service {
  id: string;
  name: string;
  description: string;
  domains: string[];
  split_files: boolean;
  cert_path: string;
  ca_path: string;
  key_path: string;
  webroot_path: string;
  restart_command: string;
  restart_ssh_host: string;
  restart_ssh_user: string;
  restart_ssh_password: string;
  verification_method: VerificationMethod;
  verification_email: string;
  cert_id: string | null;
  cert_status: CertStatus;
  cert_expiry: string | null;
  last_updated: string;
  created_at: string;
}

export interface ServiceFormData {
  name: string;
  description: string;
  domains: string[];
  split_files: boolean;
  cert_path: string;
  ca_path: string;
  key_path: string;
  webroot_path: string;
  restart_command: string;
  restart_ssh_host: string;
  restart_ssh_user: string;
  restart_ssh_password: string;
  verification_method: VerificationMethod;
  verification_email: string;
}

export interface CertActionResult {
  success: boolean;
  message?: string;
  error?: string;
  cert_id?: string;
  cert_status?: CertStatus;
  cert_expiry?: string;
  validation_url?: string;
  restart_output?: string;
  restart_exit_code?: number;
}

export interface Settings {
  zerossl_api_key?: string;
  zerossl_api_key_masked?: string;
  has_api_key: boolean;
  has_imap_config: boolean;
  imap_host?: string;
  imap_port?: number;
  imap_encryption?: string;
  imap_username?: string;
  imap_password_masked?: string;
}

export interface InboxEmail {
  uid: number;
  subject: string;
  links: string[];
  dcv_code: string;
  order_number: string;
}

export interface ReadInboxResult {
  success: boolean;
  error?: string;
  emails?: InboxEmail[];
  count?: number;
}

export interface PathCheckResult {
  valid: boolean;
  exists: boolean;
  writable: boolean;
  error?: string;
  note?: string;
}

export interface PathsValidationResult {
  success: boolean;
  cert_path: PathCheckResult | null;
  ca_path: PathCheckResult | null;
  key_path: PathCheckResult | null;
  webroot_path: PathCheckResult | null;
}
