import { FC, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchServices, deleteService } from '../../api/services.api';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge';
import { Modal } from '../../components/Modal/Modal';
import { useNotification } from '../../contexts/NotificationContext';
import type { Service } from '../../types/service.types';
import './ServicesListScreen.css';

function daysUntilExpiry(expiry: string | null): number | null {
  if (!expiry) return null;
  const ms = new Date(expiry).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export const ServicesListScreen: FC = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { notify } = useNotification();
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    fetchServices()
      .then(setServices)
      .catch(() => notify('Failed to load services', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // load is stable within this mount — eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteService(deleteTarget.id);
      notify(`Service "${deleteTarget.name}" deleted`, 'success');
      setDeleteTarget(null);
      load();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Services</h1>
          <p className="page-subtitle">Manage all your certificate services</p>
        </div>
        <Link to="/services/new" className="btn-new-service">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Service
        </Link>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" style={{ margin: '0 auto 12px', width: 32, height: 32, borderWidth: 3 }} />
            <p style={{ color: 'var(--text-muted)' }}>Loading services…</p>
          </div>
        ) : services.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <h3>No services configured</h3>
            <p>Add a service to start managing SSL certificates.</p>
            <Link to="/services/new" className="btn-new-service" style={{ marginTop: 16 }}>
              Create First Service
            </Link>
          </div>
        ) : (
          <table className="services-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Domains</th>
                <th>Cert Path</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => {
                const days = daysUntilExpiry(service.cert_expiry);
                return (
                  <tr key={service.id}>
                    <td>
                      <div className="service-name">{service.name}</div>
                      {service.description && (
                        <div className="service-desc">{service.description}</div>
                      )}
                    </td>
                    <td>
                      <div className="domains-list">
                        {service.domains.slice(0, 2).map((d) => (
                          <span key={d} className="tag">{d}</span>
                        ))}
                        {service.domains.length > 2 && (
                          <span className="tag">+{service.domains.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <code className="cert-path">{service.cert_path || '—'}</code>
                    </td>
                    <td><StatusBadge status={service.cert_status} /></td>
                    <td>
                      {days !== null ? (
                        <span style={{
                          color: days < 14 ? 'var(--accent-red)' : days < 30 ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                          fontSize: 13,
                        }}>
                          {days > 0 ? `${days} days` : 'Expired'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-ghost"
                          style={{ fontSize: 13, padding: '5px 10px' }}
                          onClick={() => navigate(`/services/${service.id}`)}
                        >
                          Manage
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ fontSize: 13, padding: '5px 10px' }}
                          onClick={() => navigate(`/services/${service.id}/edit`)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ fontSize: 13, padding: '5px 10px', color: 'var(--accent-red)' }}
                          onClick={() => setDeleteTarget(service)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Service"
        size="sm"
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
          Are you sure you want to delete{' '}
          <strong style={{ color: 'var(--text-primary)' }}>"{deleteTarget?.name}"</strong>?
          This action cannot be undone.
        </p>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? <span className="spinner" /> : null}
            Delete Service
          </button>
        </div>
      </Modal>
    </div>
  );
};
