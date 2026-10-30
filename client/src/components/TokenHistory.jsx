
import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  CalendarDays,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  UserRound,
  Building2,
  Hash,
  History,
  CheckCircle2,
  Circle,
  AlertCircle,
  LoaderCircle,
} from 'lucide-react';

import { getTokens, getTokenEvents } from '../services/api';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'called', label: 'Called' },
  { value: 'serving', label: 'Serving' },
  { value: 'completed', label: 'Completed' },
  { value: 'skipped', label: 'Skipped' },
];

const EVENT_LABELS = {
  created: 'Token created',
  called: 'Customer called',
  recalled: 'Token called again',
  serving: 'Service started',
  completed: 'Service completed',
  skipped: 'Token skipped',
};

function getLocalDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return '—';

  const normalized = value.includes('T')
    ? value
    : value.replace(' ', 'T') + 'Z';

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status) {
  if (!status) return 'Unknown';

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatPriority(priority) {
  if (Number(priority) === 2) return 'Urgent';
  if (Number(priority) === 1) return 'High';

  return 'Normal';
}

function getEventDescription(event) {
  if (event.details?.trim()) return event.details;

  return EVENT_LABELS[event.event_type] || statusLabel(event.event_type);
}

function getEventIcon(eventType) {
  if (eventType === 'completed') return CheckCircle2;
  if (eventType === 'skipped') return AlertCircle;
  if (eventType === 'created') return Circle;

  return Clock;
}

export default function TokenHistory() {
  const [date, setDate] = useState(getLocalDate);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [expandedTokenId, setExpandedTokenId] = useState(null);
  const [tokenDetails, setTokenDetails] = useState({});
  const [detailsLoadingId, setDetailsLoadingId] = useState(null);
  const [detailsErrors, setDetailsErrors] = useState({});

  const fetchTokens = useCallback(async (manual = false) => {
    try {
      if (manual) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const result = await getTokens({
        date,
        limit: 500,
      });

      setTokens(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err.message || 'Unable to load token history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const openTokenDetails = async (token) => {
    if (expandedTokenId === token.id) {
      setExpandedTokenId(null);
      return;
    }

    setExpandedTokenId(token.id);

    if (tokenDetails[token.id]) return;

    try {
      setDetailsLoadingId(token.id);

      setDetailsErrors((current) => ({
        ...current,
        [token.id]: null,
      }));

      // Use the shared API client so the saved JWT is attached.
      const result = await getTokenEvents(token.id);

      setTokenDetails((current) => ({
        ...current,
        [token.id]: result,
      }));
    } catch (err) {
      setDetailsErrors((current) => ({
        ...current,
        [token.id]: err.message || 'Unable to load token details.',
      }));
    } finally {
      setDetailsLoadingId(null);
    }
  };

  const retryTokenDetails = async (token) => {
    setTokenDetails((current) => {
      const updated = { ...current };
      delete updated[token.id];
      return updated;
    });

    // Ensure the token is expanded before retrying.
    setExpandedTokenId(token.id);

    try {
      setDetailsLoadingId(token.id);

      setDetailsErrors((current) => ({
        ...current,
        [token.id]: null,
      }));

      const result = await getTokenEvents(token.id);

      setTokenDetails((current) => ({
        ...current,
        [token.id]: result,
      }));
    } catch (err) {
      setDetailsErrors((current) => ({
        ...current,
        [token.id]: err.message || 'Unable to load token details.',
      }));
    } finally {
      setDetailsLoadingId(null);
    }
  };

  const filteredTokens = tokens.filter((token) => {
    if (status && token.status !== status) return false;

    const query = search.trim().toLowerCase();

    if (!query) return true;

    return [
      token.token_number,
      token.customer_name,
      token.service_name,
      token.service_code,
      token.counter_name,
      token.status,
    ].some((value) =>
      String(value || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="ql-history">
      {/* Search and filters */}
      <div className="ql-history-toolbar">
        <label className="ql-history-field">
          <span className="ql-history-label">
            <CalendarDays size={14} />
            Date
          </span>

          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setExpandedTokenId(null);
            }}
            aria-label="Filter tokens by date"
          />
        </label>

        <label className="ql-history-search">
          <span className="ql-history-label">
            <Search size={14} />
            Search records
          </span>

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Token, customer, service..."
            aria-label="Search token history"
          />
        </label>

        <label className="ql-history-field ql-history-status-field">
          <span className="ql-history-label">Status</span>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by token status"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="ql-history-refresh"
          onClick={() => fetchTokens(true)}
          disabled={refreshing}
        >
          <RefreshCw
            size={15}
            className={refreshing ? 'ql-history-spinning' : ''}
          />
          {refreshing ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="ql-history-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => fetchTokens()}>
            Try again
          </button>
        </div>
      )}

      <div className="ql-history-summary">
        <span>
          {loading
            ? 'Loading records...'
            : `${filteredTokens.length} record${filteredTokens.length === 1 ? '' : 's'} found`}
        </span>

        <span>Click a token row to view its timeline.</span>
      </div>

      {/* Token table */}
      <div className="ql-history-table-wrap">
        <table className="ql-history-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Customer</th>
              <th>Service</th>
              <th>Status</th>
              <th>Created</th>
              <th aria-label="Expand details" />
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="ql-history-empty">
                  <LoaderCircle
                    size={22}
                    className="ql-history-spinning"
                  />
                  <span>Loading token records...</span>
                </td>
              </tr>
            ) : filteredTokens.length === 0 ? (
              <tr>
                <td colSpan={6} className="ql-history-empty">
                  <History size={25} />
                  <strong>No matching tokens</strong>
                  <span>
                    Try another date, status or search term.
                  </span>
                </td>
              </tr>
            ) : (
              filteredTokens.map((token) => {
                const isExpanded = expandedTokenId === token.id;

                return (
                  <TokenRow
                    key={token.id}
                    token={token}
                    isExpanded={isExpanded}
                    details={tokenDetails[token.id]}
                    detailsLoading={detailsLoadingId === token.id}
                    detailsError={detailsErrors[token.id]}
                    onToggle={() => openTokenDetails(token)}
                    onRetry={() => retryTokenDetails(token)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="ql-history-footnote">
        Token records are retrieved from the QueueLess database. The timeline
        shows events recorded by the system.
      </p>
    </div>
  );
}

function TokenRow({
  token,
  isExpanded,
  details,
  detailsLoading,
  detailsError,
  onToggle,
  onRetry,
}) {
  return (
    <>
      <tr
        className={`ql-history-row ${isExpanded ? 'is-expanded' : ''}`}
      >
        <td>
          <button
            type="button"
            className="ql-history-token-link"
            onClick={onToggle}
            aria-expanded={isExpanded}
          >
            <span className="ql-history-token-number">
              {token.token_number}
            </span>
          </button>
        </td>

        <td>
          <span className="ql-history-customer">
            {token.customer_name || '—'}
          </span>
        </td>

        <td>
          <span className="ql-history-service">
            {token.service_name || '—'}
          </span>

          {token.service_code && (
            <span className="ql-history-code">
              {token.service_code}
            </span>
          )}
        </td>

        <td>
          <span
            className={`ql-history-status status-${token.status || 'unknown'}`}
          >
            {statusLabel(token.status)}
          </span>
        </td>

        <td className="ql-history-date">
          {formatDate(token.created_at)}
        </td>

        <td>
          <button
            type="button"
            className="ql-history-expand-button"
            onClick={onToggle}
            aria-label={`${isExpanded ? 'Hide' : 'View'} details for ${token.token_number}`}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <ChevronUp size={17} />
            ) : (
              <ChevronDown size={17} />
            )}
          </button>
        </td>
      </tr>

      {isExpanded && (
        <tr className="ql-history-detail-row">
          <td colSpan={6}>
            {detailsLoading ? (
              <div className="ql-history-detail-loading">
                <LoaderCircle
                  size={22}
                  className="ql-history-spinning"
                />
                Loading token timeline...
              </div>
            ) : detailsError ? (
              <div className="ql-history-error">
                <AlertCircle size={17} />
                <span>{detailsError}</span>
                <button type="button" onClick={onRetry}>
                  Retry
                </button>
              </div>
            ) : details ? (
              <TokenDetails details={details} />
            ) : (
              <div className="ql-history-detail-loading">
                No details are available.
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function TokenDetails({ details }) {
  const token = details.token || {};
  const events = details.events || [];

  const milestones = [
    { label: 'Created', value: token.created_at },
    { label: 'Called', value: token.called_at },
    { label: 'Service started', value: token.serving_at },
    { label: 'Completed', value: token.completed_at },
  ];

  return (
    <div className="ql-token-details">
      <div className="ql-token-details-heading">
        <div>
          <p className="ql-history-label">TOKEN RECORD</p>
          <h3>{token.token_number}</h3>
          <p>Complete record and recorded event timeline</p>
        </div>

        <span
          className={`ql-history-status status-${token.status || 'unknown'}`}
        >
          {statusLabel(token.status)}
        </span>
      </div>

      <div className="ql-token-info-grid">
        <InfoItem
          icon={<UserRound size={17} />}
          label="Customer"
          value={token.customer_name || 'Not provided'}
        />

        <InfoItem
          icon={<Building2 size={17} />}
          label="Service"
          value={token.service_name || '—'}
          secondary={token.service_code}
        />

        <InfoItem
          icon={<Hash size={17} />}
          label="Token ID"
          value={`#${token.id}`}
        />

        <InfoItem
          icon={<AlertCircle size={17} />}
          label="Priority"
          value={formatPriority(token.priority)}
        />

        <InfoItem
          icon={<Building2 size={17} />}
          label="Counter"
          value={token.counter_name || 'Not assigned'}
        />

        <InfoItem
          icon={<CalendarDays size={17} />}
          label="Token date"
          value={token.date_key || '—'}
        />
      </div>

      <section className="ql-token-milestones">
        <h4>Service timestamps</h4>

        <div className="ql-token-milestone-grid">
          {milestones.map((milestone) => (
            <div
              key={milestone.label}
              className="ql-token-milestone"
            >
              <span>{milestone.label}</span>
              <strong>{formatDate(milestone.value)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="ql-token-timeline">
        <div className="ql-token-timeline-heading">
          <h4>
            <History size={17} />
            Event timeline
          </h4>

          <span>
            {events.length} event{events.length === 1 ? '' : 's'}
          </span>
        </div>

        {events.length === 0 ? (
          <p className="ql-token-no-events">
            No event entries were recorded for this token.
          </p>
        ) : (
          <ol className="ql-token-event-list">
            {events.map((event) => {
              const EventIcon = getEventIcon(event.event_type);

              return (
                <li key={event.id} className="ql-token-event">
                  <span
                    className={`ql-token-event-icon event-${event.event_type}`}
                  >
                    <EventIcon size={16} />
                  </span>

                  <div className="ql-token-event-content">
                    <strong>
                      {EVENT_LABELS[event.event_type] ||
                        statusLabel(event.event_type)}
                    </strong>

                    <p>{getEventDescription(event)}</p>

                    {event.counter_name && (
                      <span className="ql-token-event-counter">
                        Counter: {event.counter_name}
                      </span>
                    )}
                  </div>

                  <time className="ql-token-event-time">
                    {formatDate(event.created_at)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function InfoItem({ icon, label, value, secondary }) {
  return (
    <div className="ql-token-info-item">
      <span className="ql-token-info-icon">{icon}</span>

      <div>
        <span className="ql-token-info-label">{label}</span>
        <strong>{value}</strong>

        {secondary && (
          <span className="ql-token-info-secondary">
            {secondary}
          </span>
        )}
      </div>
    </div>
  );
}
