
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  RefreshCw,
  Users,
  XCircle,
} from 'lucide-react';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { getAnalytics } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import TokenHistory from '../components/TokenHistory';

const REFRESH_INTERVAL = 5000;

const STATUS_COLORS = {
  completed: '#16a34a',
  waiting: '#eab308',
  active: '#3b82f6',
  skipped: '#f97316',
  cancelled: '#dc2626',
};

const PRIORITY_COLORS = ['#64748b', '#eab308', '#f97316', '#dc2626'];

const EMPTY_OVERVIEW = {
  total_tokens: 0,
  completed_tokens: 0,
  waiting_tokens: 0,
  active_tokens: 0,
  skipped_tokens: 0,
  cancelled_tokens: 0,
};

const EMPTY_ANALYTICS = {
  overview: EMPTY_OVERVIEW,
  perService: [],
  perCounter: [],
  hourly: [],
  priorityDist: [],
  dailyCounts: [],
  waitTime: {},
  serviceDuration: {},
};

const number = (value) => Number(value) || 0;

const formatMinutes = (value) => {
  if (value === null || value === undefined) return '—';
  return `${number(value).toFixed(1)} min`;
};

const formatHour = (value) => {
  const hour = Number(value);

  if (!Number.isFinite(hour)) return value;

  return `${String(hour).padStart(2, '0')}:00`;
};

