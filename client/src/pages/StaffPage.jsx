import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  PhoneCall,
  SkipForward,
  CheckCircle2,
  RefreshCw,
  Play,
  Users,
  Clock,
  Inbox,
  Building2,
  Activity,
  Monitor,
} from 'lucide-react';

import {
  getCounters,
  getQueue,
  getAnalytics,
  callNextToken,
  recallToken,
  startServingToken,
  completeToken,
  skipToken,
} from '../services/api';

import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { StatusBadge, PriorityBadge } from '../components/Badges';

export default function StaffPage() {
  const [counters, setCounters] = useState([]);
  const [selectedCounter, setSelectedCounter] = useState(null);
  const [queue, setQueue] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const requestInProgress = useRef(false);
  const mounted = useRef(true);

  const fetchData = useCallback(async () => {
    if (requestInProgress.current) return;

    requestInProgress.current = true;

    try {
      const [counterResult, queueResult] = await Promise.all([
        getCounters(),
        getQueue(),
      ]);

      if (!mounted.current) return;

      setCounters(counterResult);
      setQueue(queueResult);
      setError(null);

      setSelectedCounter((current) => {
        if (!current) return counterResult[0] || null;

        return (
          counterResult.find((counter) => counter.id === current.id) ||
          counterResult[0] ||
          null
        );
      });

      try {
        const analyticsResult = await getAnalytics();

        if (mounted.current) {
          setAnalytics(analyticsResult);
          setAnalyticsError(null);
        }
      } catch (analyticsErr) {
        if (mounted.current) {
          setAnalyticsError(
            analyticsErr.message || 'Unable to refresh service statistics.'
          );
        }
      }
    } catch (err) {
      if (mounted.current) {
        setError(err.message || 'Unable to load the staff dashboard.');
      }
    } finally {
      requestInProgress.current = false;

      if (mounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    fetchData();

    const interval = setInterval(fetchData, 5000);

    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

  const handleRefresh = async () => {
    if (refreshing || actionLoading) return;

    setRefreshing(true);

    try {
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleAction = async (action, label) => {
    if (actionLoading || !selectedCounter) return;

    try {
      setActionLoading(label);
      setActionError(null);

      await action();
      await fetchData();
    } catch (err) {
      setActionError(err.message || 'The action could not be completed.');
    } finally {
      setActionLoading(null);
    }
  };

  const activeToken = selectedCounter?.active_token || null;

  const counterQueue = selectedCounter
    ? queue.filter((token) => token.service_id === selectedCounter.service_id)
    : [];

  const serviceOverview = useMemo(() => {
    const serviceMap = new Map();

    const createService = (id, name) => ({
      id,
      name: name || 'Service',
      counters: 0,
      waiting: 0,
      called: 0,
      serving: 0,
      completed: 0,
      skipped: 0,
    });

    counters.forEach((counter) => {
      const serviceId = counter.service_id;

      if (serviceId == null) return;

      if (!serviceMap.has(serviceId)) {
        serviceMap.set(
          serviceId,
          createService(serviceId, counter.service_name)
        );
      }

      const service = serviceMap.get(serviceId);
      service.counters += 1;

      const token = counter.active_token;

      if (token?.status === 'called') {
        service.called += 1;
      } else if (token?.status === 'serving') {
        service.serving += 1;
      }
    });

    queue.forEach((token) => {
      const serviceId = token.service_id;

      if (serviceId == null) return;

      if (!serviceMap.has(serviceId)) {
        serviceMap.set(
          serviceId,
          createService(
            serviceId,
            token.service_name || token.service_code
          )
        );
      }

      serviceMap.get(serviceId).waiting += 1;
    });

    const analyticsServices = analytics?.perService || [];

    analyticsServices.forEach((item) => {
      const serviceId = item.service_id;

      if (serviceId == null) return;

      if (!serviceMap.has(serviceId)) {
        serviceMap.set(
          serviceId,
          createService(serviceId, item.service_name)
        );
      }

      const service = serviceMap.get(serviceId);

      service.completed = Number(item.completed) || 0;
      service.skipped = Number(item.skipped) || 0;
    });

    return Array.from(serviceMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [counters, queue, analytics]);

  const totals = serviceOverview.reduce(
    (result, service) => ({
      waiting: result.waiting + service.waiting,
      called: result.called + service.called,
      serving: result.serving + service.serving,
      completed: result.completed + service.completed,
      skipped: result.skipped + service.skipped,
    }),
    { waiting: 0, called: 0, serving: 0, completed: 0, skipped: 0 }
  );

  if (loading) {
    return <LoadingSpinner message="Loading staff dashboard..." />;
  }

  if (error && counters.length === 0) {
    return <ErrorMessage message={error} onRetry={fetchData} />;
  }

  return (
    <div className="ql-staff-page mx-auto px-5 sm:px-6 py-8">
      <header className="ql-staff-header">
        <div>
          <p className="ql-eyebrow">SERVICE CENTRE OPERATIONS</p>
          <h1 className="page-title">Staff Dashboard</h1>
          <p className="page-subtitle">
            Manage your counter and monitor all service queues.
          </p>
        </div>

        <button
          type="button"
          id="refresh-staff-dashboard"
          className="ql-refresh-button"
          onClick={handleRefresh}
          disabled={refreshing || Boolean(actionLoading)}
        >
          <RefreshCw
            size={17}
            className={refreshing ? 'ql-refresh-icon-spinning' : ''}
          />
          {refreshing ? 'Refreshing...' : 'Refresh queue'}
        </button>
      </header>

      {error && (
        <div className="ql-staff-error" role="alert">
          {error}
          <button type="button" onClick={fetchData}>
            Try again
          </button>
        </div>
      )}

      <section className="ql-staff-panel mb-6">
        <div className="ql-panel-heading">
          <div className="ql-panel-heading-icon">
            <Monitor size={18} />
          </div>
          <div>
            <h2>All Services Overview</h2>
            <p>Live queue activity across every available service.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-6">
          <OverviewStat icon={<Users size={16} />} label="Total waiting" value={totals.waiting} />
          <OverviewStat icon={<PhoneCall size={16} />} label="Called" value={totals.called} />
          <OverviewStat icon={<Activity size={16} />} label="Serving" value={totals.serving} />
          <OverviewStat icon={<CheckCircle2 size={16} />} label="Completed" value={totals.completed} />
          <OverviewStat icon={<SkipForward size={16} />} label="Skipped" value={totals.skipped} />
        </div>

        {serviceOverview.length === 0 ? (
          <div className="ql-queue-empty">
            <Inbox size={34} strokeWidth={1.5} />
            <h3>No service activity available</h3>
            <p>Service queue information will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {serviceOverview.map((service) => (
              <article
                key={service.id}
                className="rounded-lg border border-surface-200 p-4"
              >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2
                      size={18}
                      className="text-surface-500 shrink-0"
                    />
                    <h3 className="font-semibold truncate">{service.name}</h3>
                  </div>

                  <span className="text-xs text-surface-500 whitespace-nowrap">
                    {service.counters} counter
                    {service.counters === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
                  <ServiceCount label="Waiting" value={service.waiting} />
                  <ServiceCount label="Called" value={service.called} />
                  <ServiceCount label="Serving" value={service.serving} />
                  <ServiceCount label="Completed" value={service.completed} />
                  <ServiceCount label="Skipped" value={service.skipped} />
                </div>

                <div className="mt-3 text-xs text-surface-500 flex items-center gap-2">
                  <Activity size={14} />
                  {service.waiting + service.called + service.serving} active
                  token
                  {service.waiting + service.called + service.serving === 1
                    ? ''
                    : 's'}
                </div>
              </article>
            ))}
          </div>
        )}

        {analyticsError && (
          <p className="text-xs text-red-600 mt-3" role="status">
            Completed and skipped figures could not be refreshed: {analyticsError}
          </p>
        )}

        <p className="text-xs text-surface-500 mt-4">
          Overview refreshes automatically every 5 seconds.
        </p>
      </section>

      <div className="ql-staff-layout">
        <aside className="ql-staff-sidebar">
          <section className="ql-staff-panel">
            <div className="ql-panel-heading">
              <div className="ql-panel-heading-icon">
                <Building2 size={18} />
              </div>
              <div>
                <h2>Select counter</h2>
                <p>Choose the counter you are operating.</p>
              </div>
            </div>

            {counters.length === 0 ? (
              <p className="ql-panel-message">No counters are available.</p>
            ) : (
              <div className="ql-counter-list">
                {counters.map((counter) => {
                  const isSelected = selectedCounter?.id === counter.id;
                  const token = counter.active_token;

                  return (
                    <button
                      type="button"
                      key={counter.id}
                      id={`counter-select-${counter.id}`}
                      aria-pressed={isSelected}
                      className={`ql-counter-option ${
                        isSelected ? 'is-selected' : ''
                      }`}
                      onClick={() => {
                        setSelectedCounter(counter);
                        setActionError(null);
                      }}
                    >
                      <span className="ql-counter-option-main">
                        <span className="ql-counter-name">{counter.name}</span>
                        <span className="ql-counter-service">
                          {counter.service_name}
                        </span>
                      </span>

                      <span className="ql-counter-option-side">
                        {token ? (
                          <>
                            <span className="ql-counter-token">
                              {token.token_number}
                            </span>
                            <span className="ql-status-text active">
                              {token.status === 'called' ? 'Called' : 'Serving'}
                            </span>
                          </>
                        ) : (
                          <span className="ql-status-text">Available</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="ql-staff-panel ql-current-token">
            <div className="ql-panel-heading">
              <div className="ql-panel-heading-icon">
                <PhoneCall size={18} />
              </div>
              <div>
                <h2>Current token</h2>
                <p>
                  {selectedCounter
                    ? `${selectedCounter.name} · ${selectedCounter.service_name}`
                    : 'Select a counter first.'}
                </p>
              </div>
            </div>

            <div className="ql-current-token-body">
              {!selectedCounter ? (
                <p className="ql-panel-message">Choose a counter to continue.</p>
              ) : activeToken ? (
                <>
                  <div className="ql-token-number-box">
                    <p className="ql-token-caption">
                      {activeToken.status === 'called'
                        ? 'CUSTOMER TO CALL'
                        : 'NOW SERVING'}
                    </p>

                    <p className="ql-token-number">
                      {activeToken.token_number}
                    </p>

                    {activeToken.customer_name && (
                      <p className="ql-token-customer">
                        {activeToken.customer_name}
                      </p>
                    )}

                    <div className="ql-token-badges">
                      <StatusBadge status={activeToken.status} />
                      <PriorityBadge priority={activeToken.priority} />
                    </div>
                  </div>

                  <div className="ql-token-actions">
                    {activeToken.status === 'called' && (
                      <>
                        <button
                          type="button"
                          id="btn-start-serving"
                          className="ql-action-button primary"
                          disabled={Boolean(actionLoading)}
                          onClick={() =>
                            handleAction(
                              () => startServingToken(activeToken.id),
                              'serve'
                            )
                          }
                        >
                          <Play size={17} />
                          {actionLoading === 'serve'
                            ? 'Starting service...'
                            : 'Start serving'}
                        </button>

                        <button
                          type="button"
                          id="btn-recall"
                          className="ql-action-button secondary"
                          disabled={Boolean(actionLoading)}
                          onClick={() =>
                            handleAction(
                              () => recallToken(activeToken.id),
                              'recall'
                            )
                          }
                        >
                          <RefreshCw size={16} />
                          {actionLoading === 'recall'
                            ? 'Calling again...'
                            : 'Call again'}
                        </button>
                      </>
                    )}

                    {(activeToken.status === 'called' ||
                      activeToken.status === 'serving') && (
                      <>
                        <button
                          type="button"
                          id="btn-complete"
                          className="ql-action-button primary"
                          disabled={Boolean(actionLoading)}
                          onClick={() =>
                            handleAction(
                              () => completeToken(activeToken.id),
                              'complete'
                            )
                          }
                        >
                          <CheckCircle2 size={17} />
                          {actionLoading === 'complete'
                            ? 'Completing...'
                            : 'Complete service'}
                        </button>

                        <button
                          type="button"
                          id="btn-skip"
                          className="ql-action-button danger"
                          disabled={Boolean(actionLoading)}
                          onClick={() =>
                            handleAction(
                              () => skipToken(activeToken.id),
                              'skip'
                            )
                          }
                        >
                          <SkipForward size={17} />
                          {actionLoading === 'skip' ? 'Skipping...' : 'Skip token'}
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="ql-no-active-token">
                  <Inbox size={38} strokeWidth={1.5} />
                  <h3>No active token</h3>
                  <p>Call the next customer waiting for this service.</p>

                  <button
                    type="button"
                    id="btn-call-next"
                    className="ql-call-next-button"
                    disabled={
                      Boolean(actionLoading) || counterQueue.length === 0
                    }
                    onClick={() =>
                      handleAction(
                        () => callNextToken(selectedCounter.id),
                        'call'
                      )
                    }
                  >
                    <PhoneCall size={19} />
                    {actionLoading === 'call'
                      ? 'Calling next customer...'
                      : 'Call next customer'}
                    {!actionLoading && <span aria-hidden="true">→</span>}
                  </button>

                  {counterQueue.length === 0 && (
                    <p className="ql-no-waiting-note">
                      No customers are waiting in this queue.
                    </p>
                  )}
                </div>
              )}

              {actionError && (
                <div className="ql-staff-error mt-4" role="alert">
                  {actionError}
                </div>
              )}
            </div>
          </section>
        </aside>

        <section className="ql-staff-panel ql-waiting-panel">
          <div className="ql-panel-heading ql-queue-heading">
            <div className="ql-panel-heading-icon">
              <Users size={18} />
            </div>

            <div className="ql-queue-heading-text">
              <h2>Waiting queue</h2>
              <p>
                {selectedCounter
                  ? `Customers waiting for ${selectedCounter.service_name}`
                  : 'Select a counter to view its queue.'}
              </p>
            </div>

            <span className="ql-waiting-count">
              <span />
              {counterQueue.length} waiting
            </span>
          </div>

          {!selectedCounter ? (
            <div className="ql-queue-empty">
              <Inbox size={38} strokeWidth={1.5} />
              <h3>Select a counter</h3>
              <p>Choose a counter on the left to view its queue.</p>
            </div>
          ) : counterQueue.length === 0 ? (
            <div className="ql-queue-empty">
              <Inbox size={38} strokeWidth={1.5} />
              <h3>No customers waiting</h3>
              <p>New tokens will appear here when customers join the queue.</p>
            </div>
          ) : (
            <>
              <div className="ql-queue-table-header">
                <span>POSITION</span>
                <span>TOKEN / CUSTOMER</span>
                <span>PRIORITY</span>
                <span>WAITING</span>
              </div>

              <div className="ql-queue-list">
                {counterQueue.map((token, index) => (
                  <div className="ql-queue-item" key={token.id}>
                    <span className="ql-queue-position">{index + 1}</span>

                    <div className="ql-queue-customer">
                      <span className="ql-queue-token-number">
                        {token.token_number}
                      </span>
                      <span className="ql-queue-customer-name">
                        {token.customer_name || 'Customer'}
                      </span>
                    </div>

                    <div className="ql-queue-priority">
                      <PriorityBadge priority={token.priority} />
                    </div>

                    <div className="ql-queue-wait">
                      <Clock size={15} />
                      {getWaitTime(token.created_at)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="ql-queue-footer">
                <Users size={15} />
                Showing {counterQueue.length} waiting token
                {counterQueue.length === 1 ? '' : 's'} for this service.
              </div>
            </>
          )}
        </section>
      </div>

      <p className="ql-staff-footnote">
        Queue data refreshes automatically. Verify the selected counter before
        performing a token action.
      </p>
    </div>
  );
}

function OverviewStat({ icon, label, value }) {
  return (
    <div className="rounded-lg border border-surface-200 p-4">
      <div className="flex items-center gap-2 text-sm text-surface-500">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-semibold mt-2">{value}</p>
    </div>
  );
}

function ServiceCount({ label, value }) {
  return (
    <div className="rounded-md bg-surface-100 p-3">
      <p className="text-xs text-surface-500">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function getWaitTime(createdAt) {
  if (!createdAt) return '—';

  const normalized = createdAt.includes('T')
    ? createdAt
    : `${createdAt.replace(' ', 'T')}Z`;

  const created = new Date(normalized);

  if (Number.isNaN(created.getTime())) return '—';

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - created.getTime()) / 60000)
  );

  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}