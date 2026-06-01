import { FC, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchServices } from '../../api/services.api';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge';
import type { Service } from '../../types/service.types';
import './HomePageScreen.css';

interface Stats {
  total: number;
  active: number;
  pending: number;
  expiring: number;
  expired: number;
  noCert: number;
}

function computeStats(services: Service[]): Stats {
  return {
    total: services.length,
    active: services.filter((s) => s.cert_status === 'issued').length,
    pending: services.filter((s) => s.cert_status === 'pending_validation').length,
    expiring: services.filter((s) => s.cert_status === 'expiring_soon').length,
    expired: services.filter((s) => s.cert_status === 'expired').length,
    noCert: services.filter((s) => s.cert_status === 'none').length,
  };
}

function daysUntilExpiry(expiry: string | null): number | null {
  if (!expiry) return null;
  const ms = new Date(expiry).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export const HomePageScreen: FC = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchServices()
      .then(setServices)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const stats = computeStats(services);

  const statCards = [
    { label: 'Total Services', value: stats.total, color: 'var(--accent-blue)' },
    { label: 'Active Certs', value: stats.active, color: 'var(--accent-green)' },
    { label: 'Pending', value: stats.pending, color: 'var(--accent-yellow)' },
    { label: 'Expired / No Cert', value: stats.expired + stats.noCert, color: 'var(--accent-red)' },
  ];

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">Overview of all managed certificates</p>
        </div>
        <Link
          to="/services/new"
          className="btn-new-service"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Service
        </Link>
      </div>

      <div className="stat-grid">
        {statCards.map((card) => (
          <div key={card.label} className="stat-card card">
            <div className="stat-value" style={{ color: card.color }}>{card.value}</div>
            <div className="stat-label">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2>Recent Services</h2>
          <Link to="/services" style={{ fontSize: 13, color: 'var(--accent-blue)' }}>View all →</Link>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : services.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <h3>No services yet</h3>
            <p>Create your first service to start managing certificates.</p>
            <Link to="/services/new" className="btn-new-service" style={{ marginTop: 16 }}>
              Create Service
            </Link>
          </div>
        ) : (
          <table className="services-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Domains</th>
                <th>Status</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {services.slice(0, 5).map((service) => {
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
                    <td><StatusBadge status={service.cert_status} /></td>
                    <td>
                      {days !== null ? (
                        <span style={{ color: days < 14 ? 'var(--accent-red)' : days < 30 ? 'var(--accent-yellow)' : 'var(--text-secondary)', fontSize: 13 }}>
                          {days > 0 ? `${days}d` : 'Expired'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td>
                      <Link to={`/services/${service.id}`} className="btn-ghost" style={{ fontSize: 13, padding: '4px 10px', textDecoration: 'none' }}>
                        Manage →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};