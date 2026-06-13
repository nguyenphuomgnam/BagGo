function getFallbackApiBase() {
  const { protocol, hostname, port, origin } = window.location;
  const isLocalDevHost = ['localhost', '127.0.0.1', '::1'].includes(hostname);

  if ((import.meta.env.DEV || isLocalDevHost) && port !== '8000') {
    const apiHost = hostname === '::1' ? 'localhost' : hostname || 'localhost';
    return `${protocol}//${apiHost}:8000`;
  }

  return origin;
}

const fallbackApiBase = getFallbackApiBase();

export const API_BASE = import.meta.env.VITE_API_BASE_URL || fallbackApiBase;
export const WS_BASE = import.meta.env.VITE_WS_BASE_URL || API_BASE.replace(/^http/, 'ws');

function formatErrorDetail(detail) {
  if (!detail) return '';

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (!item || typeof item !== 'object') return String(item);
        const loc = Array.isArray(item.loc) ? item.loc.filter(Boolean).join('.') : '';
        const msg = item.msg || item.message || 'Dữ liệu không hợp lệ';
        return loc ? `${loc}: ${msg}` : msg;
      })
      .filter(Boolean)
      .join('; ');
  }

  if (typeof detail === 'object') {
    return detail.message || detail.detail || detail.error || '';
  }

  return String(detail);
}

function extractErrorMessage(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  return formatErrorDetail(payload.detail) || payload.message || payload.error || '';
}

function requireArray(payload, label) {
  if (Array.isArray(payload)) return payload;
  console.warn(`${label} returned unexpected payload`, payload);
  throw new Error(`${label} không đúng định dạng. Hãy kiểm tra backend đang chạy tại ${API_BASE}.`);
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const init = { ...options, headers };
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 12000;
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
    delete init.token;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  init.signal = controller.signal;

  try {
    const res = await fetch(`${API_BASE}${path}`, init);
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
      const message = extractErrorMessage(data) || 'Yêu cầu thất bại';
      const error = new Error(message);
      error.status = res.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Máy chủ phản hồi quá lâu. Hãy thử lại.');
    }
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      throw new Error(`Không kết nối được máy chủ xác thực (${API_BASE}). Hãy kiểm tra backend đang chạy.`);
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export function makeWs() {
  return new WebSocket(`${WS_BASE}/ws`);
}

export function subscribeWs(onMessage) {
  let ws = null;
  let cancelled = false;

  const timer = window.setTimeout(() => {
    if (cancelled) return;
    ws = makeWs();
    ws.onmessage = onMessage;
    ws.onerror = () => {};
  }, 50);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (ws && ws.readyState < WebSocket.CLOSING) {
      ws.close();
    }
  };
}

