const fallbackApiBase = window.location.port === '5173'
  ? 'http://localhost:8000'
  : window.location.origin;

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

export const api = {
  getLockers: () => request('/api/lockers'),
  reserve: ({ lockerId, hours, phone }) => request(`/api/reserve?locker_id=${lockerId}&hours=${hours}&phone=${encodeURIComponent(phone)}`, { method: 'POST' }),
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
  getCustomerRentals: (token) => request('/api/customer/rentals', { token }),
  customerTempOpen: (token, rentalId) => request('/api/customer/temp-open', { method: 'POST', token, body: { rental_id: rentalId } }),
  customerReturn: (token, rentalId) => request('/api/customer/return', { method: 'POST', token, body: { rental_id: rentalId } }),
  customerExtend: (token, rentalId, hours) => request('/api/customer/extend', { method: 'POST', token, body: { rental_id: rentalId, hours } }),
  remoteBlink: (lockerId) => request(`/api/remote/blink/${lockerId}`, { method: 'POST' }),
  adminLogin: (password) => request('/api/admin/login', { method: 'POST', body: { password } }),
  adminStats: (token) => request('/api/admin/stats', { token }),
  adminRentals: (token) => request('/api/admin/rentals', { token }),
  adminLogs: (token) => request('/api/admin/logs', { token }),
  adminOpen: (token, lockerId) => request(`/api/admin/open?locker_id=${lockerId}`, { method: 'POST', token }),
  adminClose: (token, lockerId) => request(`/api/admin/close?locker_id=${lockerId}`, { method: 'POST', token }),
  adminForceReturn: (token, lockerId) => request(`/api/admin/force-return?locker_id=${lockerId}`, { method: 'POST', token }),
};
