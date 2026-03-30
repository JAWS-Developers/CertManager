import { FC, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createService, fetchService, updateService, checkPaths } from '../../api/services.api';
import { DomainsInput } from '../../components/DomainsInput/DomainsInput';
import { useNotification } from '../../contexts/NotificationContext';
import type { ServiceFormData, VerificationMethod, PathCheckResult } from '../../types/service.types';
import './ServiceFormScreen.css';

const EMPTY_FORM: ServiceFormData = {
  name: '',
  description: '',
  domains: [],
  cert_path: '',
  webroot_path: '',
  restart_command: '',
  verification_method: 'email',
  verification_email: '',
};

/**
 * Extract the registrable root domain (last two dot-separated parts).
 * Examples:
 *   example.com        → example.com
 *   www.example.com    → example.com
 *   sub.app.example.com → example.com
 */
function rootDomain(domain: string): string {
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  const parts = clean.split('.');
  return parts.length <= 2 ? clean : parts.slice(-2).join('.');
}

// Statuses for a path field: idle | checking | ok | warn | error
type PathStatus = {
  state: 'idle' | 'checking' | 'ok' | 'warn' | 'error';
  message?: string;
};

const IDLE: PathStatus = { state: 'idle' };

function statusFromResult(result: PathCheckResult | null | undefined): PathStatus {
  if (!result) return IDLE;
  if (!result.valid) return { state: 'error', message: result.error };
  if (!result.exists) return { state: 'warn', message: result.note ?? 'Directory will be created automatically' };
  return { state: 'ok', message: result.exists ? 'Directory exists and is writable' : undefined };
}

const PathStatusIcon: FC<{ status: PathStatus }> = ({ status }) => {
  if (status.state === 'idle') return null;
  if (status.state === 'checking') {
    return <span className="path-status path-checking"><span className="spinner" /></span>;
  }
  if (status.state === 'ok') {
    return (
      <span className="path-status path-ok" title={status.message}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Accessible
      </span>
    );
  }
  if (status.state === 'warn') {
    return (
      <span className="path-status path-warn" title={status.message}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Will be created
      </span>
    );
  }
  // error
  return (
    <span className="path-status path-error" title={status.message}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      {status.message ?? 'Invalid path'}
    </span>
  );
};

