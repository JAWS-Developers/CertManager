import { FC } from 'react';
import type { CertStatus } from '../../types/service.types';

interface Props {
  status: CertStatus;
}

const statusConfig: Record<CertStatus, { label: string; color: string; bg: string }> = {
  none: { label: 'No Certificate', color: '#64748b', bg: 'rgba(100,116,139,0.15)' },
  pending_validation: { label: 'Pending Validation', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  issued: { label: 'Active', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  expiring_soon: { label: 'Expiring Soon', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  expired: { label: 'Expired', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  cancelled: { label: 'Cancelled', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
  error: { label: 'Error', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};

export const StatusBadge: FC<Props> = ({ status }) => {
  const config = statusConfig[status] ?? statusConfig.none;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.color}33`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: config.color,
          flexShrink: 0,
        }}
      />
      {config.label}
    </span>
  );
};
