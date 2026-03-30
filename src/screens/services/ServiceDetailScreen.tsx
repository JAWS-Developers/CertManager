import { FC, useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchService } from '../../api/services.api';
import {
  requestCertificate,
  verifyCertificate,
  installCertificate,
  renewCertificate,
  getCertStatus,
  pollEmailVerification,
} from '../../api/certificates.api';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge';
import { useNotification } from '../../contexts/NotificationContext';
import type { Service, CertActionResult } from '../../types/service.types';
import './ServiceDetailScreen.css';

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function daysUntilExpiry(expiry: string | null): number | null {
  if (!expiry) return null;
  const ms = new Date(expiry).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export const ServiceDetailScreen: FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastResult, setLastResult] = useState<CertActionResult | null>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString(), message, type },
    ]);
  };

  const load = useCallback(() => {
    if (!id) return;
    fetchService(id)
      .then((s) => {
        if (!s) { navigate('/services'); return; }
        setService(s);
      })
      .catch(() => notify('Failed to load service', 'error'))
      .finally(() => setLoading(false));
  }, [id, navigate, notify]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (
    label: string,
    fn: (serviceId: string) => Promise<CertActionResult>,
  ) => {
    if (!id) return;
    setActionLoading(true);
    addLog(`Starting: ${label}…`);
    try {
      const result = await fn(id);
      setLastResult(result);
      if (result.success) {
        addLog(result.message ?? `${label} completed successfully.`, 'success');
        notify(`${label} successful`, 'success');
      } else {
        addLog(result.error ?? `${label} failed.`, 'error');
        notify(result.error ?? `${label} failed`, 'error');
      }
      // Refresh service data
      fetchService(id).then((s) => s && setService(s));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      addLog(msg, 'error');
      notify(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await getCertStatus(id);
      const s = await fetchService(id);
      if (s) setService(s);
      notify('Status refreshed', 'success');
    } catch {
      notify('Failed to refresh status', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <div className="spinner" style={{ margin: '0 auto', width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  if (!service) return null;

  const days = daysUntilExpiry(service.cert_expiry);
  const canRequest = service.cert_status === 'none' || service.cert_status === 'error' || service.cert_status === 'cancelled';
  const canVerify = service.cert_status === 'pending_validation';
  const canInstall = service.cert_status === 'pending_validation' || service.cert_status === 'issued';
  const canRenew = service.cert_status === 'issued' || service.cert_status === 'expiring_soon' || service.cert_status === 'expired';

  return (
    <div className="detail-screen">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <Link to="/services">Services</Link>
            <span>/</span>
            <span>{service.name}</span>
          </div>
          <h1>{service.name}</h1>
          {service.description && <p className="page-subtitle">{service.description}</p>}
        </div>
        <div className="header-actions">
          <Link to={`/services/${service.id}/edit`} className="btn-secondary" style={{ textDecoration: 'none', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </Link>
        </div>
      </div>

      <div className="detail-grid">
        {/* Left column */}
        <div className="detail-left">
          {/* Certificate Status Card */}
          <div className="card cert-status-card">
            <div className="cert-status-header">
              <h3>Certificate Status</h3>
              <button className="btn-ghost btn-sm" onClick={handleRefreshStatus} disabled={actionLoading} title="Refresh status from ZeroSSL">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Refresh
              </button>
            </div>

            <div className="cert-status-body">
              <StatusBadge status={service.cert_status} />

              {service.cert_expiry && (
                <div className="cert-expiry">
                  <span className="cert-expiry-label">Expires</span>
                  <span className="cert-expiry-date" style={{
                    color: days !== null && days < 14 ? 'var(--accent-red)' : days !== null && days < 30 ? 'var(--accent-yellow)' : 'var(--text-primary)',
                  }}>
                    {formatDate(service.cert_expiry)}
                    {days !== null && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                        ({days > 0 ? `${days} days` : 'expired'})
                      </span>
                    )}
                  </span>
                </div>
              )}

              {service.cert_id && (
                <div className="cert-id">
                  <span className="cert-expiry-label">Cert ID</span>
                  <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{service.cert_id}</code>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="cert-actions">
              {canRequest && (
                <button
                  className="btn-primary cert-action-btn"
                  onClick={() => handleAction('Request Certificate', requestCertificate)}
                  disabled={actionLoading}
                >
                  {actionLoading ? <span className="spinner" /> : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                  )}
                  Request Certificate
                </button>
              )}

              {canVerify && (
                <button
                  className="btn-warning cert-action-btn"
                  onClick={() => handleAction('Verify Domain', verifyCertificate)}
                  disabled={actionLoading}
                >
                  {actionLoading ? <span className="spinner" /> : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                  )}
                  Check Verification
                </button>
              )}

              {canVerify && service.verification_method === 'email' && (
                <button
                  className="btn-primary cert-action-btn"
                  onClick={() => handleAction('Auto-Verify from Inbox', pollEmailVerification)}
                  disabled={actionLoading}
                  title="Connect to the configured IMAP inbox, find ZeroSSL verification emails, and click the links automatically"
                >
                  {actionLoading ? <span className="spinner" /> : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                  )}
                  Auto-Verify from Inbox
                </button>
              )}

              {canInstall && (
                <button
                  className="btn-success cert-action-btn"
                  onClick={() => handleAction('Install Certificate', installCertificate)}
                  disabled={actionLoading || !service.cert_status || (service.cert_status !== 'issued' && service.cert_status !== 'pending_validation')}
                >
                  {actionLoading ? <span className="spinner" /> : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  )}
                  Download &amp; Install
                </button>
              )}

              {canRenew && (
                <button
                  className="btn-warning cert-action-btn"
                  onClick={() => handleAction('Renew Certificate', renewCertificate)}
                  disabled={actionLoading}
                >
                  {actionLoading ? <span className="spinner" /> : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                  )}
                  Renew Certificate
                </button>
              )}
            </div>

            {/* Last result */}
            {lastResult && (
              <div className={`last-result ${lastResult.success ? 'success-box' : 'error-box'}`} style={{ marginTop: 16 }}>
                {lastResult.success ? lastResult.message : lastResult.error}
                {lastResult.validation_url && (
                  <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}>
                    Validation URL: <a href={lastResult.validation_url} target="_blank" rel="noreferrer">{lastResult.validation_url}</a>
                  </div>
                )}
                {lastResult.restart_output && (
                  <pre className="restart-output">{lastResult.restart_output}</pre>
                )}
              </div>
            )}
          </div>

          {/* Activity Log */}
          {logs.length > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <h3 style={{ marginBottom: 12 }}>Activity Log</h3>
              <div className="activity-log">
                {logs.map((entry, i) => (
                  <div key={i} className={`log-entry log-${entry.type}`}>
                    <span className="log-time">{entry.time}</span>
                    <span className="log-message">{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column – Service info */}
        <div className="detail-right">
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Service Configuration</h3>

            <div className="info-row">
              <span className="info-label">Domains</span>
              <div className="domains-list">
                {service.domains.map((d) => (
                  <span key={d} className="tag">{d}</span>
                ))}
              </div>
            </div>

            <div className="info-row">
              <span className="info-label">Certificate Path</span>
              <code className="info-code">{service.cert_path || '—'}</code>
            </div>

            <div className="info-row">
              <span className="info-label">Verification Method</span>
              <span style={{ color: 'var(--text-primary)', fontSize: 14 }}>
                {service.verification_method === 'http' ? '🌐 HTTP File' : '📧 Email'}
              </span>
            </div>

            {service.verification_method === 'http' && service.webroot_path && (
              <div className="info-row">
                <span className="info-label">Webroot Path</span>
                <code className="info-code">{service.webroot_path}</code>
              </div>
            )}

            {service.verification_method === 'email' && service.verification_email && (
              <div className="info-row">
                <span className="info-label">Verification Email</span>
                <span style={{ color: 'var(--text-primary)', fontSize: 14 }}>{service.verification_email}</span>
              </div>
            )}

            {service.restart_command && (
              <div className="info-row">
                <span className="info-label">Restart Command</span>
                <code className="info-code">{service.restart_command}</code>
              </div>
            )}

            <div className="info-row" style={{ borderBottom: 'none' }}>
              <span className="info-label">Created</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{formatDate(service.created_at)}</span>
            </div>
          </div>

          {/* Workflow Guide */}
          <div className="card" style={{ marginTop: 20 }}>
            <h3 style={{ marginBottom: 16 }}>Certificate Workflow</h3>
            <div className="workflow-steps">
              {[
                { num: 1, label: 'Request', desc: 'Generate CSR and request cert from ZeroSSL', done: service.cert_status !== 'none' },
                { num: 2, label: 'Verify', desc: 'Prove domain ownership via HTTP file or email', done: service.cert_status === 'issued' || service.cert_status === 'expiring_soon' },
                { num: 3, label: 'Install', desc: 'Download, bundle, and install to cert path', done: service.cert_status === 'issued' || service.cert_status === 'expiring_soon' },
                { num: 4, label: 'Restart', desc: 'Execute restart command automatically', done: service.cert_status === 'issued' || service.cert_status === 'expiring_soon' },
              ].map((step) => (
                <div key={step.num} className={`workflow-step ${step.done ? 'done' : ''}`}>
                  <div className="step-num">{step.done ? '✓' : step.num}</div>
                  <div className="step-content">
                    <strong>{step.label}</strong>
                    <span>{step.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