export const api = {
  getPublicConfig: () => request('/api/config'),
  getLockers: async () => requireArray(await request('/api/lockers'), 'Danh sách tủ'),
  reserve: ({ lockerId, hours, phone, startTime }) => {
    let url = `/api/reserve?locker_id=${lockerId}&hours=${hours}&phone=${encodeURIComponent(phone)}`;
    if (startTime) {
      url += `&start_time=${encodeURIComponent(startTime)}`;
    }
    return request(url, { method: 'POST' });
  },
  getStations: async () => requireArray(await request('/api/stations'), 'Danh sách trạm'),
  cancelReservation: (rentalId) => request(`/api/cancel-reservation?rental_id=${rentalId}`, { method: 'POST' }),
  uploadFace: (rentalId, file) => {
    const body = new FormData();
    body.append('file', file, 'face.jpg');
    return request(`/api/upload-face/${rentalId}`, { method: 'POST', body, timeoutMs: 30000 });
  },
  paymentCallback: (rentalId) => request(`/api/payment/callback?rental_id=${rentalId}`, { method: 'POST' }),
  identify: (file) => {
    const body = new FormData();
    body.append('file', file, 'face.jpg');
    return request('/api/identify', { method: 'POST', body, timeoutMs: 30000 });
  },
  tempOpen: (rentalId) => request(`/api/temp-open?rental_id=${rentalId}`, { method: 'POST' }),
  returnLocker: (rentalId) => request(`/api/return?rental_id=${rentalId}`, { method: 'POST' }),
  requestOtp: (phone) => request('/api/customer/request-otp', { method: 'POST', body: { phone } }),
  verifyOtp: (phone, otp) => request('/api/customer/verify-otp', { method: 'POST', body: { phone, otp } }),
  getCustomerRentals: async (token) => requireArray(await request('/api/customer/rentals', { token }), 'Danh sách phiên thuê'),
  customerTempOpen: (token, rentalId) => request('/api/customer/temp-open', { method: 'POST', token, body: { rental_id: rentalId } }),
  customerReturn: (token, rentalId) => request('/api/customer/return', { method: 'POST', token, body: { rental_id: rentalId } }),
  customerExtend: (token, rentalId, hours) => request('/api/customer/extend', { method: 'POST', token, body: { rental_id: rentalId, hours } }),
  remoteBlink: (lockerId) => request(`/api/remote/blink/${lockerId}`, { method: 'POST' }),
  adminLogin: (password) => request('/api/admin/login', { method: 'POST', body: { password } }),
  adminStats: (token) => request('/api/admin/stats', { token }),
  adminRentalDetail: (token, rentalId) => request(`/api/admin/rentals/${rentalId}`, { token }),
  adminRentals: async (token, page = 1, limit = 20, status = 'all', search = '') => {
    const url = `/api/admin/rentals?page=${page}&limit=${limit}&status=${status}&search=${encodeURIComponent(search)}`;
    const res = await request(url, { token });
    return {
      ...res,
      items: requireArray(res.items, 'Danh sách phiên thuê')
    };
  },
  adminLogs: async (token, page = 1, limit = 20) => {
    const url = `/api/admin/logs?page=${page}&limit=${limit}`;
    const res = await request(url, { token });
    return {
      ...res,
      items: requireArray(res.items, 'Nhật ký hệ thống')
    };
  },
  adminSettings: (token) => request('/api/admin/settings', { token }),
  updateAdminSettings: (token, body) => request('/api/admin/settings', { method: 'PUT', token, body }),
  createLocker: (token, body) => request('/api/admin/lockers', { method: 'POST', token, body }),
  deleteLocker: (token, lockerId) => request(`/api/admin/lockers/${lockerId}`, { method: 'DELETE', token }),
  adminOpen: (token, lockerId) => request(`/api/admin/open?locker_id=${lockerId}`, { method: 'POST', token }),
  adminClose: (token, lockerId) => request(`/api/admin/close?locker_id=${lockerId}`, { method: 'POST', token }),
  adminForceReturn: (token, lockerId) => request(`/api/admin/force-return?locker_id=${lockerId}`, { method: 'POST', token }),
  createStation: (token, body) => request('/api/admin/stations', { method: 'POST', token, body }),
  updateStation: (token, id, body) => request(`/api/admin/stations/${id}`, { method: 'PUT', token, body }),
  deleteStation: (token, id) => request(`/api/admin/stations/${id}`, { method: 'DELETE', token }),
  getAds: (position) => request(`/api/ads?position=${position || ''}`),
  recordAdImpression: (id) => request(`/api/ads/${id}/impression`, { method: 'POST' }),
  recordAdClick: (id) => request(`/api/ads/${id}/click`, { method: 'POST' }),
  adminGetAds: (token) => request('/api/admin/ads', { token }),
  adminCreateAd: (token, body) => request('/api/admin/ads', { method: 'POST', token, body }),
  adminUpdateAd: (token, id, body) => request(`/api/admin/ads/${id}`, { method: 'PUT', token, body }),
  adminDeleteAd: (token, id) => request(`/api/admin/ads/${id}`, { method: 'DELETE', token }),
};