const formatDate = (value) => {
  if (!value) return '—';

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{label}</p>

      {payload.map((entry, index) => (
        <div
          key={`${entry.dataKey || entry.name}-${index}`}
          className="flex items-center justify-between gap-4 text-sm"
        >
          <span className="flex items-center gap-2">
            <span
              className="chart-tooltip-dot"
              style={{ backgroundColor: entry.color || entry.fill }}
            />
            {entry.name}
          </span>

          <strong>{number(entry.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ message = 'No data available for this date.' }) {
  return (
    <div className="chart-empty">
      <BarChart3 size={28} />
      <p>{message}</p>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, detail, color }) {
  return (
    <div className="ql-analytics-stat">
      <div className="ql-analytics-stat-top">
        <span className="ql-analytics-stat-icon" style={{ color }}>
          <Icon size={19} />
        </span>

        <span className="ql-analytics-stat-label">{label}</span>
      </div>

      <div className="ql-analytics-stat-value">
        {number(value).toLocaleString()}
      </div>

      {detail && (
        <div className="ql-analytics-stat-detail">{detail}</div>
      )}
    </div>
  );
}

function ChartPanel({ title, subtitle, children, className = '' }) {
  return (
    <section className={`ql-analytics-panel ${className}`}>
      <div className="ql-analytics-chart-heading">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>

      <div className="ql-analytics-chart-content">{children}</div>
    </section>
  );
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function AnalyticsPage() {
  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const requestInProgress = useRef(false);
  const pendingRequest = useRef(null);
  const mounted = useRef(false);
  const hasLoadedData = useRef(false);

  const fetchAnalytics = useCallback(async (date, manual = false) => {
    if (!date) return;

    if (requestInProgress.current) {
      if (date !== selectedDate) {
        pendingRequest.current = { date, manual };
      }
      return;
    }

    requestInProgress.current = true;

    if (mounted.current) {
      if (!hasLoadedData.current) {
        setLoading(true);
      } else if (manual) {
        setRefreshing(true);
      }
    }

    try {
      const response = await getAnalytics(date);

      if (!mounted.current) return;

      setAnalytics({
        ...EMPTY_ANALYTICS,
        ...response,
        overview: {
          ...EMPTY_OVERVIEW,
          ...(response?.overview || {}),
        },
        perService: Array.isArray(response?.perService)
          ? response.perService
          : [],
        perCounter: Array.isArray(response?.perCounter)
          ? response.perCounter
          : [],
        hourly: Array.isArray(response?.hourly)
          ? response.hourly
          : [],
        priorityDist: Array.isArray(response?.priorityDist)
          ? response.priorityDist
          : [],
        dailyCounts: Array.isArray(response?.dailyCounts)
          ? response.dailyCounts
          : [],
      });

      hasLoadedData.current = true;
      setError('');
    } catch (err) {
      if (mounted.current) {
        setError(
          err?.message || 'Unable to load analytics. Please try again.'
        );
      }
    } finally {
      requestInProgress.current = false;

      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }

      const pending = pendingRequest.current;
      pendingRequest.current = null;

      if (pending && pending.date !== date && mounted.current) {
        Promise.resolve().then(() => {
          fetchAnalytics(pending.date, pending.manual);
        });
      }
    }
  }, [selectedDate]);

  useEffect(() => {
    mounted.current = true;

    fetchAnalytics(selectedDate);

    const interval = setInterval(() => {
      fetchAnalytics(selectedDate);
    }, REFRESH_INTERVAL);

    return () => {
      mounted.current = false;
      clearInterval(interval);
      pendingRequest.current = null;
    };
  }, [selectedDate, fetchAnalytics]);

  // Backend response uses total/completed/waiting/active/skipped/cancelled.
  const serviceData = useMemo(
    () =>
      analytics.perService.map((service) => ({
        ...service,
        service_name: service.service_name || 'Unknown Service',
        total_tokens: number(service.total),
        completed_tokens: number(service.completed),
        waiting_tokens: number(service.waiting),
        active_tokens: number(service.active),
        skipped_tokens: number(service.skipped),
        cancelled_tokens: number(service.cancelled),
      })),
    [analytics.perService]
  );

  // Backend response uses assigned_tokens and short status names.
  const counterData = useMemo(
    () =>
      analytics.perCounter.map((counter) => ({
        ...counter,
        counter_name: counter.counter_name || 'Unknown Counter',
        assigned_tokens: number(counter.assigned_tokens),
        completed_tokens: number(counter.completed),
        waiting_tokens: number(counter.waiting),
        active_tokens: number(counter.active),
        skipped_tokens: number(counter.skipped),
        cancelled_tokens: number(counter.cancelled),
      })),
    [analytics.perCounter]
  );

  // Backend response uses count, not total_tokens.
  const hourlyData = useMemo(
    () =>
      analytics.hourly.map((item) => ({
        ...item,
        hour_label: formatHour(item.hour),
        total_tokens: number(item.count),
      })),
    [analytics.hourly]
  );

  // Backend response uses priority_label and count.
  const priorityData = useMemo(
    () =>
      analytics.priorityDist.map((item) => ({
        ...item,
        priority: item.priority_label || 'Unknown',
        count: number(item.count),
      })),
    [analytics.priorityDist]
  );

  // Backend response uses date_key, total and short status names.
  const dailyData = useMemo(
    () =>
      analytics.dailyCounts.map((item) => ({
        ...item,
        date_label: formatDate(item.date_key),
        total_tokens: number(item.total),
        completed_tokens: number(item.completed),
        waiting_tokens: number(item.waiting),
        active_tokens: number(item.active),
        skipped_tokens: number(item.skipped),
        cancelled_tokens: number(item.cancelled),
      })),
    [analytics.dailyCounts]
  );

  const overview = analytics.overview || EMPTY_OVERVIEW;

  const hasHourlyData = hourlyData.some((item) => item.total_tokens > 0);
  const hasServiceData = serviceData.some((item) => item.total_tokens > 0);
  const hasCounterData = counterData.some((item) => item.assigned_tokens > 0);
  const hasPriorityData = priorityData.some((item) => item.count > 0);
  const hasDailyData = dailyData.some((item) => item.total_tokens > 0);

  const handleDateChange = (event) => {
    const value = event.target.value;
    if (value) setSelectedDate(value);
  };

  const handleRefresh = () => {
    fetchAnalytics(selectedDate, true);
  };

  const handleExport = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Date', selectedDate],
      ['Total Tokens', number(overview.total_tokens)],
      ['Completed', number(overview.completed_tokens)],
      ['Waiting', number(overview.waiting_tokens)],
      ['Active', number(overview.active_tokens)],
      ['Skipped', number(overview.skipped_tokens)],
      ['Cancelled', number(overview.cancelled_tokens)],
      [],
      [
        'Service',
        'Total',
        'Completed',
        'Waiting',
        'Active',
        'Skipped',
        'Cancelled',
      ],
      ...serviceData.map((item) => [
        item.service_name,
        item.total_tokens,
        item.completed_tokens,
        item.waiting_tokens,
        item.active_tokens,
        item.skipped_tokens,
        item.cancelled_tokens,
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value ?? '');
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `queueless-analytics-${selectedDate}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  const statCards = [
    {
      label: 'Total Tokens',
      value: overview.total_tokens,
      detail: 'Tokens generated',
      icon: Users,
      color: '#64748b',
    },
    {
      label: 'Completed',
      value: overview.completed_tokens,
      detail: 'Successfully served',
      icon: CheckCircle2,
      color: STATUS_COLORS.completed,
    },
    {
      label: 'Waiting',
      value: overview.waiting_tokens,
      detail: 'In queue',
      icon: Clock3,
      color: STATUS_COLORS.waiting,
    },
    {
      label: 'Active',
      value: overview.active_tokens,
      detail: 'Called or serving',
      icon: Activity,
      color: STATUS_COLORS.active,
    },
    {
      label: 'Skipped',
      value: overview.skipped_tokens,
      detail: 'Skipped tokens',
      icon: RefreshCw,
      color: STATUS_COLORS.skipped,
    },
    {
      label: 'Cancelled',
      value: overview.cancelled_tokens,
      detail: 'Cancelled tokens',
      icon: XCircle,
      color: STATUS_COLORS.cancelled,
    },
  ];

  if (loading && !hasLoadedData.current) {
    return <LoadingSpinner />;
  }

  return (
    <div className="ql-analytics-page">
      <div className="ql-analytics-header">
        <div>
          <span className="ql-analytics-eyebrow">REPORTS & INSIGHTS</span>
          <h1>Analytics Dashboard</h1>
          <p>Monitor queue activity and service performance.</p>
        </div>

        <div className="ql-analytics-actions">
          <label className="ql-analytics-date-control">
            <CalendarDays size={17} />
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              aria-label="Select analytics date"
            />
          </label>

          <button
            type="button"
            className="ql-analytics-refresh"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              size={16}
              className={refreshing ? 'spinning' : ''}
            />
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>

          <button
            type="button"
            className="ql-analytics-refresh"
            onClick={handleExport}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="ql-analytics-error">
          <ErrorMessage message={error} />
          <button type="button" onClick={handleRefresh}>
            Try again
          </button>
        </div>
      )}

      <div className="ql-analytics-stats">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="ql-analytics-section-heading">
        <div>
          <h2>Queue Insights</h2>
          <p>Activity for {formatDate(selectedDate)}</p>
        </div>
      </div>

      <div className="ql-analytics-chart-grid">
        <ChartPanel
          title="Hourly Token Volume"
          subtitle="Tokens generated across the day"
        >
          {hasHourlyData ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour_label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="total_tokens"
                  name="Tokens"
                  fill="#64748b"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartPanel>

        <ChartPanel
          title="Priority Distribution"
          subtitle="Token distribution by priority"
        >
          {hasPriorityData ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={priorityData}
                  dataKey="count"
                  nameKey="priority"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {priorityData.map((item, index) => (
                    <Cell
                      key={`${item.priority}-${index}`}
                      fill={PRIORITY_COLORS[index % PRIORITY_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartPanel>

        <ChartPanel
          title="Service Comparison"
          subtitle="Status breakdown for each service"
          className="ql-analytics-wide-panel"
        >
          {hasServiceData ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={serviceData}
                margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="service_name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                />
                <YAxis allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />

                <Bar
                  dataKey="completed_tokens"
                  name="Completed"
                  stackId="status"
                  fill={STATUS_COLORS.completed}
                />
                <Bar
                  dataKey="waiting_tokens"
                  name="Waiting"
                  stackId="status"
                  fill={STATUS_COLORS.waiting}
                />
                <Bar
                  dataKey="active_tokens"
                  name="Active"
                  stackId="status"
                  fill={STATUS_COLORS.active}
                />
                <Bar
                  dataKey="skipped_tokens"
                  name="Skipped"
                  stackId="status"
                  fill={STATUS_COLORS.skipped}
                />
                <Bar
                  dataKey="cancelled_tokens"
                  name="Cancelled"
                  stackId="status"
                  fill={STATUS_COLORS.cancelled}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartPanel>

        <ChartPanel
          title="Counter Performance"
          subtitle="Token status breakdown by counter"
          className="ql-analytics-wide-panel"
        >
          {hasCounterData ? (
            <ResponsiveContainer
              width="100%"
              height={Math.max(280, counterData.length * 55)}
            >
              <BarChart
                data={counterData}
                layout="vertical"
                margin={{ top: 8, right: 20, left: 15, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="counter_name"
                  width={100}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />

                <Bar
                  dataKey="completed_tokens"
                  name="Completed"
                  stackId="counter"
                  fill={STATUS_COLORS.completed}
                />
                <Bar
                  dataKey="waiting_tokens"
                  name="Waiting"
                  stackId="counter"
                  fill={STATUS_COLORS.waiting}
                />
                <Bar
                  dataKey="active_tokens"
                  name="Active"
                  stackId="counter"
                  fill={STATUS_COLORS.active}
                />
                <Bar
                  dataKey="skipped_tokens"
                  name="Skipped"
                  stackId="counter"
                  fill={STATUS_COLORS.skipped}
                />
                <Bar
                  dataKey="cancelled_tokens"
                  name="Cancelled"
                  stackId="counter"
                  fill={STATUS_COLORS.cancelled}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No counter activity for this date." />
          )}
        </ChartPanel>

        <ChartPanel
          title="Seven-Day Queue Trend"
          subtitle="Daily token volume and status trends"
          className="ql-analytics-wide-panel"
        >
          {hasDailyData ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={dailyData}
                margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date_label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />

                <Line
                  type="monotone"
                  dataKey="total_tokens"
                  name="Total"
                  stroke="#64748b"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="completed_tokens"
                  name="Completed"
                  stroke={STATUS_COLORS.completed}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="waiting_tokens"
                  name="Waiting"
                  stroke={STATUS_COLORS.waiting}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="active_tokens"
                  name="Active"
                  stroke={STATUS_COLORS.active}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="skipped_tokens"
                  name="Skipped"
                  stroke={STATUS_COLORS.skipped}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="cancelled_tokens"
                  name="Cancelled"
                  stroke={STATUS_COLORS.cancelled}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No token activity in this seven-day period." />
          )}
        </ChartPanel>
      </div>

      <section className="ql-analytics-section">
        <div className="ql-analytics-section-heading">
          <div>
            <h2>Service Performance</h2>
            <p>Detailed service-wise token statistics</p>
          </div>
        </div>

        <div className="ql-analytics-table-wrapper">
          <table className="ql-analytics-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Total</th>
                <th>Completed</th>
                <th>Waiting</th>
                <th>Active</th>
                <th>Skipped</th>
                <th>Cancelled</th>
                <th>Avg. Wait</th>
                <th>Avg. Service</th>
              </tr>
            </thead>

            <tbody>
              {serviceData.length > 0 ? (
                serviceData.map((service) => (
                  <tr key={service.service_id}>
                    <td>
                      <strong>{service.service_name}</strong>
                    </td>
                    <td>{service.total_tokens}</td>
                    <td className="number-completed">
                      {service.completed_tokens}
                    </td>
                    <td className="number-waiting">
                      {service.waiting_tokens}
                    </td>
                    <td>{service.active_tokens}</td>
                    <td>{service.skipped_tokens}</td>
                    <td>{service.cancelled_tokens}</td>
                    <td>{formatMinutes(service.avg_wait_min)}</td>
                    <td>{formatMinutes(service.avg_service_min)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="no-data">
                    No service data available for this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ql-analytics-section">
        <div className="ql-analytics-section-heading">
          <div>
            <h2>Counter Performance Details</h2>
            <p>Counter-wise completion and queue activity</p>
          </div>
        </div>

        <div className="ql-analytics-table-wrapper">
          <table className="ql-analytics-table">
            <thead>
              <tr>
                <th>Counter</th>
                <th>Assigned Tokens</th>
                <th>Completed</th>
                <th>Waiting</th>
                <th>Active</th>
                <th>Skipped</th>
                <th>Cancelled</th>
                <th>Avg. Service</th>
              </tr>
            </thead>

            <tbody>
              {counterData.length > 0 ? (
                counterData.map((counter) => (
                  <tr key={counter.counter_id}>
                    <td>
                      <strong>{counter.counter_name}</strong>
                    </td>
                    <td>{counter.assigned_tokens}</td>
                    <td className="number-completed">
                      {counter.completed_tokens}
                    </td>
                    <td className="number-waiting">
                      {counter.waiting_tokens}
                    </td>
                    <td>{counter.active_tokens}</td>
                    <td>{counter.skipped_tokens}</td>
                    <td>{counter.cancelled_tokens}</td>
                    <td>{formatMinutes(counter.avg_service_min)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="no-data">
                    No counter data available for this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ql-analytics-section">
        <div className="ql-analytics-section-heading">
          <div>
            <h2>Token History</h2>
            <p>Review token records and event timelines</p>
          </div>
        </div>

        <TokenHistory />
      </section>

      <div className="ql-analytics-footer">
        <span>Selected date: {formatDate(selectedDate)}</span>
        <span>Auto-refresh: every 5 seconds</span>
      </div>
    </div>
  );
}
