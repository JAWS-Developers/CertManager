import { FC, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createService, fetchService, updateService } from '../../api/services.api';
import { DomainsInput } from '../../components/DomainsInput/DomainsInput';
import { useNotification } from '../../contexts/NotificationContext';
import type { ServiceFormData, VerificationMethod } from '../../types/service.types';
import './ServiceFormScreen.css';

const EMPTY_FORM: ServiceFormData = {
  name: '',
  description: '',
  domains: [],
  cert_path: '',
  webroot_path: '',
  restart_command: '',
  verification_method: 'http',
  verification_email: '',
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
            <label htmlFor="cert_path">Certificate Directory Path *</label>
            <input
              id="cert_path"
              type="text"
              value={form.cert_path}
              onChange={(e) => set('cert_path', e.target.value)}
              placeholder="/etc/nginx/certs/mysite"
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
              {(['http', 'email'] as VerificationMethod[]).map((method) => (
                <label key={method} className={`radio-option${form.verification_method === method ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="verification_method"
                    value={method}
                    checked={form.verification_method === method}
                    onChange={() => set('verification_method', method)}
                  />
                  <div className="radio-content">
                    {method === 'http' ? (
                      <>
                        <strong>HTTP File</strong>
                        <span>Automatically creates a validation file in your webroot</span>
                      </>
                    ) : (
                      <>
                        <strong>Email</strong>
                        <span>ZeroSSL sends a verification email to an address at your domain</span>
                      </>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {form.verification_method === 'http' && (
            <div className="form-group">
              <label htmlFor="webroot_path">Webroot Path *</label>
              <input
                id="webroot_path"
                type="text"
                value={form.webroot_path}
                onChange={(e) => set('webroot_path', e.target.value)}
                placeholder="/var/www/html"
              />
              <span className="field-hint">
                Document root of the web server (the validation file will be created at {'{webroot}'}/.well-known/pki-validation/)
              </span>
              {errors.webroot_path && <span className="field-error">{errors.webroot_path}</span>}
            </div>
          )}

          {form.verification_method === 'email' && (
            <div className="form-group">
              <label htmlFor="verification_email">Verification Email *</label>
              <input
                id="verification_email"
                type="email"
                value={form.verification_email}
                onChange={(e) => set('verification_email', e.target.value)}
                placeholder="admin@example.com"
              />
              <span className="field-hint">
                Must be admin@, administrator@, webmaster@, hostmaster@ or postmaster@ at your domain
              </span>
              {errors.verification_email && <span className="field-error">{errors.verification_email}</span>}
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
