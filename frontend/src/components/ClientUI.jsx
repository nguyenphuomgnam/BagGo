import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  DoorClosed,
  DoorOpen,
  Loader2,
  LockKeyhole,
  LogOut,
  MapPin,
  Plus,
  ShieldCheck,
  Smartphone,
  X,
  Zap,
} from 'lucide-react';
import { api, subscribeWs } from '../lib/api';
import StationMap from './StationMap';
import PaymentQrModal from './PaymentQrModal';

function money(value) {
  return Number(value || 0).toLocaleString('vi-VN') + 'đ';
}

function Message({ type = 'info', children }) {
  if (!children) return null;
  const tone = type === 'error'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : type === 'success'
      ? 'border-brand-200 bg-brand-50 text-brand-700'
      : 'border-brand-100 bg-white text-slate-700';
  return <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${tone}`}>{children}</div>;
}

function PaymentQr() {
  const filled = new Set([0, 1, 2, 7, 14, 16, 18, 21, 24, 27, 28, 32, 35, 37, 40, 42, 43, 45, 48]);
  return (
    <div className="grid h-40 w-40 grid-cols-7 gap-1 rounded-lg border border-slate-300 bg-white p-3">
      {Array.from({ length: 49 }).map((_, index) => (
        <div key={index} className={filled.has(index) ? 'rounded-sm bg-slate-900' : 'rounded-sm bg-slate-100'} />
      ))}
    </div>
  );
}

function OvertimePaymentModal({ rental, onCancel, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="baggo-surface w-full max-w-sm rounded-lg border p-5 shadow-xl bg-white">
        <h3 className="text-lg font-extrabold text-slate-900 font-sans">Thanh toán phí quá hạn</h3>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Phiên thuê của bạn ở ngăn <span className="font-bold text-slate-900">{rental.locker_name || `Ngăn ${rental.locker_id}`}</span> đã quá hạn.
        </p>
        <div className="mt-4 flex flex-col items-center gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <PaymentQr />
          <div className="text-center">
            <div className="text-sm font-bold text-amber-700">VietQR Thanh toán quá giờ</div>
            <div className="text-2xl font-extrabold text-slate-950">{money(rental.overtime_fee)}</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="rounded-lg border border-brand-100 bg-white px-4 py-3 font-extrabold text-slate-700 hover:border-brand-300">
            Hủy
          </button>
          <button onClick={onConfirm} disabled={loading} className="baggo-primary inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-extrabold disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
}

function LockerActionModal({ rental, onCancel, onBlink, onExtend, onTempOpen, onReturn, onCheckin, loading }) {
  if (!rental) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs">
      <div className="baggo-surface w-full max-w-sm rounded-xl border p-5 shadow-xl space-y-4 bg-white">
        <div className="flex items-center justify-between border-b border-brand-100 pb-3">
          <div>
            <div className="text-xs font-extrabold uppercase text-slate-400">Phiên #{rental.id}</div>
            <h3 className="text-lg font-extrabold text-slate-900">{rental.locker_name || `Ngăn ${rental.locker_id}`}</h3>
          </div>
          <button onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
            <div className="text-xs font-bold text-slate-400">Thời gian</div>
            <div className={`mt-1 text-sm font-extrabold ${rental.is_overtime ? 'text-orange-600' : 'text-slate-800'}`}>
              {rental.time_left}
            </div>
          </div>
          <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
            <div className="text-xs font-bold text-slate-400">Tổng phí</div>
            <div className="mt-1 text-sm font-extrabold text-brand-700">{money(rental.total_due || rental.price)}</div>
          </div>
        </div>

        {rental.overtime_fee > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
            Quá hạn: {money(rental.overtime_fee)}. Có thể phát sinh thêm nếu tiếp tục chậm trả.
          </div>
        )}

        {rental.status === 'RESERVED' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
            {rental.status_label || 'Phiên đặt trước'}: Chưa check-in thanh toán.
          </div>
        )}

        {/* Physical door status (IoT) */}
        <div className="rounded-lg border border-brand-100 bg-brand-50/30 px-3 py-2 flex items-center justify-between text-xs">
          <span className="font-extrabold text-slate-400">Trạng thái chốt (IoT):</span>
          {rental.locker_unlocking ? (
            <span className="inline-flex items-center gap-1 font-bold text-amber-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang mở khóa...
            </span>
          ) : rental.locker_locked === 0 ? (
            <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
              <DoorOpen className="h-3.5 w-3.5" /> Cửa đang mở
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-bold text-slate-500">
              <DoorClosed className="h-3.5 w-3.5" /> Cửa đã đóng
            </span>
          )}
        </div>

        <div className="space-y-2 pt-2 border-t border-brand-100">
          {rental.status === 'RESERVED' ? (
            <button
              onClick={() => onCheckin(rental)}
              disabled={loading}
              className="baggo-primary inline-flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-extrabold transition"
            >
              <ShieldCheck className="h-4 w-4" />
              Check-in (Thanh toán & Mở)
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onBlink(rental.locker_id)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-100 bg-white px-3 py-3 text-sm font-extrabold text-slate-700 hover:border-brand-300 hover:text-brand-700 transition"
              >
                <Zap className="h-4 w-4 text-indigo-500" />
                Tìm tủ
              </button>
              <button
                onClick={() => onExtend(rental.id)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-100 bg-white px-3 py-3 text-sm font-extrabold text-slate-700 hover:border-brand-300 hover:text-brand-700 transition"
              >
                <Plus className="h-4 w-4 text-emerald-500" />
                +1 giờ
              </button>
              <button
                onClick={() => onTempOpen(rental.id)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-100 bg-white px-3 py-3 text-sm font-extrabold text-slate-700 hover:border-brand-300 hover:text-brand-700 disabled:opacity-40 transition"
              >
                <DoorOpen className="h-4 w-4 text-amber-500" />
                Mở tạm
              </button>
              <button
                onClick={() => onReturn(rental)}
                disabled={loading}
                className="baggo-primary inline-flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-extrabold disabled:opacity-40 transition"
              >
                <ShieldCheck className="h-4 w-4" />
                Trả tủ
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, description, actionLabel, onCancel, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="baggo-surface w-full max-w-sm rounded-lg border p-5 shadow-xl bg-white">
        <h3 className="text-lg font-extrabold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm font-medium text-slate-500">{description}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="rounded-lg border border-brand-100 bg-white px-4 py-3 font-extrabold text-slate-700 hover:border-brand-300">
            Hủy
          </button>
          <button onClick={onConfirm} disabled={loading} className="baggo-primary inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-extrabold disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientUI() {
  const [config, setConfig] = useState({
    station_name: 'Trạm MVP',
  });
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [token, setToken] = useState(() => sessionStorage.getItem('baggo_customer_token') || '');
  const [rentals, setRentals] = useState([]);
  const [message, setMessage] = useState({ type: 'info', text: '' });
  const [loading, setLoading] = useState(false);
  const [confirmRental, setConfirmRental] = useState(null);
  const [overtimePayment, setOvertimePayment] = useState(null);
  const [activeControlRental, setActiveControlRental] = useState(null);

  // Thêm cho đặt trước và GPS
  const [loginTab, setLoginTab] = useState('login'); // 'login' hoặc 'reserve'
  const [stations, setStations] = useState([]);
  const [selectedStationName, setSelectedStationName] = useState('');
  const [lockers, setLockers] = useState([]);
  const [selectedLockerId, setSelectedLockerId] = useState(null);
  const [reserveHours, setReserveHours] = useState(2);
  const [reserveStartTime, setReserveStartTime] = useState(''); // '' là 'Ngay bây giờ'
  const [agreePolicy, setAgreePolicy] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalData, setPaymentModalData] = useState(null);

  const filteredLockers = useMemo(() => {
    return lockers.filter((locker) => locker.station_name === selectedStationName);
  }, [lockers, selectedStationName]);

  async function loadStations() {
    try {
      const data = await api.getStations();
      setStations(data);
      if (data.length > 0 && !selectedStationName) {
        setSelectedStationName(data[0].name);
      }
    } catch (err) {
      console.warn('Failed to load stations', err);
    }
  }

  async function loadLockers() {
    try {
      const data = await api.getLockers();
      setLockers(data);
    } catch (err) {
      console.warn('Failed to load lockers', err);
    }
  }

  function getFriendlyError(err, action) {
    if (err?.status === 404 && action === 'otp') {
      return 'Số điện thoại này chưa có phiên thuê. Hãy đăng ký đặt trước hoặc quay lại kiosk.';
    }
    if (err?.status === 401 && action === 'verify') {
      return 'OTP chưa đúng. Kiểm tra lại mã đang được hệ thống cấp.';
    }
    if (err?.status === 404 && action === 'session') {
      return 'Không tìm thấy phiên thuê đang hoạt động với số điện thoại này.';
    }
    return err?.message || 'Có lỗi xảy ra. Hãy thử lại.';
  }

  async function loadRentals(activeToken = token) {
    if (!activeToken) return;
    try {
      const data = await api.getCustomerRentals(activeToken);
      setRentals(data);
      return data;
    } catch (err) {
      sessionStorage.removeItem('baggo_customer_token');
      setToken('');
      setMessage({ type: 'error', text: err.message });
    }
  }

  async function loadConfig() {
    try {
      const data = await api.getPublicConfig();
      setConfig(data);
    } catch (err) {
      console.warn('load config failed', err);
    }
  }

  useEffect(() => {
    loadRentals();
    loadConfig();
    loadStations();
    loadLockers();
    if (!token) {
      // Periodic refresh when logged out to show locker status correctly
      const interval = setInterval(() => {
        loadLockers();
        loadStations();
      }, 5000);
      return () => clearInterval(interval);
    }
    return subscribeWs(() => {
      loadRentals();
      loadLockers();
      loadStations();
    });
  }, [token]);

  async function handleReserve() {
    if (!agreePolicy) {
      setMessage({ type: 'error', text: 'Bạn phải đồng ý với chính sách giữ chỗ 15 phút.' });
      return;
    }
    if (!selectedLockerId) {
      setMessage({ type: 'error', text: 'Vui lòng chọn một ngăn tủ còn trống.' });
      return;
    }
    if (!phone.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng nhập số điện thoại để đặt trước.' });
      return;
    }
    setLoading(true);
    setMessage({ type: 'info', text: '' });
    try {
      let startTimeIso = null;
      if (reserveStartTime) {
        const d = new Date();
        const mins = parseInt(reserveStartTime, 10);
        d.setMinutes(d.getMinutes() + mins);
        startTimeIso = d.toISOString();
      }
      await api.reserve({
        lockerId: selectedLockerId,
        hours: reserveHours,
        phone: phone,
        startTime: startTimeIso,
      });

      setMessage({
        type: 'success',
        text: `Đặt trước thành công ngăn ${selectedLockerId}! Bạn có 15 phút từ thời gian hẹn để check-in và gửi đồ.`,
      });
      
      setLoginTab('login');
      setSelectedLockerId(null);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Lỗi đặt trước tủ.' });
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp() {
    setLoading(true);
    try {
      const data = await api.requestOtp(phone);
      setOtpHint(`OTP demo: ${data.dev_otp}`);
      setMessage({ type: 'success', text: 'OTP đã sẵn sàng cho số điện thoại này.' });
    } catch (err) {
      setMessage({ type: err?.status === 404 ? 'info' : 'error', text: getFriendlyError(err, 'otp') });
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    try {
      const data = await api.verifyOtp(phone, otp);
      sessionStorage.setItem('baggo_customer_token', data.token);
      setToken(data.token);
      setRentals(data.rentals);
      setMessage({ type: 'success', text: 'Đăng nhập thành công.' });
    } catch (err) {
      setMessage({ type: 'error', text: getFriendlyError(err, 'verify') });
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    sessionStorage.removeItem('baggo_customer_token');
    setToken('');
    setRentals([]);
    setPhone('');
    setOtp('');
    setOtpHint('');
    setMessage({ type: 'info', text: '' });
  }

  async function blink(lockerId) {
    setLoading(true);
    try {
      await api.remoteBlink(lockerId);
      setMessage({ type: 'success', text: `Đã gửi lệnh nháy LED cho ngăn ${lockerId}.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function executeTempOpen(rentalId) {
    setLoading(true);
    try {
      await api.customerTempOpen(token, rentalId);
      setMessage({ type: 'success', text: 'Đã gửi lệnh mở tạm thời. Hãy đóng cửa tủ sau khi thao tác.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
      setOvertimePayment(null);
    }
  }

  async function tempOpen(rentalId) {
    const rental = rentals.find((r) => r.id === rentalId);
    if (rental && (rental.overtime_fee > 0 || rental.is_overtime)) {
      setOvertimePayment({ rental, action: 'temp-open' });
    } else {
      await executeTempOpen(rentalId);
    }
  }

  async function extend(rentalId) {
    setLoading(true);
    try {
      await api.customerExtend(token, rentalId, 1);
      const updatedRentals = await loadRentals();
      if (activeControlRental && activeControlRental.id === rentalId) {
        const found = updatedRentals?.find((r) => r.id === rentalId);
        if (found) setActiveControlRental(found);
      }
      setMessage({ type: 'success', text: 'Đã gia hạn thêm 1 giờ bằng thanh toán demo.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function executeReturnRental(rentalId) {
    setLoading(true);
    try {
      await api.customerReturn(token, rentalId);
      setConfirmRental(null);
      await loadRentals();
      setMessage({ type: 'success', text: 'Phiên thuê đã kết thúc. Tủ đã nhận lệnh mở.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
      setOvertimePayment(null);
    }
  }

  async function returnRental() {
    if (!confirmRental) return;
    if (confirmRental.overtime_fee > 0 || confirmRental.is_overtime) {
      setOvertimePayment({ rental: confirmRental, action: 'return' });
      setConfirmRental(null);
    } else {
      await executeReturnRental(confirmRental.id);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        {/* Layout chính: 2 cột */}
        <div className="grid gap-5 lg:grid-cols-[420px_1fr]">

          {/* ===== CỘT TRÁI: Form đăng nhập ===== */}
          <section className="baggo-surface rounded-2xl border p-6 shadow-sm space-y-5 bg-white">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Quản lý tủ của bạn</h1>
                <p className="text-xs font-medium text-slate-400">Đăng nhập bằng SĐT để xem & điều khiển tủ</p>
              </div>
            </div>

            {/* Phone input */}
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Số điện thoại</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder="0901234567"
                />
              </label>

              <button
                onClick={requestOtp}
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-700 shadow-sm transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4 text-brand-500" />}
                Gửi OTP
              </button>

              {otpHint && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                  {otpHint}
                </div>
              )}

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Mã OTP</span>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  inputMode="numeric"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3.5 text-center text-2xl font-extrabold tracking-[0.3em] outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder="000000"
                  maxLength={6}
                />
              </label>

              <button
                onClick={verifyOtp}
                disabled={loading}
                className="baggo-primary inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-extrabold shadow-sm disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Đăng nhập
              </button>

              <Message type={message.type}>{message.text}</Message>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-xs font-bold text-slate-400">hoặc</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            {/* Checkbox toggle Đặt trước */}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/50 p-4 transition hover:border-brand-300">
              <div className="relative mt-0.5">
                <input
                  type="checkbox"
                  checked={loginTab === 'reserve'}
                  onChange={(e) => {
                    setLoginTab(e.target.checked ? 'reserve' : 'login');
                    setMessage({ type: 'info', text: '' });
                  }}
                  className="sr-only"
                />
                <div className={`h-5 w-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                  loginTab === 'reserve' ? 'border-brand-600 bg-brand-600' : 'border-slate-300 bg-white'
                }`}>
                  {loginTab === 'reserve' && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm font-extrabold text-slate-800">Đặt trước tủ</div>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  Chọn trạm, đặt trước ngăn tủ với thời gian hẹn lên đến 2 tiếng.
                </p>
              </div>
            </label>

            {/* Info cards (collapsed when reserve mode) */}
            {loginTab === 'login' && (
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ['Face ID kiosk', 'Camera nhận diện khuôn mặt bảo mật cao.'],
                  ['SĐT + OTP', 'Dùng khi Face ID không nhận được.'],
                  ['Điều khiển xa', 'Xem giờ, gia hạn, mở tạm, trả tủ.'],
                ].map(([title, desc]) => (
                  <div key={title} className="rounded-xl border border-brand-100 bg-brand-50/50 p-3">
                    <ShieldCheck className="mb-2 h-4 w-4 text-brand-600" />
                    <div className="text-xs font-extrabold text-slate-800">{title}</div>
                    <p className="mt-1 text-xs font-medium leading-4 text-slate-500">{desc}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Reservation form (inline khi checkbox bật) */}
            {loginTab === 'reserve' && (
              <div className="space-y-4 pt-1">
                {/* Phone (dùng chung) */}
                {!phone && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">
                    Nhập số điện thoại ở trên để đặt trước.
                  </div>
                )}

                {/* Select locker */}
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Chọn ngăn trống tại: <span className="text-brand-700">{selectedStationName || '...'}</span>
                  </span>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {filteredLockers.map((locker) => {
                      const isAvailable = locker.status === 'AVAILABLE';
                      const isSelected = selectedLockerId === locker.id;
                      return (
                        <button
                          key={locker.id}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => setSelectedLockerId(locker.id)}
                          className={`rounded-xl border py-3 text-center text-xs font-extrabold transition ${
                            isSelected
                              ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                              : isAvailable
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400'
                              : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                          }`}
                        >
                          <div>{locker.name}</div>
                          <div className="mt-0.5 text-[10px] opacity-80">{isAvailable ? 'Trống' : 'Bận'}</div>
                        </button>
                      );
                    })}
                    {filteredLockers.length === 0 && (
                      <div className="col-span-3 rounded-xl border border-dashed border-slate-200 py-5 text-center text-xs font-bold text-slate-400">
                        Không có ngăn trống tại trạm này
                      </div>
                    )}
                  </div>
                </div>

                {/* Time pickers */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Thời gian đến</span>
                    <select
                      value={reserveStartTime}
                      onChange={(e) => setReserveStartTime(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    >
                      <option value="">Ngay bây giờ</option>
                      <option value="15">Sau 15 phút</option>
                      <option value="30">Sau 30 phút</option>
                      <option value="60">Sau 1 tiếng</option>
                      <option value="120">Sau 2 tiếng</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Số giờ thuê</span>
                    <select
                      value={reserveHours}
                      onChange={(e) => setReserveHours(parseInt(e.target.value, 10))}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    >
                      {Array.from(
                        { length: (config.max_rental_hours || 24) - (config.min_rental_hours || 1) + 1 },
                        (_, i) => (config.min_rental_hours || 1) + i
                      ).map((h) => (
                        <option key={h} value={h}>
                          {h} giờ ({money(h * (config.price_per_hour || 10000))})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Policy */}
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={agreePolicy}
                    onChange={(e) => setAgreePolicy(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-brand-200 text-brand-600"
                  />
                  <span className="text-xs font-medium leading-4 text-slate-500">
                    Tôi đồng ý giữ chỗ và cam kết check-in trong vòng 15 phút từ thời điểm hẹn.
                  </span>
                </label>

                <button
                  onClick={handleReserve}
                  disabled={loading || !selectedLockerId || !agreePolicy}
                  className="baggo-primary inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-extrabold shadow-sm disabled:opacity-60 transition"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Đặt giữ tủ ngay
                </button>
              </div>
            )}
          </section>

          {/* ===== CỘT PHẢI: Map (chỉ hiện khi Đặt trước) ===== */}
          {loginTab === 'reserve' ? (
            <section className="baggo-surface rounded-2xl border p-5 shadow-sm bg-white">
              <h2 className="mb-4 flex items-center gap-2 text-base font-extrabold text-slate-800">
                <MapPin className="h-5 w-5 text-brand-600" />
                Bản đồ trạm BagGo
              </h2>
              <StationMap
                stations={stations}
                selectedStationName={selectedStationName}
                onSelectStationName={setSelectedStationName}
              />
            </section>
          ) : (
            <section className="baggo-surface rounded-2xl border p-6 shadow-sm flex flex-col justify-center bg-white">
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
                  <LockKeyhole className="h-8 w-8 text-brand-600" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">Tủ gửi đồ thông minh</h2>
                  <p className="mt-2 text-sm font-medium text-slate-500 leading-6">
                    Hệ thống BagGo cho phép bạn gửi đồ an toàn, đặt trước trực tuyến và quản lý từ xa mọi lúc.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 text-left">
                  {[
                    ['🔒', 'Face ID bảo mật', 'Nhận diện khuôn mặt tại kiosk nhanh chóng'],
                    ['📱', 'OTP dự phòng', 'Xác thực qua số điện thoại đã đăng ký'],
                    ['🗺️', 'Đặt trước online', 'Giữ chỗ tủ trước khi đến tối đa 2 tiếng'],
                    ['⚡', 'Điều khiển xa', 'Gia hạn, mở tạm, trả tủ qua ứng dụng'],
                  ].map(([icon, title, desc]) => (
                    <div key={title} className="flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/40 px-4 py-3">
                      <span className="text-lg">{icon}</span>
                      <div>
                        <div className="text-sm font-extrabold text-slate-800">{title}</div>
                        <p className="text-xs font-medium text-slate-500">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="baggo-surface rounded-lg border p-5 bg-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Tủ của tôi</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">{rentals.length} phiên đang hoạt động</p>
          </div>
          <button onClick={logout} className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-100 bg-white px-4 py-3 font-extrabold text-slate-700 hover:border-brand-300 hover:text-brand-700">
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </button>
        </div>
        <div className="mt-4">
          <Message type={message.type}>{message.text}</Message>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {rentals.map((rental) => (
          <article
            key={rental.id}
            onClick={() => setActiveControlRental(rental)}
            className="baggo-surface rounded-lg border p-5 cursor-pointer hover:border-brand-500 hover:shadow-md transition duration-200 bg-white"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-extrabold uppercase text-slate-400">Phiên #{rental.id}</div>
                <h2 className="mt-1 text-2xl font-extrabold">{rental.locker_name || `Ngăn ${rental.locker_id}`}</h2>
              </div>
              <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
                {rental.locker_unlocking ? (
                  <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                ) : rental.locker_locked === 0 ? (
                  <DoorOpen className="h-5 w-5 text-emerald-500" />
                ) : (
                  <DoorClosed className="h-5 w-5 text-slate-500" />
                )}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
                <div className="text-xs font-bold text-slate-400">Thời gian</div>
                <div className={`mt-1 text-sm font-extrabold ${rental.is_overtime ? 'text-orange-600' : 'text-slate-800'}`}>
                  {rental.time_left}
                </div>
              </div>
              <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
                <div className="text-xs font-bold text-slate-400">Tổng phí</div>
                <div className="mt-1 text-sm font-extrabold text-brand-700">{money(rental.total_due || rental.price)}</div>
              </div>
            </div>
            {rental.overtime_fee > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                Quá hạn: {money(rental.overtime_fee)}. Có thể phát sinh thêm nếu tiếp tục chậm trả.
              </div>
            )}
            {rental.status === 'RESERVED' && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                {rental.status_label || 'Phiên chưa hoàn tất'}: hãy hoàn tất thao tác và thanh toán tại kiosk.
              </div>
            )}
            <div className="mt-4 text-right text-xs font-extrabold text-brand-600">
              Nhấp để điều khiển tủ &rarr;
            </div>
          </article>
        ))}
        {rentals.length === 0 && (
          <div className="rounded-lg border border-dashed border-brand-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 md:col-span-2">
            Không có phiên thuê đang hoạt động.
          </div>
        )}
      </section>

      {activeControlRental && (
        <LockerActionModal
          rental={activeControlRental}
          loading={loading}
          onCancel={() => setActiveControlRental(null)}
          onBlink={(lockerId) => blink(lockerId)}
          onExtend={async (rentalId) => {
            await extend(rentalId);
          }}
          onTempOpen={(rentalId) => {
            tempOpen(rentalId);
            setActiveControlRental(null);
          }}
          onReturn={(rental) => {
            setConfirmRental(rental);
            setActiveControlRental(null);
          }}
          onCheckin={(rental) => {
            setPaymentModalData(rental);
            setPaymentModalOpen(true);
            setActiveControlRental(null);
          }}
        />
      )}

      {confirmRental && (
        <ConfirmModal
          title="Trả tủ và kết thúc phiên"
          description={`Tủ ${confirmRental.locker_name || confirmRental.locker_id} sẽ mở để bạn lấy đồ, sau đó phiên thuê được kết thúc.`}
          actionLabel="Trả tủ"
          loading={loading}
          onCancel={() => setConfirmRental(null)}
          onConfirm={returnRental}
        />
      )}

      {overtimePayment && (
        <OvertimePaymentModal
          rental={overtimePayment.rental}
          loading={loading}
          onCancel={() => setOvertimePayment(null)}
          onConfirm={() => {
            if (overtimePayment.action === 'temp-open') {
              executeTempOpen(overtimePayment.rental.id);
            } else if (overtimePayment.action === 'return') {
              executeReturnRental(overtimePayment.rental.id);
            }
          }}
        />
      )}

      <PaymentQrModal
        isOpen={paymentModalOpen}
        onClose={() => {
          setPaymentModalOpen(false);
          setPaymentModalData(null);
        }}
        onPaymentSuccess={async () => {
          setPaymentModalOpen(false);
          setPaymentModalData(null);
          setMessage({ type: 'success', text: 'Thanh toán check-in thành công. Tủ đã được mở khóa!' });
          await loadRentals();
        }}
        amount={paymentModalData?.total_due || paymentModalData?.price || 0}
        rentalId={paymentModalData?.id}
        lockerName={paymentModalData?.locker_name || `Ngăn ${paymentModalData?.locker_id}`}
        stationName={paymentModalData?.station_name || config.station_name}
      />
    </div>
  );
}