export const ServiceFormScreen: FC = () => {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [form, setForm] = useState<ServiceFormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [certPathStatus, setCertPathStatus] = useState<PathStatus>(IDLE);
  const [webrootPathStatus, setWebrootPathStatus] = useState<PathStatus>(IDLE);

  // Track the last email value that was set automatically so we know if the
  // user has overridden it with something custom.
  const autoDerivedEmailRef = useRef('');

  useEffect(() => {
    if (!isEdit || !id) return;
    fetchService(id)
      .then((service) => {
        if (!service) {
          notify('Service not found', 'error');
          navigate('/services');
          return;
        }
        setForm({
          name: service.name,
          description: service.description,
          domains: service.domains,
          cert_path: service.cert_path,
          webroot_path: service.webroot_path,
          restart_command: service.restart_command,
          verification_method: service.verification_method,
          verification_email: service.verification_email,
        });
      })
      .catch(() => notify('Failed to load service', 'error'))
      .finally(() => setLoading(false));
    // navigate and notify are stable refs — excluded intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  // Auto-derive webmaster@<root-domain> whenever the first domain changes.
  // Only overwrites the email if it is empty or still matches the previously
  // auto-derived value (i.e. the user has not manually customised it).
  useEffect(() => {
    if (isEdit) return; // Don't auto-override when editing an existing service
    if (form.domains.length === 0) return;
    const derived = `webmaster@${rootDomain(form.domains[0])}`;
    setForm((prev) => {
      if (prev.verification_email === '' || prev.verification_email === autoDerivedEmailRef.current) {
        autoDerivedEmailRef.current = derived;
        return { ...prev, verification_email: derived };
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.domains, isEdit]);

  /**
   * Call the backend validate_paths action and update the status badges.
   * Only checks non-empty fields; silently resets the other badge to idle.
   */
  const runPathCheck = useCallback(
    async (certPath: string, webrootPath: string, verMethod: string) => {
      const checkCert = certPath.trim() !== '';
      const checkWebroot = webrootPath.trim() !== '' && verMethod === 'http';

      if (!checkCert && !checkWebroot) return;

      if (checkCert) setCertPathStatus({ state: 'checking' });
      if (checkWebroot) setWebrootPathStatus({ state: 'checking' });

      try {
        const result = await checkPaths(certPath, webrootPath, verMethod);
        if (checkCert) setCertPathStatus(statusFromResult(result.cert_path));
        if (checkWebroot) setWebrootPathStatus(statusFromResult(result.webroot_path));
      } catch {
        if (checkCert) setCertPathStatus({ state: 'error', message: 'Could not verify path (server unreachable)' });
        if (checkWebroot) setWebrootPathStatus({ state: 'error', message: 'Could not verify path (server unreachable)' });
      }
    },
    [],
  );

  const handleCertPathBlur = () => {
    if (form.cert_path.trim()) {
      runPathCheck(form.cert_path, form.webroot_path, form.verification_method);
    } else {
      setCertPathStatus(IDLE);
    }
  };

  const handleWebrootPathBlur = () => {
    if (form.webroot_path.trim()) {
      runPathCheck(form.cert_path, form.webroot_path, form.verification_method);
    } else {
      setWebrootPathStatus(IDLE);
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Service name is required';
    if (form.domains.length === 0) e.domains = 'At least one domain is required';
    if (!form.cert_path.trim()) e.cert_path = 'Certificate path is required';
    if (form.verification_method === 'http' && !form.webroot_path.trim()) {
      e.webroot_path = 'Webroot path is required for HTTP verification';
    }
    if (form.verification_method === 'email' && !form.verification_email.trim()) {
      e.verification_email = 'Verification email is required';
    }
    // Block submit if we know a path is invalid
    if (certPathStatus.state === 'error') {
      e.cert_path = certPathStatus.message ?? 'Certificate path is invalid';
    }
    if (webrootPathStatus.state === 'error') {
      e.webroot_path = webrootPathStatus.message ?? 'Webroot path is invalid';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit && id) {
        await updateService(id, form);
        notify('Service updated successfully', 'success');
        navigate(`/services/${id}`);
      } else {
        const service = await createService(form);
        notify('Service created successfully', 'success');
        navigate(`/services/${service.id}`);
      }
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Failed to save service', 'error');
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof ServiceFormData>(key: K, value: ServiceFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
    // Reset path status when field changes
    if (key === 'cert_path') setCertPathStatus(IDLE);
    if (key === 'webroot_path') setWebrootPathStatus(IDLE);
    if (key === 'verification_method') setWebrootPathStatus(IDLE);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <div className="spinner" style={{ margin: '0 auto', width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  return (
    <div className="form-screen">
      <div className="page-header">
        <div>
          <h1>{isEdit ? 'Edit Service' : 'New Service'}</h1>
          <p className="page-subtitle">
            {isEdit ? 'Update service configuration' : 'Configure a new SSL-managed service'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* Basic Info */}
        <div className="card form-card">
          <h3 className="form-section-title">Basic Information</h3>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Service Name *</label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. My Web Application"
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <input
                id="description"
                type="text"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Domains *</label>
            <DomainsInput
              value={form.domains}
              onChange={(d) => set('domains', d)}
              placeholder="example.com"
            />
            {errors.domains && <span className="field-error">{errors.domains}</span>}
          </div>
        </div>

        {/* Certificate Settings */}
        <div className="card form-card">
          <h3 className="form-section-title">Certificate Settings</h3>
          <div className="form-group">
            <div className="path-label-row">
              <label htmlFor="cert_path">Certificate Directory Path *</label>
              <PathStatusIcon status={certPathStatus} />
            </div>
            <input
              id="cert_path"
              type="text"
              value={form.cert_path}
              onChange={(e) => set('cert_path', e.target.value)}
              onBlur={handleCertPathBlur}
              placeholder="/etc/nginx/certs/mysite"
              className={certPathStatus.state === 'error' ? 'input-error' : certPathStatus.state === 'ok' ? 'input-ok' : ''}
            />
            <span className="field-hint">
              Directory where fullchain.pem and privkey.key will be saved
            </span>
            {errors.cert_path && <span className="field-error">{errors.cert_path}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="restart_command">Restart Command</label>
            <input
              id="restart_command"
              type="text"
              value={form.restart_command}
              onChange={(e) => set('restart_command', e.target.value)}
              placeholder="systemctl restart nginx"
            />
            <span className="field-hint">
              Command to execute after certificate installation (runs as the PHP process user)
            </span>
          </div>
        </div>

        {/* Verification */}
        <div className="card form-card">
          <h3 className="form-section-title">Domain Verification</h3>

          <div className="form-group">
            <label>Verification Method *</label>
            <div className="radio-group">
              {(['email', 'http'] as VerificationMethod[]).map((method) => (
                <label key={method} className={`radio-option${form.verification_method === method ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="verification_method"
                    value={method}
                    checked={form.verification_method === method}
                    onChange={() => set('verification_method', method)}
                  />
                  <div className="radio-content">
                    {method === 'email' ? (
                      <>
                        <strong>Email</strong>
                        <span>ZeroSSL sends a verification email to webmaster@ at your domain</span>
                      </>
                    ) : (
                      <>
                        <strong>HTTP File</strong>
                        <span>Automatically creates a validation file in your webroot</span>
                      </>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {form.verification_method === 'email' && (
            <div className="form-group">
              <label htmlFor="verification_email">Verification Email *</label>
              <input
                id="verification_email"
                type="email"
                value={form.verification_email}
                onChange={(e) => set('verification_email', e.target.value)}
                placeholder="webmaster@example.com"
              />
              <span className="field-hint">
                Auto-filled as webmaster@&lt;root-domain&gt;. For subdomains (e.g. sub.example.com) the email is always webmaster@example.com.
                Must be one of: admin@, administrator@, webmaster@, hostmaster@ or postmaster@.
              </span>
              {errors.verification_email && <span className="field-error">{errors.verification_email}</span>}
            </div>
          )}

          {form.verification_method === 'http' && (
            <div className="form-group">
              <div className="path-label-row">
                <label htmlFor="webroot_path">Webroot Path *</label>
                <PathStatusIcon status={webrootPathStatus} />
              </div>
              <input
                id="webroot_path"
                type="text"
                value={form.webroot_path}
                onChange={(e) => set('webroot_path', e.target.value)}
                onBlur={handleWebrootPathBlur}
                placeholder="/var/www/html"
                className={webrootPathStatus.state === 'error' ? 'input-error' : webrootPathStatus.state === 'ok' ? 'input-ok' : ''}
              />
              <span className="field-hint">
                Document root of the web server (the validation file will be created at {'{webroot}'}/.well-known/pki-validation/)
              </span>
              {errors.webroot_path && <span className="field-error">{errors.webroot_path}</span>}
            </div>
          )}
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate(isEdit && id ? `/services/${id}` : '/services')}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : null}
            {isEdit ? 'Save Changes' : 'Create Service'}
          </button>
        </div>
      </form>
    </div>
  );
};
