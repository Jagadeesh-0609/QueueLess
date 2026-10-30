
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  BriefcaseBusiness,
  PanelsTopLeft,
  Megaphone,
  BarChart3,
  Monitor,
  Headset,
  RefreshCw,
  Plus,
  Pencil,
  Power,
  ShieldCheck,
  Clock3,
  CheckCircle2,
  CircleAlert,
  Ticket,
  Activity,
  X,
} from 'lucide-react';

import {
  getAdminOverview,
  getAdminStaff,
  createStaffAccount,
  updateStaffStatus,
  getAdminServices,
  createAdminService,
  updateAdminService,
  updateAdminServiceStatus,
  getAdminCounters,
  createAdminCounter,
  updateAdminCounter,
  updateAdminCounterStatus,
  getAdminAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
} from '../services/api';

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'services', label: 'Services', icon: BriefcaseBusiness },
  { id: 'counters', label: 'Counters', icon: PanelsTopLeft },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
];

const initialStaffForm = {
  full_name: '',
  email: '',
  password: '',
};

const initialServiceForm = {
  name: '',
  code: '',
  description: '',
  avg_time_min: 10,
};

const initialCounterForm = {
  name: '',
  service_id: '',
};

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function StatusPill({ active }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold ${
        active
          ? 'bg-green-50 text-green-700'
          : 'bg-gray-100 text-gray-600'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          active ? 'bg-green-600' : 'bg-gray-400'
        }`}
      />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function StatCard({ label, value, detail, icon: Icon }) {
  return (
    <div className="border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {value ?? 0}
          </p>
          {detail && (
            <p className="mt-1 text-xs text-gray-500">{detail}</p>
          )}
        </div>

        <div className="bg-gray-100 p-3 text-gray-700">
          <Icon size={21} />
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, description, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="border border-dashed border-gray-300 px-5 py-10 text-center">
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = true,
  min,
  max,
  step,
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        step={step}
        className="w-full border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-700"
      />
    </label>
  );
}

function FormSelect({ label, value, onChange, children, required = true }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </span>
      <select
        value={value}
        onChange={onChange}
        required={required}
        className="w-full border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-700"
      >
        {children}
      </select>
    </label>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  variant = 'secondary',
  type = 'button',
}) {
  const variants = {
    primary: 'bg-gray-900 text-white hover:bg-gray-700',
    secondary: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('overview');

  const [overview, setOverview] = useState(null);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [counters, setCounters] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [staffForm, setStaffForm] = useState(initialStaffForm);
  const [serviceForm, setServiceForm] = useState(initialServiceForm);
  const [counterForm, setCounterForm] = useState(initialCounterForm);
  const [announcementForm, setAnnouncementForm] = useState({
    message: '',
    priority: 0,
  });

  const [editingServiceId, setEditingServiceId] = useState(null);
  const [editingCounterId, setEditingCounterId] = useState(null);

  const [showStaffForm, setShowStaffForm] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [showCounterForm, setShowCounterForm] = useState(false);

  const loadDashboard = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);

    setError('');

    try {
      const [
        overviewData,
        staffData,
        serviceData,
        counterData,
        announcementData,
      ] = await Promise.all([
        getAdminOverview(),
        getAdminStaff(),
        getAdminServices(),
        getAdminCounters(),
        getAdminAnnouncements(),
      ]);

      setOverview(overviewData);
      setStaff(Array.isArray(staffData) ? staffData : []);
      setServices(Array.isArray(serviceData) ? serviceData : []);
      setCounters(Array.isArray(counterData) ? counterData : []);
      setAnnouncements(
        Array.isArray(announcementData) ? announcementData : []
      );
    } catch (err) {
      setError(err.message || 'Unable to load admin dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function runAction(key, action, successMessage) {
    setBusy(key);
    setError('');
    setSuccess('');

    try {
      await action();
      setSuccess(successMessage);
      await loadDashboard(false);
      return true;
    } catch (err) {
      setError(err.message || 'The operation could not be completed.');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function handleCreateStaff(event) {
    event.preventDefault();

    const completed = await runAction(
      'create-staff',
      () => createStaffAccount(staffForm),
      'Staff account created successfully.'
    );

    if (completed) {
      setStaffForm(initialStaffForm);
      setShowStaffForm(false);
    }
  }

  async function handleStaffStatus(member) {
    const nextStatus = member.is_active !== 1;

    const confirmed = window.confirm(
      `${nextStatus ? 'Activate' : 'Deactivate'} ${member.full_name}'s staff account?`
    );

    if (!confirmed) return;

    await runAction(
      `staff-${member.id}`,
      () => updateStaffStatus(member.id, nextStatus),
      `Staff account ${nextStatus ? 'activated' : 'deactivated'} successfully.`
    );
  }

  async function handleSaveService(event) {
    event.preventDefault();

    const payload = {
      ...serviceForm,
      avg_time_min: Number(serviceForm.avg_time_min),
    };

    const isEditing = Boolean(editingServiceId);

    const completed = await runAction(
      'save-service',
      () =>
        isEditing
          ? updateAdminService(editingServiceId, payload)
          : createAdminService(payload),
      isEditing
        ? 'Service updated successfully.'
        : 'Service created successfully.'
    );

    if (completed) {
      setServiceForm(initialServiceForm);
      setEditingServiceId(null);
      setShowServiceForm(false);
    }
  }

  function startEditService(service) {
    setEditingServiceId(service.id);
    setServiceForm({
      name: service.name || '',
      code: service.code || '',
      description: service.description || '',
      avg_time_min: service.avg_time_min || 10,
    });
    setShowServiceForm(true);
    setActiveTab('services');
  }

  async function handleServiceStatus(service) {
    const nextStatus = service.is_active !== 1;

    const confirmed = window.confirm(
      `${nextStatus ? 'Activate' : 'Deactivate'} the ${service.name} service?`
    );

    if (!confirmed) return;

    await runAction(
      `service-${service.id}`,
      () => updateAdminServiceStatus(service.id, nextStatus),
      `Service ${nextStatus ? 'activated' : 'deactivated'} successfully.`
    );
  }

  async function handleSaveCounter(event) {
    event.preventDefault();

    const payload = {
      name: counterForm.name.trim(),
      service_id: Number(counterForm.service_id),
    };

    const isEditing = Boolean(editingCounterId);

    const completed = await runAction(
      'save-counter',
      () =>
        isEditing
          ? updateAdminCounter(editingCounterId, payload)
          : createAdminCounter(payload),
      isEditing
        ? 'Counter updated successfully.'
        : 'Counter created successfully.'
    );

    if (completed) {
      setCounterForm(initialCounterForm);
      setEditingCounterId(null);
      setShowCounterForm(false);
    }
  }

  function startEditCounter(counter) {
    setEditingCounterId(counter.id);
    setCounterForm({
      name: counter.name || '',
      service_id: String(counter.service_id || ''),
    });
    setShowCounterForm(true);
    setActiveTab('counters');
  }

  async function handleCounterStatus(counter) {
    const nextStatus = counter.is_active !== 1;

    const confirmed = window.confirm(
      `${nextStatus ? 'Activate' : 'Deactivate'} ${counter.name}?`
    );

    if (!confirmed) return;

    await runAction(
      `counter-${counter.id}`,
      () => updateAdminCounterStatus(counter.id, nextStatus),
      `Counter ${nextStatus ? 'activated' : 'deactivated'} successfully.`
    );
  }

  async function handleCreateAnnouncement(event) {
    event.preventDefault();

    const completed = await runAction(
      'create-announcement',
      () =>
        createAnnouncement(
          announcementForm.message,
          Number(announcementForm.priority)
        ),
      'Announcement published successfully.'
    );

    if (completed) {
      setAnnouncementForm({ message: '', priority: 0 });
    }
  }

  async function handleDeleteAnnouncement(announcement) {
    const confirmed = window.confirm(
      'Deactivate this announcement? It will no longer appear on the public display.'
    );

    if (!confirmed) return;

    await runAction(
      `announcement-${announcement.id}`,
      () => deleteAnnouncement(announcement.id),
      'Announcement deactivated successfully.'
    );
  }

  function cancelServiceEdit() {
    setServiceForm(initialServiceForm);
    setEditingServiceId(null);
    setShowServiceForm(false);
  }

  function cancelCounterEdit() {
    setCounterForm(initialCounterForm);
    setEditingCounterId(null);
    setShowCounterForm(false);
  }

  const queue = overview?.queue || {};
  const users = overview?.users || {};
  const resources = overview?.resources || {};

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-16 text-center">
        <RefreshCw className="mx-auto animate-spin text-gray-500" size={28} />
        <p className="mt-3 text-sm text-gray-500">
          Loading administration dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
      {/* Header */}
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-gray-500">
            QUEUE MANAGEMENT SYSTEM
          </p>

          <div className="mt-2 flex items-center gap-3">
            <ShieldCheck size={30} className="text-gray-800" />
            <h1 className="text-3xl font-bold text-gray-900">
              Admin Dashboard
            </h1>
          </div>

          <p className="mt-2 text-sm text-gray-600">
            Manage users, services, counters and daily queue operations.
          </p>
        </div>

        <ActionButton
          onClick={() => loadDashboard(false)}
          disabled={refreshing}
        >
          <RefreshCw
            size={16}
            className={refreshing ? 'animate-spin' : ''}
          />
          Refresh
        </ActionButton>
      </header>

      {/* Feedback */}
      {error && (
        <div className="mb-5 flex items-start gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <CircleAlert size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            className="ml-auto"
            aria-label="Dismiss error"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {success && (
        <div className="mb-5 flex items-start gap-2 border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span>{success}</span>
          <button
            type="button"
            onClick={() => setSuccess('')}
            className="ml-auto"
            aria-label="Dismiss success message"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {/* Navigation tabs */}
      <div className="mb-7 overflow-x-auto border-b border-gray-200">
        <div className="flex min-w-max gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
                activeTab === id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          <section>
            <SectionHeading
              title="Administration Overview"
              description={`Current system summary${overview?.date ? ` for ${overview.date}` : ''}.`}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total Customers"
                value={users.total_customers}
                detail={`${users.active_customers || 0} active accounts`}
                icon={Users}
              />
              <StatCard
                label="Total Staff"
                value={users.total_staff}
                detail={`${users.active_staff || 0} active accounts`}
                icon={Headset}
              />
              <StatCard
                label="Services"
                value={resources.total_services}
                detail={`${resources.active_services || 0} active services`}
                icon={BriefcaseBusiness}
              />
              <StatCard
                label="Counters"
                value={resources.total_counters}
                detail={`${resources.active_counters || 0} active counters`}
                icon={PanelsTopLeft}
              />
            </div>
          </section>

          <section>
            <SectionHeading
              title="Today's Queue Statistics"
              description="Live totals from today's token records."
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="Total Tokens"
                value={queue.total_tokens}
                icon={Ticket}
              />
              <StatCard
                label="Waiting"
                value={queue.waiting_tokens}
                icon={Clock3}
              />
              <StatCard
                label="Active"
                value={queue.active_tokens}
                detail="Called or currently serving"
                icon={Activity}
              />
              <StatCard
                label="Completed"
                value={queue.completed_tokens}
                icon={CheckCircle2}
              />
              <StatCard
                label="Skipped"
                value={queue.skipped_tokens}
                icon={CircleAlert}
              />
              <StatCard
                label="Cancelled"
                value={queue.cancelled_tokens}
                icon={X}
              />
            </div>
          </section>

          <section>
            <SectionHeading
              title="System Monitoring"
              description="Open operational views and monitor the queue."
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Link
                to="/staff"
                className="border border-gray-200 bg-white p-5 transition hover:border-gray-500"
              >
                <Headset size={24} className="text-gray-800" />
                <h3 className="mt-4 font-bold text-gray-900">
                  Staff Operations
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Monitor counters and manage service queues.
                </p>
                <span className="mt-4 inline-block text-sm font-semibold text-gray-800">
                  Open staff dashboard →
                </span>
              </Link>

              <Link
                to="/analytics"
                className="border border-gray-200 bg-white p-5 transition hover:border-gray-500"
              >
                <BarChart3 size={24} className="text-gray-800" />
                <h3 className="mt-4 font-bold text-gray-900">
                  Analytics
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Review queue activity and service performance.
                </p>
                <span className="mt-4 inline-block text-sm font-semibold text-gray-800">
                  Open analytics →
                </span>
              </Link>

              <Link
                to="/display"
                className="border border-gray-200 bg-white p-5 transition hover:border-gray-500"
              >
                <Monitor size={24} className="text-gray-800" />
                <h3 className="mt-4 font-bold text-gray-900">
                  Live Display
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Monitor current tokens across all services.
                </p>
                <span className="mt-4 inline-block text-sm font-semibold text-gray-800">
                  Open live display →
                </span>
              </Link>
            </div>
          </section>

          <section className="border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <Megaphone size={21} />
              <h3 className="font-bold text-gray-900">
                Announcement Summary
              </h3>
            </div>
            <div className="mt-3 flex flex-wrap gap-5 text-sm text-gray-600">
              <span>
                Active announcements:{' '}
                <strong className="text-gray-900">
                  {resources.active_announcements || 0}
                </strong>
              </span>
              <span>
                Total announcements:{' '}
                <strong className="text-gray-900">
                  {announcements.length}
                </strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('announcements')}
              className="mt-4 text-sm font-semibold text-gray-900 underline underline-offset-4"
            >
              Manage announcements
            </button>
          </section>
        </div>
      )}

      {/* STAFF MANAGEMENT */}
      {activeTab === 'staff' && (
        <section>
          <SectionHeading
            title="Staff Management"
            description="Create staff accounts and manage account access."
            action={
              <ActionButton
                variant="primary"
                onClick={() => setShowStaffForm((value) => !value)}
              >
                <Plus size={16} />
                Add Staff
              </ActionButton>
            }
          />

          {showStaffForm && (
            <form
              onSubmit={handleCreateStaff}
              className="mb-6 border border-gray-200 bg-white p-5"
            >
              <h3 className="mb-4 font-bold text-gray-900">
                Create Staff Account
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FormField
                  label="Full name"
                  value={staffForm.full_name}
                  onChange={(event) =>
                    setStaffForm({
                      ...staffForm,
                      full_name: event.target.value,
                    })
                  }
                  placeholder="Enter staff name"
                />
                <FormField
                  label="Email address"
                  type="email"
                  value={staffForm.email}
                  onChange={(event) =>
                    setStaffForm({
                      ...staffForm,
                      email: event.target.value,
                    })
                  }
                  placeholder="staff@example.com"
                />
                <FormField
                  label="Temporary password"
                  type="password"
                  value={staffForm.password}
                  onChange={(event) =>
                    setStaffForm({
                      ...staffForm,
                      password: event.target.value,
                    })
                  }
                  placeholder="Minimum 8 characters"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton
                  type="submit"
                  variant="primary"
                  disabled={busy === 'create-staff'}
                >
                  {busy === 'create-staff' ? 'Creating...' : 'Create Account'}
                </ActionButton>
                <ActionButton onClick={() => setShowStaffForm(false)}>
                  Cancel
                </ActionButton>
              </div>
            </form>
          )}

          <div className="mb-4 flex flex-wrap gap-4 text-sm text-gray-600">
            <span>Total staff: <strong>{staff.length}</strong></span>
            <span>
              Active:{' '}
              <strong>{staff.filter((member) => member.is_active === 1).length}</strong>
            </span>
            <span>
              Inactive:{' '}
              <strong>{staff.filter((member) => member.is_active !== 1).length}</strong>
            </span>
          </div>

          {staff.length === 0 ? (
            <EmptyState message="No staff accounts have been created yet." />
          ) : (
            <div className="overflow-x-auto border border-gray-200 bg-white">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Staff member</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {staff.map((member) => (
                    <tr key={member.id}>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {member.full_name}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {member.email}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(member.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill active={member.is_active === 1} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ActionButton
                          variant={
                            member.is_active === 1 ? 'danger' : 'secondary'
                          }
                          disabled={busy === `staff-${member.id}`}
                          onClick={() => handleStaffStatus(member)}
                        >
                          <Power size={14} />
                          {member.is_active === 1 ? 'Deactivate' : 'Activate'}
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* SERVICE MANAGEMENT */}
      {activeTab === 'services' && (
        <section>
          <SectionHeading
            title="Service Management"
            description="Add services, edit service details and control availability."
            action={
              <ActionButton
                variant="primary"
                onClick={() => {
                  setEditingServiceId(null);
                  setServiceForm(initialServiceForm);
                  setShowServiceForm((value) => !value);
                }}
              >
                <Plus size={16} />
                Add Service
              </ActionButton>
            }
          />

          {showServiceForm && (
            <form
              onSubmit={handleSaveService}
              className="mb-6 border border-gray-200 bg-white p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">
                  {editingServiceId ? 'Edit Service' : 'Create Service'}
                </h3>
                <button
                  type="button"
                  onClick={cancelServiceEdit}
                  aria-label="Close service form"
                >
                  <X size={19} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  label="Service name"
                  value={serviceForm.name}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      name: event.target.value,
                    })
                  }
                  placeholder="e.g. General Consultation"
                />
                <FormField
                  label="Service code"
                  value={serviceForm.code}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      code: event.target.value.toUpperCase(),
                    })
                  }
                  placeholder="e.g. GEN"
                />
                <FormField
                  label="Average service time (minutes)"
                  type="number"
                  min="1"
                  max="240"
                  value={serviceForm.avg_time_min}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      avg_time_min: event.target.value,
                    })
                  }
                />
                <FormField
                  label="Description"
                  value={serviceForm.description}
                  required={false}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      description: event.target.value,
                    })
                  }
                  placeholder="Short description"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton
                  type="submit"
                  variant="primary"
                  disabled={busy === 'save-service'}
                >
                  {busy === 'save-service'
                    ? 'Saving...'
                    : editingServiceId
                      ? 'Save Changes'
                      : 'Create Service'}
                </ActionButton>
                <ActionButton onClick={cancelServiceEdit}>
                  Cancel
                </ActionButton>
              </div>
            </form>
          )}

          {services.length === 0 ? (
            <EmptyState message="No services are available." />
          ) : (
            <div className="overflow-x-auto border border-gray-200 bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Average time</th>
                    <th className="px-4 py-3">Counters</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {services.map((service) => (
                    <tr key={service.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">
                          {service.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {service.description || 'No description'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {service.code}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {service.avg_time_min} min
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {service.active_counters || 0} active / {service.total_counters || 0} total
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill active={service.is_active === 1} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <ActionButton
                            onClick={() => startEditService(service)}
                          >
                            <Pencil size={14} />
                            Edit
                          </ActionButton>
                          <ActionButton
                            variant={
                              service.is_active === 1 ? 'danger' : 'secondary'
                            }
                            disabled={busy === `service-${service.id}`}
                            onClick={() => handleServiceStatus(service)}
                          >
                            <Power size={14} />
                            {service.is_active === 1 ? 'Deactivate' : 'Activate'}
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* COUNTER MANAGEMENT */}
      {activeTab === 'counters' && (
        <section>
          <SectionHeading
            title="Counter Management"
            description="Create counters and assign them to active services."
            action={
              <ActionButton
                variant="primary"
                onClick={() => {
                  setEditingCounterId(null);
                  setCounterForm(initialCounterForm);
                  setShowCounterForm((value) => !value);
                }}
              >
                <Plus size={16} />
                Add Counter
              </ActionButton>
            }
          />

          {showCounterForm && (
            <form
              onSubmit={handleSaveCounter}
              className="mb-6 border border-gray-200 bg-white p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">
                  {editingCounterId ? 'Edit Counter' : 'Create Counter'}
                </h3>
                <button
                  type="button"
                  onClick={cancelCounterEdit}
                  aria-label="Close counter form"
                >
                  <X size={19} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  label="Counter name"
                  value={counterForm.name}
                  onChange={(event) =>
                    setCounterForm({
                      ...counterForm,
                      name: event.target.value,
                    })
                  }
                  placeholder="e.g. Counter 4"
                />

                <FormSelect
                  label="Assign service"
                  value={counterForm.service_id}
                  onChange={(event) =>
                    setCounterForm({
                      ...counterForm,
                      service_id: event.target.value,
                    })
                  }
                >
                  <option value="">Select a service</option>
                  {services
                    .filter((service) => service.is_active === 1)
                    .map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} ({service.code})
                      </option>
                    ))}
                </FormSelect>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton
                  type="submit"
                  variant="primary"
                  disabled={
                    busy === 'save-counter' ||
                    services.filter((service) => service.is_active === 1).length === 0
                  }
                >
                  {busy === 'save-counter'
                    ? 'Saving...'
                    : editingCounterId
                      ? 'Save Changes'
                      : 'Create Counter'}
                </ActionButton>
                <ActionButton onClick={cancelCounterEdit}>
                  Cancel
                </ActionButton>
              </div>

              {services.every((service) => service.is_active !== 1) && (
                <p className="mt-3 text-sm text-red-600">
                  Create or activate a service before adding a counter.
                </p>
              )}
            </form>
          )}

          {counters.length === 0 ? (
            <EmptyState message="No counters have been created yet." />
          ) : (
            <div className="overflow-x-auto border border-gray-200 bg-white">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Counter</th>
                    <th className="px-4 py-3">Assigned service</th>
                    <th className="px-4 py-3">Service code</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {counters.map((counter) => (
                    <tr key={counter.id}>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {counter.name}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {counter.service_name}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {counter.service_code}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill
                          active={
                            counter.is_active === 1 &&
                            counter.service_is_active === 1
                          }
                        />
                        {counter.service_is_active !== 1 && (
                          <p className="mt-1 text-xs text-gray-500">
                            Parent service inactive
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <ActionButton
                            onClick={() => startEditCounter(counter)}
                          >
                            <Pencil size={14} />
                            Edit
                          </ActionButton>
                          <ActionButton
                            variant={
                              counter.is_active === 1 ? 'danger' : 'secondary'
                            }
                            disabled={busy === `counter-${counter.id}`}
                            onClick={() => handleCounterStatus(counter)}
                          >
                            <Power size={14} />
                            {counter.is_active === 1 ? 'Deactivate' : 'Activate'}
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ANNOUNCEMENT MANAGEMENT */}
      {activeTab === 'announcements' && (
        <section>
          <SectionHeading
            title="Announcement Management"
            description="Publish messages to public queue displays and manage existing announcements."
          />

          <form
            onSubmit={handleCreateAnnouncement}
            className="mb-6 border border-gray-200 bg-white p-5"
          >
            <h3 className="mb-4 font-bold text-gray-900">
              Publish Announcement
            </h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px]">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Announcement message
                </span>
                <textarea
                  value={announcementForm.message}
                  onChange={(event) =>
                    setAnnouncementForm({
                      ...announcementForm,
                      message: event.target.value,
                    })
                  }
                  required
                  maxLength={500}
                  rows={3}
                  placeholder="Enter the message to display..."
                  className="w-full resize-y border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-700"
                />
                <span className="mt-1 block text-right text-xs text-gray-500">
                  {announcementForm.message.length}/500
                </span>
              </label>

              <FormSelect
                label="Priority"
                value={announcementForm.priority}
                onChange={(event) =>
                  setAnnouncementForm({
                    ...announcementForm,
                    priority: Number(event.target.value),
                  })
                }
              >
                <option value={0}>Normal (0)</option>
                <option value={1}>Priority 1</option>
                <option value={2}>Priority 2</option>
                <option value={3}>Priority 3</option>
                <option value={4}>Priority 4</option>
                <option value={5}>Priority 5</option>
                <option value={6}>Priority 6</option>
                <option value={7}>Priority 7</option>
                <option value={8}>Priority 8</option>
                <option value={9}>Priority 9</option>
                <option value={10}>Highest (10)</option>
              </FormSelect>
            </div>

            <div className="mt-3">
              <ActionButton
                type="submit"
                variant="primary"
                disabled={busy === 'create-announcement'}
              >
                <Megaphone size={16} />
                {busy === 'create-announcement'
                  ? 'Publishing...'
                  : 'Publish Announcement'}
              </ActionButton>
            </div>
          </form>

          <SectionHeading
            title="All Announcements"
            description={`${announcements.length} announcement record(s), including inactive ones.`}
          />

          {announcements.length === 0 ? (
            <EmptyState message="No announcements have been created." />
          ) : (
            <div className="space-y-3">
              {announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  className="flex flex-wrap items-start justify-between gap-4 border border-gray-200 bg-white p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <StatusPill active={announcement.is_active === 1} />
                      <span className="text-xs text-gray-500">
                        Priority {announcement.priority}
                      </span>
                    </div>
                    <p className="break-words text-sm font-medium text-gray-900">
                      {announcement.message}
                    </p>
                    <p className="mt-2 text-xs text-gray-500">
                      Created: {formatDate(announcement.created_at)}
                    </p>
                  </div>

                  {announcement.is_active === 1 && (
                    <ActionButton
                      variant="danger"
                      disabled={busy === `announcement-${announcement.id}`}
                      onClick={() => handleDeleteAnnouncement(announcement)}
                    >
                      <Power size={14} />
                      Deactivate
                    </ActionButton>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
