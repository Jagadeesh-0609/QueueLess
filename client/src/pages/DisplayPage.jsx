import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  Monitor,
  Clock,
  Users,
  Megaphone,
  ArrowRight,
  Zap,
  Star,
  RefreshCw,
  Building2,
  AlertCircle,
  History,
  CheckCircle2,
  Circle,
  LoaderCircle,
} from 'lucide-react';

import {
  getDisplayData,
  getCustomerDisplayData,
  getTokenEvents,
} from '../services/api';

import { useAuth } from '../context/AuthContext';

const REFRESH_INTERVAL = 2000;
const CUSTOMER_TOKEN_KEY = 'queueless_customer_token_id';

const EVENT_LABELS = {
  created: 'Token created',
  called: 'Customer called',
  recalled: 'Token called again',
  serving: 'Service started',
  completed: 'Service completed',
  skipped: 'Token skipped',
};

function formatDate(value) {
  if (!value) return 'Not recorded';

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

function getEventIcon(type) {
  if (type === 'completed') return CheckCircle2;
  if (type === 'skipped') return AlertCircle;
  if (type === 'created') return Circle;

  return Clock;
}

function getStatusMessage(status) {
  switch (status) {
    case 'waiting':
      return 'Please wait until your token is called.';
    case 'called':
      return 'Your token has been called. Please proceed to your counter.';
    case 'serving':
      return 'Your service is currently in progress.';
    case 'completed':
      return 'Your service has been completed.';
    case 'skipped':
      return 'Your token has been skipped. Please contact staff.';
    case 'cancelled':
      return 'This token has been cancelled.';
    default:
      return 'Your token status is being updated.';
  }
}

export default function DisplayPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const tokenId = searchParams.get('tokenId');
  const isCustomer = user?.role === 'customer';
  const isCustomerDisplay = isCustomer && Boolean(tokenId);

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [timeline, setTimeline] = useState(null);
  const [timelineError, setTimelineError] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const activeRef = useRef(true);
  const requestRef = useRef(false);

  const fetchDisplay = useCallback(async (manual = false) => {
    if (requestRef.current) return;

    if (isCustomer && !tokenId) {
      navigate('/customer', { replace: true });
      return;
    }

    requestRef.current = true;

    if (manual) {
      setRefreshing(true);
    }

    try {
      const result = isCustomer
        ? await getCustomerDisplayData(tokenId)
        : await getDisplayData();

      if (!activeRef.current) return;

      // Save only the token ID confirmed by the authenticated backend.
      if (isCustomer && result?.ownToken?.id) {
        window.localStorage.setItem(
          CUSTOMER_TOKEN_KEY,
          String(result.ownToken.id)
        );
      }

      setData(result);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (!activeRef.current) return;

      if (isCustomer && err.status === 404) {
        window.localStorage.removeItem(CUSTOMER_TOKEN_KEY);
        navigate('/customer', { replace: true });
        return;
      }

      if (!isCustomer && err.status === 403) {
        navigate('/login', { replace: true });
        return;
      }

      setError(err.message || 'Unable to connect to the server.');
    } finally {
      requestRef.current = false;

      if (activeRef.current && manual) {
        setRefreshing(false);
      }
    }
  }, [isCustomer, tokenId, navigate]);

  const fetchTimeline = useCallback(async () => {
    if (!isCustomerDisplay || !tokenId) return;

    try {
      setTimelineLoading(true);
      setTimelineError(null);

      const result = await getTokenEvents(tokenId);

      if (activeRef.current) {
        setTimeline(result);
      }
    } catch (err) {
      if (activeRef.current) {
        setTimelineError(
          err.message || 'Unable to load token event history.'
        );
      }
    } finally {
      if (activeRef.current) {
        setTimelineLoading(false);
      }
    }
  }, [isCustomerDisplay, tokenId]);

  useEffect(() => {
    activeRef.current = true;
    requestRef.current = false;

    setData(null);
    setError(null);
    setLastUpdated(null);
    setTimeline(null);
    setTimelineError(null);

    if (isCustomer && !tokenId) {
      navigate('/customer', { replace: true });
      return () => {
        activeRef.current = false;
      };
    }

    fetchDisplay();

    const interval = setInterval(() => {
      fetchDisplay();
    }, REFRESH_INTERVAL);

    return () => {
      activeRef.current = false;
      clearInterval(interval);
    };
  }, [fetchDisplay, isCustomer, tokenId, navigate]);

  useEffect(() => {
    if (isCustomerDisplay) {
      fetchTimeline();
    }
  }, [isCustomerDisplay, tokenId, fetchTimeline]);

  const currentTokens = data?.currentTokens || [];
  const upcomingTokens = data?.upcomingTokens || [];
  const announcements = data?.announcements || [];
  const stats = data?.stats || {};

  const ownToken = data?.ownToken;
  const service = data?.service;

  const waitingCount =
    stats.waiting_count ?? upcomingTokens.length;

  const activeCount =
    stats.active_count ?? currentTokens.length;

  const completedCount =
    stats.completed_count ?? 0;

  if (!data && error) {
    return (
      <main className="ql-display-page">
        <section className="ql-display-message">
          <Monitor size={44} />

          <h1>Display temporarily unavailable</h1>

          <p>
            Check the server connection. The screen will retry automatically.
          </p>

          <p className="ql-display-error">{error}</p>

          {isCustomer && (
            <button
              type="button"
              className="ql-display-refresh-button"
              onClick={() => navigate('/customer')}
            >
              <ArrowRight size={17} />
              Back to services
            </button>
          )}

          <button
            type="button"
            className="ql-display-refresh-button"
            onClick={() => fetchDisplay(true)}
            disabled={refreshing}
          >
            <RefreshCw size={17} />
            {refreshing ? 'Connecting...' : 'Retry now'}
          </button>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="ql-display-page">
        <section className="ql-display-message">
          <RefreshCw
            size={32}
            className="ql-display-loading-icon"
          />

          <h1>Loading queue information</h1>

          <p>
            Please wait while the latest token information is retrieved.
          </p>

          {error && (
            <p className="ql-display-error">{error}</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="ql-display-page">
      <header className="ql-display-header">
        <div className="ql-display-brand">
          <span className="ql-display-brand-icon">
            <Users size={25} />
          </span>

          <div>
            <h1>QueueLess</h1>

            <p>
              {isCustomerDisplay
                ? `${service?.name || 'Service'} Queue`
                : 'Service Centre Queue'}
            </p>
          </div>
        </div>

        <div className="ql-display-live">
          <span className="ql-display-live-dot" />

          Live queue

          <span className="ql-display-updated">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : 'Connecting'}
          </span>

          <button
            type="button"
            className="ql-display-refresh-button"
            onClick={() => fetchDisplay(true)}
            disabled={refreshing}
            aria-label="Refresh queue display"
            title="Refresh now"
          >
            <RefreshCw
              size={16}
              className={refreshing ? 'ql-display-loading-icon' : ''}
            />

            <span>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </span>
          </button>
        </div>
      </header>

      {isCustomerDisplay && ownToken && (
        <section className="ql-display-customer-token">
          <div className="ql-display-customer-token-heading">
            <div>
              <p className="ql-display-eyebrow">YOUR QUEUE STATUS</p>

              <h2>Your token</h2>
            </div>

            <span
              className={`ql-display-customer-status status-${ownToken.status}`}
            >
              {statusLabel(ownToken.status)}
            </span>
          </div>

          <div className="ql-display-customer-token-number">
            <p>Your token number</p>

            <strong>{ownToken.token_number}</strong>

            <span>{getStatusMessage(ownToken.status)}</span>
          </div>

          <div className="ql-display-customer-details">
            <div>
              <span>Service</span>
              <strong>
                {ownToken.service_name || service?.name || 'Service'}
              </strong>
            </div>

            <div>
              <span>Queue position</span>
              <strong>
                {ownToken.queue_position != null
                  ? `#${ownToken.queue_position}`
                  : ownToken.status === 'waiting'
                    ? 'Updating'
                    : '—'}
              </strong>
            </div>

            <div>
              <span>Estimated wait</span>
              <strong>
                {ownToken.status === 'waiting'
                  ? `${ownToken.estimated_wait_min ?? 0} min`
                  : '—'}
              </strong>
            </div>

            <div>
              <span>Counter</span>
              <strong>
                {ownToken.counter_name || 'Not assigned'}
              </strong>
            </div>
          </div>
        </section>
      )}

      <section className="ql-display-stats" aria-label="Queue summary">
        <div className="ql-display-stat">
          <span className="ql-display-stat-label">
            <Users size={17} />
            Waiting
          </span>

          <strong>{waitingCount}</strong>
        </div>

        <div className="ql-display-stat">
          <span className="ql-display-stat-label">
            <Monitor size={17} />
            Active
          </span>

          <strong>{activeCount}</strong>
        </div>

        <div className="ql-display-stat">
          <span className="ql-display-stat-label">
            <Clock size={17} />
            Completed
          </span>

          <strong>{completedCount}</strong>
        </div>
      </section>

      <div className="ql-display-content">
        <section className="ql-display-serving-section">
          <div className="ql-display-section-heading">
            <div>
              <p className="ql-display-eyebrow">TOKEN ANNOUNCEMENTS</p>
              <h2>Now serving</h2>
            </div>

            <span className="ql-display-section-count">
              {currentTokens.length} active
            </span>
          </div>

          {currentTokens.length === 0 ? (
            <div className="ql-display-empty">
              <Clock size={42} />

              <h3>No token is being called</h3>

              <p>
                Please wait. The next token will appear here.
              </p>
            </div>
          ) : (
            <div className="ql-display-current-grid">
              {currentTokens.map((token) => (
                <article
                  key={token.id}
                  className={`ql-display-current-token ${
                    token.status === 'called'
                      ? 'is-called'
                      : 'is-serving'
                  }`}
                >
                  <div className="ql-display-current-top">
                    <span className="ql-display-status">
                      <span />

                      {token.status === 'called'
                        ? 'PLEASE PROCEED'
                        : 'NOW SERVING'}
                    </span>

                    {token.priority > 0 && (
                      <span className="ql-display-priority">
                        {token.priority === 2 ? (
                          <Zap size={15} />
                        ) : (
                          <Star size={15} />
                        )}

                        {token.priority === 2 ? 'Urgent' : 'Priority'}
                      </span>
                    )}
                  </div>

                  <p className="ql-display-token-number">
                    {token.token_number}
                  </p>

                  <div className="ql-display-counter">
                    <ArrowRight size={20} />

                    <div>
                      <span>Proceed to</span>

                      <strong>
                        {token.counter_name || 'Please check with staff'}
                      </strong>
                    </div>
                  </div>

                  <div className="ql-display-service">
                    <Building2 size={16} />
                    {token.service_name || 'Service counter'}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="ql-display-upcoming-section">
          <div className="ql-display-section-heading">
            <div>
              <p className="ql-display-eyebrow">
                PLEASE WAIT FOR YOUR TURN
              </p>

              <h2>Upcoming tokens</h2>
            </div>
          </div>

          {upcomingTokens.length === 0 ? (
            <div className="ql-display-no-upcoming">
              <Users size={32} />

              <p>No tokens are waiting right now.</p>
            </div>
          ) : (
            <div className="ql-display-upcoming-list">
              {upcomingTokens.map((token, index) => (
                <div
                  className="ql-display-upcoming-row"
                  key={`${token.token_number}-${index}`}
                >
                  <span className="ql-display-position">
                    {index + 1}
                  </span>

                  <div className="ql-display-upcoming-info">
                    <strong>{token.token_number}</strong>

                    <span>
                      {token.service_code || token.service_name || 'Service'}
                    </span>
                  </div>

                  {token.priority > 0 && (
                    <span
                      className={`ql-display-priority-tag ${
                        token.priority === 2 ? 'urgent' : ''
                      }`}
                    >
                      {token.priority === 2 ? 'Urgent' : 'Priority'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {announcements.length > 0 && (
            <section className="ql-display-announcements">
              <h2>
                <Megaphone size={18} />
                Announcements
              </h2>

              {announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  className={`ql-display-announcement ${
                    announcement.priority > 0 ? 'important' : ''
                  }`}
                >
                  {announcement.message}
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>

      {isCustomerDisplay && (
        <section className="ql-display-customer-history">
          <div className="ql-display-section-heading">
            <div>
              <p className="ql-display-eyebrow">TOKEN ACTIVITY</p>

              <h2>
                <History size={20} />
                Your token timeline
              </h2>
            </div>

            <button
              type="button"
              className="ql-display-refresh-button"
              onClick={fetchTimeline}
              disabled={timelineLoading}
            >
              <RefreshCw
                size={15}
                className={timelineLoading ? 'ql-display-loading-icon' : ''}
              />

              {timelineLoading ? 'Loading...' : 'Refresh history'}
            </button>
          </div>

          {timelineLoading && !timeline ? (
            <div className="ql-history-detail-loading">
              <LoaderCircle
                size={22}
                className="ql-history-spinning"
              />

              Loading token timeline...
            </div>
          ) : timelineError ? (
            <div className="ql-history-error" role="alert">
              <AlertCircle size={17} />
              <span>{timelineError}</span>
            </div>
          ) : timeline?.events?.length ? (
            <ol className="ql-token-event-list">
              {timeline.events.map((event) => {
                const EventIcon = getEventIcon(event.event_type);

                return (
                  <li
                    key={event.id}
                    className="ql-token-event"
                  >
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

                      <p>
                        {event.details?.trim() ||
                          EVENT_LABELS[event.event_type] ||
                          statusLabel(event.event_type)}
                      </p>

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
          ) : timeline ? (
            <p className="ql-token-no-events">
              No event entries have been recorded for this token.
            </p>
          ) : null}
        </section>
      )}

      <footer className="ql-display-footer">
        <span>QueueLess · Service Centre Queue Management</span>

        <span>
          Please check the screen when your token is called.
        </span>
      </footer>

      {error && (
        <div className="ql-display-connection-warning" role="status">
          <AlertCircle size={16} />

          Connection interrupted. Showing the last available queue
          information. The screen will retry automatically.
        </div>
      )}
    </main>
  );
}