
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Star,
  Clock,
  Building2,
  RefreshCw,
  Ticket,
  MonitorPlay,
  History,
  CalendarDays,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  Hash,
  Filter,
  X,
} from 'lucide-react';

import {
  getCustomerTokenHistory,
  getTokenEvents,
} from '../services/api';

import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const ACTIVE_STATUSES = ['waiting', 'called', 'serving'];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'called', label: 'Called' },
  { value: 'serving', label: 'Serving' },
  { value: 'completed', label: 'Completed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'cancelled', label: 'Cancelled' },
];

const EVENT_LABELS = {
  created: 'Token created',
  called: 'Customer called',
  recalled: 'Token called again',
  serving: 'Service started',
  completed: 'Service completed',
  skipped: 'Token skipped',
  cancelled: 'Token cancelled',
};

function formatDate(value) {
  if (!value) return 'Date unavailable';

  const normalized = value.includes('T')
    ? value
    : `${value.replace(' ', 'T')}Z`;

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTokenDate(token) {
  if (token.date_key) return token.date_key;

  if (!token.created_at) return '';

  const date = new Date(
    token.created_at.includes('T')
      ? token.created_at
      : `${token.created_at.replace(' ', 'T')}Z`
  );

  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function statusLabel(status) {
  const labels = {
    waiting: 'Waiting',
    called: 'Called',
    serving: 'Serving',
    completed: 'Completed',
    skipped: 'Skipped',
    cancelled: 'Cancelled',
  };

  return labels[status] || status || 'Unknown';
}

function statusClass(status) {
  const classes = {
    waiting: 'bg-amber-100 text-amber-900 border-amber-300',
    called: 'bg-blue-100 text-blue-900 border-blue-300',
    serving: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    completed: 'bg-stone-100 text-stone-700 border-stone-300',
    skipped: 'bg-red-100 text-red-800 border-red-200',
    cancelled: 'bg-red-100 text-red-800 border-red-200',
  };

  return classes[status] || 'bg-stone-100 text-stone-700 border-stone-300';
}

function formatPriority(priority) {
  if (Number(priority) === 2) return 'Urgent';
  if (Number(priority) === 1) return 'High';
  return 'Normal';
}

function getEventDescription(event) {
  if (event.details?.trim()) return event.details;

  return EVENT_LABELS[event.event_type] ||
    statusLabel(event.event_type);
}

function getEventIcon(eventType) {
  if (eventType === 'completed') return CheckCircle2;
  if (eventType === 'skipped' || eventType === 'cancelled') {
    return AlertCircle;
  }
  return Clock;
}

function TokenCard({ token, onOpen }) {
  return (
    <article className="border border-surface-800 bg-white p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs text-surface-500">
              {token.service_code || 'TOKEN'}
            </span>

            <span
              className={`inline-flex items-center border px-2 py-1 text-xs font-semibold ${statusClass(
                token.status
              )}`}
            >
              {statusLabel(token.status)}
            </span>
          </div>

          <h3 className="text-xl font-bold text-surface-100">
            {token.token_number}
          </h3>

          <p className="text-sm text-surface-600 mt-1">
            {token.service_name || 'Service'}
          </p>

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-surface-500">
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={13} />
              {formatDate(token.created_at)}
            </span>

            {token.counter_name && (
              <span className="inline-flex items-center gap-1">
                <Building2 size={13} />
                {token.counter_name}
              </span>
            )}

            {Number(token.priority) > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star size={13} />
                {formatPriority(token.priority)} priority
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpen(token.id)}
          className="btn-secondary shrink-0"
        >
          <MonitorPlay size={16} />
          View details
        </button>
      </div>
    </article>
  );
}

function TokenHistoryDetails({
  token,
  details,
  loading,
  error,
  onRetry,
}) {
  const events = details?.events || [];
  const record = details?.token || token;

  const milestones = [
    { label: 'Created', value: record.created_at || token.created_at },
    { label: 'Called', value: record.called_at || token.called_at },
    { label: 'Service started', value: record.serving_at || token.serving_at },
    { label: 'Completed', value: record.completed_at || token.completed_at },
  ];

  if (loading) {
    return (
      <div className="border-t border-amber-200 bg-stone-50 p-6 flex items-center justify-center gap-3 text-sm text-surface-500">
        <LoaderCircle size={20} className="animate-spin" />
        Loading token timeline...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="border-t border-red-200 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-red-800"
        role="alert"
      >
        <AlertCircle size={18} />
        <span className="flex-1">{error}</span>
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-amber-200 bg-stone-50 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <p className="text-xs font-bold tracking-wider text-amber-800">
            TOKEN RECORD
          </p>

          <h3 className="text-xl font-bold text-surface-100 mt-1">
            {record.token_number || token.token_number}
          </h3>

          <p className="text-xs text-surface-500 mt-1">
            Detailed service record and event timeline
          </p>
        </div>

        <span
          className={`inline-flex w-fit items-center border px-3 py-1 text-xs font-semibold ${statusClass(
            record.status || token.status
          )}`}
        >
          {statusLabel(record.status || token.status)}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px border border-surface-800 bg-surface-800">
        <DetailItem
          icon={<Hash size={16} />}
          label="Token number"
          value={record.token_number || token.token_number}
        />

        <DetailItem
          icon={<Building2 size={16} />}
          label="Service"
          value={record.service_name || token.service_name || '—'}
          secondary={record.service_code || token.service_code}
        />

        <DetailItem
          icon={<CalendarDays size={16} />}
          label="Token date"
          value={record.date_key || token.date_key || '—'}
        />

        <DetailItem
          icon={<Star size={16} />}
          label="Priority"
          value={formatPriority(record.priority ?? token.priority)}
        />

        <DetailItem
          icon={<Building2 size={16} />}
          label="Counter"
          value={record.counter_name || token.counter_name || 'Not assigned'}
        />

        <DetailItem
          icon={<Ticket size={16} />}
          label="Record ID"
          value={`#${record.id || token.id}`}
        />
      </div>

      <section className="mt-6">
        <h4 className="text-sm font-bold text-surface-100 mb-3">
          Service timestamps
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {milestones.map((item) => (
            <div
              key={item.label}
              className="border border-surface-800 bg-white p-3"
            >
              <span className="block text-xs text-surface-500 mb-2">
                {item.label}
              </span>

              <strong className="block text-xs text-surface-700 font-semibold">
                {formatDate(item.value)}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-800 pb-3">
          <h4 className="flex items-center gap-2 text-sm font-bold text-surface-100">
            <History size={17} />
            Event timeline
          </h4>

          <span className="text-xs text-surface-500">
            {events.length} event{events.length === 1 ? '' : 's'}
          </span>
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-surface-500 py-5">
            No event entries were recorded for this token.
          </p>
        ) : (
          <ol className="mt-3 space-y-0">
            {events.map((event) => {
              const EventIcon = getEventIcon(event.event_type);

              return (
                <li
                  key={event.id}
                  className="grid grid-cols-[34px_minmax(0,1fr)] sm:grid-cols-[34px_minmax(0,1fr)_auto] gap-3 py-3"
                >
                  <span className="flex items-center justify-center w-8 h-8 border border-amber-200 bg-amber-50 text-amber-800">
                    <EventIcon size={16} />
                  </span>

                  <div className="min-w-0">
                    <strong className="block text-xs font-bold text-surface-100">
                      {EVENT_LABELS[event.event_type] ||
                        statusLabel(event.event_type)}
                    </strong>

                    <p className="text-xs text-surface-600 mt-1 break-words">
                      {getEventDescription(event)}
                    </p>

                    {event.counter_name && (
                      <span className="block text-xs text-surface-500 mt-1">
                        Counter: {event.counter_name}
                      </span>
                    )}
                  </div>

                  <time className="col-start-2 sm:col-start-3 text-xs text-surface-500 sm:text-right">
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

function DetailItem({ icon, label, value, secondary }) {
  return (
    <div className="flex items-start gap-3 bg-white p-3 min-w-0">
      <span className="flex items-center justify-center w-8 h-8 shrink-0 bg-amber-50 text-amber-800">
        {icon}
      </span>

      <div className="min-w-0">
        <span className="block text-xs text-surface-500 mb-1">
          {label}
        </span>

        <strong className="block text-xs text-surface-100 break-words">
          {value}
        </strong>

        {secondary && (
          <span className="block text-xs text-surface-500 mt-1">
            {secondary}
          </span>
        )}
      </div>
    </div>
  );
}

export default function CustomerPage() {
  const navigate = useNavigate();

  const [tokens, setTokens] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const [search, setSearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [historyDate, setHistoryDate] = useState('');

  const [expandedTokenId, setExpandedTokenId] = useState(null);
  const [tokenDetails, setTokenDetails] = useState({});
  const [detailsLoadingId, setDetailsLoadingId] = useState(null);
  const [detailsErrors, setDetailsErrors] = useState({});

  const fetchCustomerHistory = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setHistoryLoading(true);
      }

      setHistoryError(null);

      const data = await getCustomerTokenHistory();
      setTokens(Array.isArray(data?.tokens) ? data.tokens : []);
    } catch (err) {
      setHistoryError(
        err.message || 'Unable to load your token history.'
      );
    } finally {
      setHistoryLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomerHistory();
  }, [fetchCustomerHistory]);

  const openTokenDisplay = (tokenId) => {
    navigate(`/display?tokenId=${encodeURIComponent(tokenId)}`);
  };

  const openHistoryDetails = async (token) => {
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

  const retryHistoryDetails = async (token) => {
    setTokenDetails((current) => {
      const updated = { ...current };
      delete updated[token.id];
      return updated;
    });

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

      setExpandedTokenId(token.id);
    } catch (err) {
      setDetailsErrors((current) => ({
        ...current,
        [token.id]: err.message || 'Unable to load token details.',
      }));
    } finally {
      setDetailsLoadingId(null);
    }
  };

  const activeTokens = useMemo(
    () =>
      tokens.filter((token) =>
        ACTIVE_STATUSES.includes(token.status)
      ),
    [tokens]
  );

  const historyTokens = useMemo(
    () =>
      tokens.filter(
        (token) => !ACTIVE_STATUSES.includes(token.status)
      ),
    [tokens]
  );

  const filteredHistory = useMemo(() => {
    const query = search.trim().toLowerCase();

    return historyTokens.filter((token) => {
      if (historyStatus && token.status !== historyStatus) {
        return false;
      }

      if (historyDate && getTokenDate(token) !== historyDate) {
        return false;
      }

      if (!query) return true;

      const searchableValues = [
        token.token_number,
        token.service_name,
        token.service_code,
        token.status,
        token.counter_name,
      ];

      return searchableValues.some((value) =>
        String(value || '').toLowerCase().includes(query)
      );
    });
  }, [historyTokens, historyStatus, historyDate, search]);

  const clearHistoryFilters = () => {
    setSearch('');
    setHistoryStatus('');
    setHistoryDate('');
    setExpandedTokenId(null);
  };

  const hasActiveFilters = Boolean(
    search || historyStatus || historyDate
  );

  if (historyLoading && tokens.length === 0) {
    return <LoadingSpinner message="Loading your QueueLess account..." />;
  }

  if (historyError && tokens.length === 0) {
    return (
      <ErrorMessage
        message={historyError}
        onRetry={fetchCustomerHistory}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8">
      <section className="page-header">
        <p className="text-sm font-semibold text-amber-800 mb-2">
          QUEUELESS · CUSTOMER ACCOUNT
        </p>

        <h1 className="page-title text-3xl sm:text-4xl">
          My Queue
        </h1>

        <p className="page-subtitle text-base mt-3 max-w-2xl">
          Track your active tokens and revisit your previous service
          history. Your tokens are saved to your account.
        </p>
      </section>

      {/* My Queue */}
      <section className="mb-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Ticket size={20} className="text-amber-800" />

              <h2 className="text-xl font-bold text-surface-100">
                My Queue
              </h2>
            </div>

            <p className="text-sm text-surface-500 mt-1">
              Your tokens that are currently waiting or being served.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchCustomerHistory(true)}
            disabled={refreshing || historyLoading}
            className="btn-secondary"
          >
            <RefreshCw
              size={15}
              className={refreshing ? 'animate-spin' : ''}
            />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {historyError && (
          <div
            role="alert"
            className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm"
          >
            {historyError}
          </div>
        )}

        {historyLoading ? (
          <div className="card p-6 text-center text-surface-500">
            Loading your tokens...
          </div>
        ) : activeTokens.length === 0 ? (
          <div className="card p-6 sm:p-8 text-center">
            <Ticket
              size={30}
              className="mx-auto text-surface-400 mb-3"
            />

            <h3 className="font-bold text-surface-100">
              No active tokens
            </h3>

            <p className="text-sm text-surface-500 mt-2">
              Tokens you generate will appear here while they are
              waiting, called, or being served.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTokens.map((token) => (
              <TokenCard
                key={token.id}
                token={token}
                onOpen={openTokenDisplay}
              />
            ))}
          </div>
        )}
      </section>

      {/* My Token History */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <History size={20} className="text-amber-800" />

          <h2 className="text-xl font-bold text-surface-100">
            My Token History
          </h2>
        </div>

        <p className="text-sm text-surface-500 mb-4">
          Search, filter and review your previous service records.
        </p>

        {/* History summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="border border-surface-800 bg-white p-3">
            <span className="block text-xs text-surface-500">
              Total records
            </span>
            <strong className="block text-xl text-surface-100 mt-1">
              {historyTokens.length}
            </strong>
          </div>

          <div className="border border-surface-800 bg-white p-3">
            <span className="block text-xs text-surface-500">
              Completed
            </span>
            <strong className="block text-xl text-emerald-700 mt-1">
              {historyTokens.filter((token) => token.status === 'completed').length}
            </strong>
          </div>

          <div className="border border-surface-800 bg-white p-3">
            <span className="block text-xs text-surface-500">
              Skipped
            </span>
            <strong className="block text-xl text-red-700 mt-1">
              {historyTokens.filter((token) => token.status === 'skipped').length}
            </strong>
          </div>

          <div className="border border-surface-800 bg-white p-3">
            <span className="block text-xs text-surface-500">
              Other statuses
            </span>
            <strong className="block text-xl text-surface-700 mt-1">
              {historyTokens.filter(
                (token) =>
                  !['completed', 'skipped'].includes(token.status)
              ).length}
            </strong>
          </div>
        </div>

        {/* Search and filters */}
        <div className="border border-surface-800 bg-white p-4 sm:p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={17} className="text-amber-800" />
            <h3 className="text-sm font-bold text-surface-100">
              Find a token record
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="flex flex-col gap-2 min-w-0">
              <span className="text-xs font-semibold text-surface-600 flex items-center gap-2">
                <Search size={14} />
                Search
              </span>

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Token or service..."
                className="w-full min-w-0 h-10 px-3 border border-surface-800 bg-white text-sm text-surface-100 focus:outline-none focus:border-amber-600"
              />
            </label>

            <label className="flex flex-col gap-2 min-w-0">
              <span className="text-xs font-semibold text-surface-600">
                Status
              </span>

              <select
                value={historyStatus}
                onChange={(event) => setHistoryStatus(event.target.value)}
                className="w-full min-w-0 h-10 px-3 border border-surface-800 bg-white text-sm text-surface-100 focus:outline-none focus:border-amber-600"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 min-w-0">
              <span className="text-xs font-semibold text-surface-600 flex items-center gap-2">
                <CalendarDays size={14} />
                Token date
              </span>

              <input
                type="date"
                value={historyDate}
                onChange={(event) => setHistoryDate(event.target.value)}
                className="w-full min-w-0 h-10 px-3 border border-surface-800 bg-white text-sm text-surface-100 focus:outline-none focus:border-amber-600"
              />
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={clearHistoryFilters}
                disabled={!hasActiveFilters}
                className="inline-flex items-center justify-center gap-2 w-full h-10 px-3 border border-surface-800 bg-stone-50 text-sm font-semibold text-surface-700 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X size={15} />
                Clear filters
              </button>
            </div>
          </div>
        </div>

        {/* History results */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <p className="text-sm text-surface-600">
            {filteredHistory.length} of {historyTokens.length} records shown
          </p>

          <p className="text-xs text-surface-500">
            Select a token to view its event timeline.
          </p>
        </div>

        {historyLoading ? (
          <div className="card p-6 text-center text-surface-500">
            Loading token history...
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="card p-6 sm:p-8 text-center">
            <History
              size={30}
              className="mx-auto text-surface-400 mb-3"
            />

            <h3 className="font-bold text-surface-100">
              {historyTokens.length === 0
                ? 'No previous token history'
                : 'No matching records'}
            </h3>

            <p className="text-sm text-surface-500 mt-2">
              {historyTokens.length === 0
                ? 'Your previous tokens will appear here after their status changes.'
                : 'Try changing your search term, status or selected date.'}
            </p>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearHistoryFilters}
                className="btn-secondary mt-4"
              >
                <X size={15} />
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredHistory.map((token) => {
              const isExpanded = expandedTokenId === token.id;

              return (
                <article
                  key={token.id}
                  className="border border-surface-800 bg-white"
                >
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <button
                        type="button"
                        onClick={() => openHistoryDetails(token)}
                        className="min-w-0 text-left flex-1"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-xs text-surface-500">
                            {token.service_code || 'TOKEN'}
                          </span>

                          <span
                            className={`inline-flex items-center border px-2 py-1 text-xs font-semibold ${statusClass(
                              token.status
                            )}`}
                          >
                            {statusLabel(token.status)}
                          </span>
                        </div>

                        <h3 className="text-xl font-bold text-surface-100">
                          {token.token_number}
                        </h3>

                        <p className="text-sm text-surface-600 mt-1">
                          {token.service_name || 'Service'}
                        </p>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-surface-500">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays size={13} />
                            {formatDate(token.created_at)}
                          </span>

                          {token.counter_name && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 size={13} />
                              {token.counter_name}
                            </span>
                          )}

                          {Number(token.priority) > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Star size={13} />
                              {formatPriority(token.priority)} priority
                            </span>
                          )}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => openHistoryDetails(token)}
                        className="inline-flex items-center justify-center gap-2 shrink-0 border border-surface-800 bg-stone-50 px-4 py-2 text-sm font-semibold text-surface-700 hover:bg-amber-50"
                        aria-label={`${isExpanded ? 'Hide' : 'View'} timeline for ${token.token_number}`}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? (
                          <>
                            Hide timeline
                            <ChevronUp size={16} />
                          </>
                        ) : (
                          <>
                            View timeline
                            <ChevronDown size={16} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <TokenHistoryDetails
                      token={token}
                      details={tokenDetails[token.id]}
                      loading={detailsLoadingId === token.id}
                      error={detailsErrors[token.id]}
                      onRetry={() => retryHistoryDetails(token)}
                    />
                  )}
                </article>
              );
            })}
          </div>
        )}

        <p className="text-xs text-surface-500 mt-4 leading-relaxed">
          Your history is retrieved using your authenticated customer
          account. Only records associated with your account are requested.
          The current history API returns up to 200 records.
        </p>
      </section>

      {/* Generate another token */}
      <section className="card p-5 sm:p-6 mt-8">
        <div className="flex items-start gap-3">
          <Ticket
            size={21}
            className="text-amber-800 mt-0.5 shrink-0"
          />

          <div>
            <h2 className="text-lg font-bold text-surface-100">
              Need another token?
            </h2>

            <p className="text-sm text-surface-500 mt-2">
              Visit the service selection page to choose a service and
              generate another token.
            </p>

            <button
              type="button"
              onClick={() => navigate('/select-service')}
              className="btn-primary mt-4"
            >
              Select a service
            </button>
          </div>
        </div>
      </section>

      <footer className="mt-8 pt-4 border-t border-surface-800 text-sm text-surface-500">
        QueueLess helps visitors check their queue status and plan their visit.
        Please follow the instructions displayed at your service centre.
      </footer>
    </div>
  );
}
