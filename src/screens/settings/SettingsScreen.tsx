import { FC, useEffect, useState } from 'react';
import { fetchSettings, saveSettings } from '../../api/certificates.api';
import { useNotification } from '../../contexts/NotificationContext';
import type { Settings } from '../../types/service.types';
import './SettingsScreen.css';

export const SettingsScreen: FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { notify } = useNotification();

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setSettings(s);
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
      // Refresh
      const updated = await fetchSettings();
      setSettings(updated);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

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
                <strong>Verify Domain</strong>
                <p>For HTTP verification, the validation file is created in your webroot automatically. For email, ZeroSSL sends a verification link.</p>
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
