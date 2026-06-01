import { FC, useEffect, useState } from 'react';
import { fetchSettings, saveSettings, testImapConnection } from '../../api/certificates.api';
import { useNotification } from '../../contexts/NotificationContext';
import type { Settings } from '../../types/service.types';
import './SettingsScreen.css';

interface ImapForm {
  imap_host: string;
  imap_port: string;
  imap_encryption: string;
  imap_username: string;
  imap_password: string;
}

const EMPTY_IMAP: ImapForm = {
  imap_host: '',
  imap_port: '993',
  imap_encryption: 'ssl',
  imap_username: '',
  imap_password: '',
};

export const SettingsScreen: FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [imapForm, setImapForm] = useState<ImapForm>(EMPTY_IMAP);
  const [showImapPassword, setShowImapPassword] = useState(false);
  const [savingImap, setSavingImap] = useState(false);
  const [testingImap, setTestingImap] = useState(false);

  const { notify } = useNotification();

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setSettings(s);
        // Pre-fill IMAP form with non-sensitive saved values
        setImapForm((prev) => ({
          ...prev,
          imap_host:       s.imap_host       ?? '',
          imap_port:       s.imap_port       ? String(s.imap_port) : '993',
          imap_encryption: s.imap_encryption ?? 'ssl',
          imap_username:   s.imap_username   ?? '',
          // password is never returned by the server
        }));
      })
      .catch(() => notify('Failed to load settings', 'error'))
      .finally(() => setLoading(false));
    // notify is a stable ref — excluded intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      notify('Please enter an API key', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveSettings({ zerossl_api_key: apiKey.trim() });
      notify('Settings saved successfully', 'success');
      setApiKey('');
      const updated = await fetchSettings();
      setSettings(updated);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleImapSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imapForm.imap_host.trim() || !imapForm.imap_username.trim()) {
      notify('Host and username are required', 'error');
      return;
    }
    setSavingImap(true);
    try {
      await saveSettings({
        imap_host:       imapForm.imap_host.trim(),
        imap_port:       parseInt(imapForm.imap_port, 10) || 993,
        imap_encryption: imapForm.imap_encryption,
        imap_username:   imapForm.imap_username.trim(),
        ...(imapForm.imap_password ? { imap_password: imapForm.imap_password } : {}),
      });
      notify('IMAP settings saved', 'success');
      setImapForm((prev) => ({ ...prev, imap_password: '' }));
      const updated = await fetchSettings();
      setSettings(updated);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : 'Failed to save IMAP settings', 'error');
    } finally {
      setSavingImap(false);
    }
  };

  const handleTestImap = async () => {
    setTestingImap(true);
    try {
      const result = await testImapConnection({
        imap_host:       imapForm.imap_host       || undefined,
        imap_port:       parseInt(imapForm.imap_port, 10) || undefined,
        imap_encryption: imapForm.imap_encryption || undefined,
        imap_username:   imapForm.imap_username   || undefined,
        imap_password:   imapForm.imap_password   || undefined,
      });
      notify(result.message, 'success');
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : 'Connection test failed', 'error');
    } finally {
      setTestingImap(false);
    }
  };

  const setImap = (key: keyof ImapForm, value: string) =>
    setImapForm((prev) => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <div className="spinner" style={{ margin: '0 auto', width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  return (
    <div className="settings-screen">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-subtitle">Configure CertManager preferences</p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="card settings-card">
          <h3 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            ZeroSSL Configuration
          </h3>
          <p className="settings-desc">
            CertManager uses the{' '}
            <a href="https://zerossl.com" target="_blank" rel="noreferrer">ZeroSSL</a>{' '}
            API to issue free SSL certificates. You need an API access key from your ZeroSSL dashboard.
          </p>

          {settings?.has_api_key && (
            <div className="success-box" style={{ marginBottom: 20 }}>
              <strong>✓ API Key configured</strong>
              <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 13 }}>
                {settings.zerossl_api_key_masked}
              </div>
            </div>
          )}

          {!settings?.has_api_key && (
            <div className="warning-box" style={{ marginBottom: 20 }}>
              <strong>⚠ No API key configured</strong>
              <div style={{ marginTop: 4 }}>
                You won't be able to request certificates until you add your ZeroSSL API key.
              </div>
            </div>
          )}

          <form onSubmit={handleSave}>
            <div className="form-group">
              <label htmlFor="api-key">
                {settings?.has_api_key ? 'Update API Key' : 'ZeroSSL API Key'}
              </label>
              <div className="api-key-input">
                <input
                  id="api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings?.has_api_key ? 'Enter new key to replace…' : 'Paste your ZeroSSL API key'}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn-ghost toggle-visibility"
                  onClick={() => setShowKey((v) => !v)}
                  tabIndex={-1}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={saving || !apiKey.trim()}>
              {saving ? <span className="spinner" /> : null}
              Save API Key
            </button>
          </form>
        </div>

        {/* IMAP Configuration */}
        <div className="card settings-card">
          <h3 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Verification Inbox (IMAP)
          </h3>
          <p className="settings-desc">
            Configure an IMAP mailbox that receives ZeroSSL verification emails (e.g.{' '}
            <code style={{ fontSize: 12 }}>crt@jawsdevelopers.ch</code>). CertManager will automatically
            connect to this inbox, find the verification links, and click them — fully hands-free.
          </p>

          {settings?.has_imap_config && (
            <div className="success-box" style={{ marginBottom: 20 }}>
              <strong>✓ IMAP inbox configured</strong>
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                {settings.imap_username} @ {settings.imap_host}
                {settings.imap_password_masked && (
                  <span style={{ marginLeft: 8, fontFamily: 'monospace' }}>
                    {settings.imap_password_masked}
                  </span>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleImapSave}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 3 }}>
                <label htmlFor="imap-host">IMAP Host</label>
                <input
                  id="imap-host"
                  type="text"
                  value={imapForm.imap_host}
                  onChange={(e) => setImap('imap_host', e.target.value)}
                  placeholder="mail.example.com"
                  autoComplete="off"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="imap-port">Port</label>
                <input
                  id="imap-port"
                  type="number"
                  value={imapForm.imap_port}
                  onChange={(e) => setImap('imap_port', e.target.value)}
                  placeholder="993"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="imap-encryption">Encryption</label>
                <select
                  id="imap-encryption"
                  value={imapForm.imap_encryption}
                  onChange={(e) => setImap('imap_encryption', e.target.value)}
                  style={{ background: 'var(--bg-input, #0f1117)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', padding: '8px 12px', width: '100%', fontSize: 14 }}
                >
                  <option value="ssl">SSL/TLS</option>
                  <option value="tls">STARTTLS</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label htmlFor="imap-username">Username</label>
                <input
                  id="imap-username"
                  type="text"
                  value={imapForm.imap_username}
                  onChange={(e) => setImap('imap_username', e.target.value)}
                  placeholder="crt@example.com"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="imap-password">
                Password{settings?.has_imap_config ? ' (leave blank to keep current)' : ''}
              </label>
              <div className="api-key-input">
                <input
                  id="imap-password"
                  type={showImapPassword ? 'text' : 'password'}
                  value={imapForm.imap_password}
                  onChange={(e) => setImap('imap_password', e.target.value)}
                  placeholder={settings?.has_imap_config ? '••••••••' : 'Mailbox password'}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="btn-ghost toggle-visibility"
                  onClick={() => setShowImapPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showImapPassword ? 'Hide password' : 'Show password'}
                >
                  {showImapPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleTestImap}
                disabled={testingImap || !imapForm.imap_host.trim()}
              >
                {testingImap ? <span className="spinner" /> : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                )}
                Test Connection
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={savingImap || !imapForm.imap_host.trim() || !imapForm.imap_username.trim()}
              >
                {savingImap ? <span className="spinner" /> : null}
                Save IMAP Settings
              </button>
            </div>
          </form>
        </div>

        <div className="card settings-card">
          <h3 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            How it Works
          </h3>
          <div className="how-it-works">
            <div className="how-step">
              <div className="how-num">1</div>
              <div>
                <strong>Create a Service</strong>
                <p>Define the domains, certificate path, and restart command for each of your web services.</p>
              </div>
            </div>
            <div className="how-step">
              <div className="how-num">2</div>
              <div>
                <strong>Request a Certificate</strong>
                <p>CertManager generates a CSR and requests a certificate from ZeroSSL automatically.</p>
              </div>
            </div>
            <div className="how-step">
              <div className="how-num">3</div>
              <div>
                <strong>Auto-Verify via Email</strong>
                <p>ZeroSSL sends a verification email to <code>webmaster@</code> at your domain. CertManager polls the configured IMAP inbox and clicks the verification link automatically.</p>
              </div>
            </div>
            <div className="how-step">
              <div className="how-num">4</div>
              <div>
                <strong>Install &amp; Restart</strong>
                <p>Once issued, the certificate is downloaded, bundled (fullchain.pem + privkey.key), installed at the configured path, and your service is restarted.</p>
              </div>
            </div>
            <div className="how-step">
              <div className="how-num">5</div>
              <div>
                <strong>Renew Before Expiry</strong>
                <p>When you receive an expiry notice from ZeroSSL, hit Renew to automatically replace the certificate.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
