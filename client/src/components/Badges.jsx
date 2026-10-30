export function StatusBadge({ status }) {
  const classes = {
    waiting:   'badge-waiting',
    called:    'badge-called',
    serving:   'badge-serving',
    completed: 'badge-completed',
    skipped:   'badge-skipped',
    cancelled: 'badge-completed',
  };

  return <span className={classes[status] || 'badge'}>{status}</span>;
}

export function PriorityBadge({ priority }) {
  const config = {
    0: { label: 'Normal',  className: 'badge-priority-normal' },
    1: { label: 'High',    className: 'badge-priority-high' },
    2: { label: 'Urgent',  className: 'badge-priority-urgent' },
  };

  const { label, className } = config[priority] || config[0];
  if (priority === 0) return null; // Don't show badge for normal priority
  return <span className={className}>{label}</span>;
}
