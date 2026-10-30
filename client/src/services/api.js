
/**
 * API client for the QueueLess backend.
 * All frontend data fetching goes through this module.
 */

const API_BASE = '/api';
const TOKEN_KEY = 'queueless_token';

async function request(url, options = {}) {
  const token =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(TOKEN_KEY)
      : null;

  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    headers.delete('Authorization');
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    const error = new Error(data?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// -----------------------------------------------------------------------------
// SERVICES
// -----------------------------------------------------------------------------

export const getServices = () => request('/services');

export const getService = (id) =>
  request(`/services/${encodeURIComponent(id)}`);

// -----------------------------------------------------------------------------
// COUNTERS
// -----------------------------------------------------------------------------

export const getCounters = (serviceId) =>
  request(
    `/counters${
      serviceId ? `?service_id=${encodeURIComponent(serviceId)}` : ''
    }`
  );

export const getCounter = (id) =>
  request(`/counters/${encodeURIComponent(id)}`);

// -----------------------------------------------------------------------------
// TOKENS
// -----------------------------------------------------------------------------

export const createToken = (serviceId, priority = 0, customerName = '') =>
  request('/tokens', {
    method: 'POST',
    body: JSON.stringify({
      service_id: serviceId,
      priority,
      customer_name: customerName,
    }),
  });

export const getTokens = (params = {}) => {
  const qs = new URLSearchParams();

  if (params.serviceId) qs.set('service_id', params.serviceId);
  if (params.status) qs.set('status', params.status);
  if (params.date) qs.set('date', params.date);
  if (params.limit) qs.set('limit', params.limit);

  const queryString = qs.toString();

  return request(`/tokens${queryString ? `?${queryString}` : ''}`);
};

export const getToken = (id) =>
  request(`/tokens/${encodeURIComponent(id)}`);

export const getTokenEvents = (tokenId) =>
  request(`/tokens/${encodeURIComponent(tokenId)}/events`);

export const getTokenByNumber = (tokenNumber, date) =>
  request(
    `/tokens/lookup/${encodeURIComponent(tokenNumber)}${
      date ? `?date=${encodeURIComponent(date)}` : ''
    }`
  );

export const getCustomerTokenHistory = () =>
  request('/tokens/customer/history');

export const getCustomerDisplayData = (tokenId) =>
  request(
    `/tokens/customer/display/${encodeURIComponent(tokenId)}`
  );

export const getQueue = (serviceId) =>
  request(
    `/tokens/queue${
      serviceId ? `?service_id=${encodeURIComponent(serviceId)}` : ''
    }`
  );

export const getDisplayData = () =>
  request('/tokens/display');

export const callNextToken = (counterId) =>
  request(`/tokens/call/${encodeURIComponent(counterId)}`, {
    method: 'POST',
  });

export const recallToken = (tokenId) =>
  request(`/tokens/${encodeURIComponent(tokenId)}/recall`, {
    method: 'POST',
  });

export const startServingToken = (tokenId) =>
  request(`/tokens/${encodeURIComponent(tokenId)}/serve`, {
    method: 'POST',
  });

export const completeToken = (tokenId) =>
  request(`/tokens/${encodeURIComponent(tokenId)}/complete`, {
    method: 'POST',
  });

export const skipToken = (tokenId) =>
  request(`/tokens/${encodeURIComponent(tokenId)}/skip`, {
    method: 'POST',
  });

// -----------------------------------------------------------------------------
// ANALYTICS
// -----------------------------------------------------------------------------

export const getAnalytics = (date) =>
  request(`/analytics${date ? `?date=${encodeURIComponent(date)}` : ''}`);

// -----------------------------------------------------------------------------
// ANNOUNCEMENTS
// -----------------------------------------------------------------------------

export const getAnnouncements = () =>
  request('/announcements');

export const createAnnouncement = (message, priority = 0) =>
  request('/announcements', {
    method: 'POST',
    body: JSON.stringify({ message, priority }),
  });

export const deleteAnnouncement = (id) =>
  request(`/announcements/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

// -----------------------------------------------------------------------------
// AUTHENTICATION
// -----------------------------------------------------------------------------

export const registerUser = (fullName, email, password) =>
  request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      full_name: fullName,
      email,
      password,
    }),
  });

export const loginUser = (email, password) =>
  request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const getCurrentUser = (token) =>
  request('/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

// -----------------------------------------------------------------------------
// ADMIN OVERVIEW
// -----------------------------------------------------------------------------

export const getAdminOverview = () =>
  request('/admin/overview');

// -----------------------------------------------------------------------------
// ADMIN STAFF MANAGEMENT
// -----------------------------------------------------------------------------

export const getAdminStaff = () =>
  request('/admin/staff');

export const createStaffAccount = (staffData) =>
  request('/admin/staff', {
    method: 'POST',
    body: JSON.stringify(staffData),
  });

export const updateStaffStatus = (id, isActive) =>
  request(`/admin/staff/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  });

// -----------------------------------------------------------------------------
// ADMIN SERVICE MANAGEMENT
// -----------------------------------------------------------------------------

export const getAdminServices = () =>
  request('/admin/services');

export const createAdminService = (serviceData) =>
  request('/admin/services', {
    method: 'POST',
    body: JSON.stringify(serviceData),
  });

export const updateAdminService = (id, serviceData) =>
  request(`/admin/services/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(serviceData),
  });

export const updateAdminServiceStatus = (id, isActive) =>
  request(`/admin/services/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  });

// -----------------------------------------------------------------------------
// ADMIN COUNTER MANAGEMENT
// -----------------------------------------------------------------------------

export const getAdminCounters = () =>
  request('/admin/counters');

export const createAdminCounter = (counterData) =>
  request('/admin/counters', {
    method: 'POST',
    body: JSON.stringify(counterData),
  });

export const updateAdminCounter = (id, counterData) =>
  request(`/admin/counters/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(counterData),
  });

export const updateAdminCounterStatus = (id, isActive) =>
  request(`/admin/counters/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  });

// -----------------------------------------------------------------------------
// ADMIN ANNOUNCEMENT MANAGEMENT
// -----------------------------------------------------------------------------

export const getAdminAnnouncements = () =>
  request('/admin/announcements');
