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

function Footer() {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white/50 backdrop-blur-xs py-8">
      <div className="mx-auto max-w-5xl px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-500">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-extrabold text-slate-800">Bago IoT Smart Locker System</span>
          <span>·</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <div className="flex gap-4">
          <a href="#" className="hover:text-brand-600 transition">Hướng dẫn sử dụng</a>
          <a href="#" className="hover:text-brand-600 transition">Điều khoản dịch vụ</a>
          <a href="#" className="hover:text-brand-600 transition">Chính sách bảo mật</a>
          <a href="#" className="hover:text-brand-600 transition">Hotline hỗ trợ: 1900 6789</a>
        </div>
      </div>
    </footer>
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
  const [showRentMore, setShowRentMore] = useState(false);

  // Advertisement State
  const [ads, setAds] = useState([]);
  const [activeAdIndex, setActiveAdIndex] = useState(0);

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

  async function loadAds() {
    try {
      const data = await api.getAds('client');
      setAds(data);
    } catch (err) {
      console.warn('load ads failed', err);
    }
  }

  // Record impression for active ad
  useEffect(() => {
    if (ads && ads.length > 0) {
      const currentAd = ads[activeAdIndex];
      if (currentAd) {
        api.recordAdImpression(currentAd.id).catch(console.error);
      }
    }
  }, [ads, activeAdIndex]);

  // Rotate ads every 8 seconds
  useEffect(() => {
    if (ads.length <= 1) return;
    const interval = setInterval(() => {
      setActiveAdIndex((prev) => (prev + 1) % ads.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [ads]);

  function handleAdClick(ad) {
    api.recordAdClick(ad.id).catch(console.error);
    if (ad.link_url) {
      window.open(ad.link_url, '_blank');
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
    loadAds();
    if (!token) {
      // Periodic refresh when logged out to show locker status correctly
      const interval = setInterval(() => {
        loadLockers();
        loadStations();
        loadAds();
      }, 5000);
      return () => clearInterval(interval);
    }
    return subscribeWs(() => {
      loadRentals();
      loadLockers();
      loadStations();
      loadAds();
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
      if (token) {
        setShowRentMore(false);
        await loadRentals();
      } else {
        setLoginTab('login');
      }
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
    const rental = rentals.find((r) => r.id === rentalId);
    if (!rental) return;
    const hourCost = config.price_per_hour || 10000;
    setPaymentModalData({
      ...rental,
      paymentType: 'extend',
      customAmount: hourCost,
    });
    setPaymentModalOpen(true);
    setActiveControlRental(null);
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
    if (loginTab === 'reserve') {
      return (
        <div className="mx-auto max-w-5xl space-y-5 animate-fade-in">
          <div className="grid gap-6 lg:grid-cols-[400px_1fr] items-start">
            {/* LEFT COLUMN: Booking Configuration & Ad */}
            <div className="space-y-5">
              <section className="baggo-surface rounded-2xl border border-brand-100 p-6 bg-white flex flex-col gap-5 shadow-[0_12px_30px_-4px_rgba(18,139,77,0.06)] transition-all duration-300 hover:shadow-[0_20px_40px_-4px_rgba(18,139,77,0.12)]">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-500 text-white shadow-md shadow-brand-600/10">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-lg font-black tracking-tight text-slate-900 leading-tight">Đặt trước tủ online</h1>
                    <p className="text-xs font-semibold text-slate-400 mt-0.5">Giữ chỗ trước khi đến tối đa 2 tiếng</p>
                  </div>
                </div>

                {/* Tab Selector */}
                <div className="flex rounded-2xl bg-slate-100 p-1 border border-slate-200/50">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginTab('login');
                      setMessage({ type: 'info', text: '' });
                    }}
                    className={`flex-1 py-2.5 text-center text-xs font-black rounded-xl transition-all duration-300 ${
                      loginTab === 'login'
                        ? 'bg-white text-brand-700 shadow-sm border border-slate-200/20'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-white/40'
                    }`}
                  >
                    Đăng nhập quản lý
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginTab('reserve');
                      setMessage({ type: 'info', text: '' });
                    }}
                    className={`flex-1 py-2.5 text-center text-xs font-black rounded-xl transition-all duration-300 ${
                      loginTab === 'reserve'
                        ? 'bg-white text-brand-700 shadow-sm border border-slate-200/20'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-white/40'
                    }`}
                  >
                    Đặt trước tủ
                  </button>
                </div>

                {/* SĐT */}
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 block mb-2">Số điện thoại liên hệ</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/30 px-4 py-3 text-base font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10"
                    placeholder="0901234567"
                  />
                </label>

                {/* Thời gian đến & số giờ thuê */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 block mb-2">Thời gian hẹn đến</span>
                    <select
                      value={reserveStartTime}
                      onChange={(e) => setReserveStartTime(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200/85 bg-white px-3.5 py-3 text-sm font-bold text-slate-800 outline-none transition-all duration-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                    >
                      <option value="">Ngay bây giờ</option>
                      <option value="15">Sau 15 phút</option>
                      <option value="30">Sau 30 phút</option>
                      <option value="60">Sau 1 tiếng</option>
                      <option value="120">Sau 2 tiếng</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 block mb-2">Số giờ thuê</span>
                    <select
                      value={reserveHours}
                      onChange={(e) => setReserveHours(parseInt(e.target.value, 10))}
                      className="w-full rounded-2xl border border-slate-200/85 bg-white px-3.5 py-3 text-sm font-bold text-slate-800 outline-none transition-all duration-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                    >
                      {Array.from(
                        { length: (config.max_rental_hours || 24) - (config.min_rental_hours || 1) + 1 },
                        (_, i) => (config.min_rental_hours || 1) + i
                      ).map((h) => (
                        <option key={h} value={h}>
                          {h} giờ
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Price Panel */}
                <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-extrabold text-slate-500">
                    <span>Đơn giá của trạm:</span>
                    <span className="text-slate-800">{money(config.price_per_hour || 10000)}/giờ</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-brand-100/40 pt-2.5 text-sm font-extrabold text-slate-800">
                    <span>Ước tính tổng phí:</span>
                    <span className="text-lg font-black text-brand-700">
                      {money(reserveHours * (config.price_per_hour || 10000))}
                    </span>
                  </div>
                  {selectedLockerId && (
                    <div className="mt-2.5 rounded-xl bg-emerald-50 border border-emerald-200 py-2 text-center text-xs font-black text-emerald-800 animate-pulse-subtle">
                      Đang chọn: Ngăn {lockers.find(l => l.id === selectedLockerId)?.name || selectedLockerId}
                    </div>
                  )}
                </div>

                {/* Policy checkbox */}
                <label className="flex cursor-pointer items-start gap-2.5 py-1">
                  <input
                    type="checkbox"
                    checked={agreePolicy}
                    onChange={(e) => setAgreePolicy(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/20 focus:ring-offset-0 transition-all"
                  />
                  <span className="text-[10.5px] font-bold leading-relaxed text-slate-500">
                    Tôi đồng ý giữ chỗ và cam kết đến check-in gửi đồ trong vòng 15 phút so với giờ hẹn.
                  </span>
                </label>
              </div>

              <div className="pt-4 border-t border-slate-150 space-y-3">
                <button
                  onClick={handleReserve}
                  disabled={loading || !selectedLockerId || !agreePolicy || !phone}
                  className="baggo-primary inline-flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-black text-sm tracking-wide shadow-md shadow-brand-600/10 hover:shadow-lg hover:shadow-brand-600/20 active:scale-[0.98] disabled:opacity-50 disabled:scale-100 disabled:shadow-none transition-all duration-205"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Đặt giữ tủ ngay
                </button>
                <Message type={message.type}>{message.text}</Message>
              </div>
            </section>

            {/* Ad Banner inside left column */}
            {ads && ads.length > 0 && (() => {
              const currentAd = ads[activeAdIndex];
              const hasImage = !!currentAd.image_url;
              return (
                <div 
                  onClick={() => handleAdClick(currentAd)}
                  className="cursor-pointer relative overflow-hidden rounded-2xl h-48 sm:h-56 shadow-lg border border-slate-100 transition-all duration-300 hover:shadow-xl hover:scale-[1.005] group flex items-center justify-center bg-slate-950"
                >
                  {hasImage ? (
                    <>
                      <div 
                        className="absolute inset-0 bg-cover bg-center filter blur-3xl scale-125 opacity-50 select-none pointer-events-none" 
                        style={{ backgroundImage: `url(${currentAd.image_url})` }} 
                      />
                      <div className="absolute inset-0 bg-slate-950/20" />
                      <img 
                        src={currentAd.image_url} 
                        alt={currentAd.text} 
                        className="relative z-10 h-full w-auto object-contain transition-transform duration-700 group-hover:scale-[1.01]" 
                      />
                    </>
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-tr from-brand-700 via-indigo-600 to-brand-500" />
                      <div className="relative z-10 w-full p-6 flex flex-col justify-end h-full text-left">
                        <span className="inline-block self-start rounded-full bg-brand-500/90 backdrop-blur-xs px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white font-sans mb-1.5">
                          Đăng Ký & Ưu Đãi
                        </span>
                        <h3 className="text-sm font-black leading-snug drop-shadow-sm line-clamp-2 font-sans text-white">
                          {currentAd.text}
                        </h3>
                        {currentAd.link_url && (
                          <span className="mt-3 self-start rounded-lg bg-white px-3 py-1.5 text-[10px] font-black text-brand-700 shadow-md hover:bg-brand-50 transition-all duration-200 hover:scale-105 font-sans">
                            Xem ngay
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>

            {/* RIGHT COLUMN: Map & Locker Selection */}
            <div className="space-y-5">
              {/* Map */}
              <section className="baggo-surface rounded-2xl border p-5 shadow-sm bg-white">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-800">
                  <MapPin className="h-4 w-4 text-brand-600" />
                  Bản đồ chọn trạm Bago
                </h2>
                <StationMap
                  stations={stations}
                  selectedStationName={selectedStationName}
                  onSelectStationName={setSelectedStationName}
                />
              </section>

              {/* Locker Grid selection - now clean and full width in right column! */}
              <section className="baggo-surface rounded-2xl border p-5 shadow-sm bg-white space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">Chọn ngăn tủ còn trống</h2>
                    <p className="text-xs font-semibold text-slate-400 mt-0.5">
                      Tại trạm: <span className="text-brand-600 font-extrabold">{selectedStationName || '...'}</span>
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-100">
                    {filteredLockers.filter(l => l.status === 'AVAILABLE').length} ngăn trống
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {filteredLockers.map((locker) => {
                    const isAvailable = locker.status === 'AVAILABLE';
                    const isSelected = selectedLockerId === locker.id;
                    return (
                      <button
                        key={locker.id}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => setSelectedLockerId(locker.id)}
                        className={`relative rounded-xl border p-4 text-center transition duration-200 flex flex-col justify-between items-center min-h-[90px] ${
                          isSelected
                            ? 'border-brand-600 bg-brand-50/50 ring-2 ring-brand-600/20 text-brand-700 shadow-sm'
                            : isAvailable
                            ? 'border-emerald-100 bg-white hover:border-emerald-400 hover:shadow-sm animate-pulse-subtle'
                            : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                        }`}
                      >
                        <span className={`absolute top-2 right-2 h-2 w-2 rounded-full ${
                          isSelected ? 'bg-brand-600' : isAvailable ? 'bg-emerald-500' : 'bg-slate-300'
                        }`} />
                        <div className="text-lg font-black tracking-tight text-slate-800">{locker.name}</div>
                        <div className={`mt-2 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          isSelected
                            ? 'bg-brand-600 text-white'
                            : isAvailable
                            ? 'bg-emerald-55 text-emerald-700 border border-emerald-100'
                            : 'bg-slate-100 text-slate-400'
                        }`}>
                          {isSelected ? 'Đang chọn' : isAvailable ? 'Trống' : 'Bận'}
                        </div>
                      </button>
                    );
                  })}
                  {filteredLockers.length === 0 && (
                    <div className="col-span-full rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm font-bold text-slate-400">
                      Không tìm thấy ngăn tủ nào khả dụng tại trạm này.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
          <Footer />
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-5xl space-y-5 animate-fade-in">
        <div className="grid gap-6 lg:grid-cols-[400px_1fr] items-start">
          {/* LEFT COLUMN: Phone & OTP login & Ad */}
          <div className="space-y-5">
            <section className="baggo-surface rounded-2xl border border-brand-100 p-6 bg-white flex flex-col gap-6 shadow-[0_12px_30px_-4px_rgba(18,139,77,0.06)] transition-all duration-300 hover:shadow-[0_20px_40px_-4px_rgba(18,139,77,0.12)]">
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-500 text-white shadow-md shadow-brand-600/10">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-black tracking-tight text-slate-900 leading-tight">Quản lý tủ của bạn</h1>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">Xem &amp; điều khiển tủ từ xa 24/7</p>
                </div>
              </div>

              {/* Tab Selector */}
              <div className="flex rounded-2xl bg-slate-100 p-1 border border-slate-200/50">
                <button
                  type="button"
                  onClick={() => {
                    setLoginTab('login');
                    setMessage({ type: 'info', text: '' });
                  }}
                  className={`flex-1 py-2.5 text-center text-xs font-black rounded-xl transition-all duration-300 ${
                    loginTab === 'login'
                      ? 'bg-white text-brand-700 shadow-sm border border-slate-200/20'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-white/40'
                  }`}
                >
                  Đăng nhập quản lý
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginTab('reserve');
                    setMessage({ type: 'info', text: '' });
                  }}
                  className={`flex-1 py-2.5 text-center text-xs font-black rounded-xl transition-all duration-300 ${
                    loginTab === 'reserve'
                      ? 'bg-white text-brand-700 shadow-sm border border-slate-200/20'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-white/40'
                  }`}
                >
                  Đặt trước tủ
                </button>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 block mb-2">Số điện thoại</span>
                  <div className="relative">
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      inputMode="tel"
                      className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/30 pl-4 pr-28 py-3.5 text-base font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10"
                      placeholder="0901234567"
                    />
                    <button
                      onClick={requestOtp}
                      disabled={loading || !phone}
                      className="absolute right-2 top-2 bottom-2 px-4 rounded-xl bg-brand-600 text-white text-xs font-black tracking-wide hover:bg-brand-700 active:scale-95 disabled:bg-slate-100 disabled:text-slate-450 disabled:scale-100 transition-all duration-200"
                    >
                      {loading ? 'Đang gửi...' : 'Gửi mã'}
                    </button>
                  </div>
                </label>

                {otpHint && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs font-bold text-amber-800 flex items-start gap-2 shadow-xs">
                      <span className="text-amber-500">💡</span>
                      <span>{otpHint}</span>
                    </div>

                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 block mb-2">Mã xác thực OTP</span>
                      <input
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        inputMode="numeric"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-center text-2xl font-black tracking-[0.3em] outline-none transition-all duration-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 text-slate-900"
                        placeholder="000000"
                        maxLength={6}
                      />
                    </label>

                    <button
                      onClick={verifyOtp}
                      disabled={loading || otp.length < 4}
                      className="baggo-primary inline-flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black tracking-wide shadow-md shadow-brand-600/10 hover:shadow-lg hover:shadow-brand-600/20 active:scale-[0.98] disabled:opacity-50 disabled:scale-100 disabled:shadow-none transition-all duration-205"
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      Đăng nhập ngay
                    </button>
                  </div>
                )}

                <Message type={message.type}>{message.text}</Message>
              </div>
            </div>

            {/* Info Cards */}
            <div className="grid gap-2.5 grid-cols-3 border-t border-slate-150 pt-5">
              {[
                ['Face ID', 'Bảo mật tối đa'],
                ['OTP SMS', 'Xác thực nhanh'],
                ['Điều khiển', 'Mở từ xa 24/7'],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 text-center transition-all duration-300 hover:bg-brand-50/20 hover:border-brand-200 group">
                  <ShieldCheck className="mx-auto mb-1.5 h-4 w-4 text-brand-600 transition-transform duration-300 group-hover:scale-110" />
                  <div className="text-[10px] font-extrabold text-slate-800">{title}</div>
                  <p className="mt-0.5 text-[8.5px] font-bold leading-tight text-slate-450">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Ad Banner inside left column */}
          {ads && ads.length > 0 && (() => {
            const currentAd = ads[activeAdIndex];
            const hasImage = !!currentAd.image_url;
            return (
              <div 
                onClick={() => handleAdClick(currentAd)}
                className="cursor-pointer relative overflow-hidden rounded-2xl h-48 sm:h-56 shadow-lg border border-slate-100 transition-all duration-300 hover:shadow-xl hover:scale-[1.005] group flex items-center justify-center bg-slate-950"
              >
                {hasImage ? (
                  <>
                    <div 
                      className="absolute inset-0 bg-cover bg-center filter blur-3xl scale-125 opacity-50 select-none pointer-events-none" 
                      style={{ backgroundImage: `url(${currentAd.image_url})` }} 
                    />
                    <div className="absolute inset-0 bg-slate-950/20" />
                    <img 
                      src={currentAd.image_url} 
                      alt={currentAd.text} 
                      className="relative z-10 h-full w-auto object-contain transition-transform duration-700 group-hover:scale-[1.01]" 
                    />
                  </>
                ) : (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-tr from-brand-700 via-indigo-600 to-brand-500" />
                    <div className="relative z-10 w-full p-6 flex flex-col justify-end h-full text-left">
                      <span className="inline-block self-start rounded-full bg-brand-500/90 backdrop-blur-xs px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white font-sans mb-1.5">
                        Đăng Ký & Ưu Đãi
                      </span>
                      <h3 className="text-sm font-black leading-snug drop-shadow-sm line-clamp-2 font-sans text-white">
                        {currentAd.text}
                      </h3>
                      {currentAd.link_url && (
                        <span className="mt-3 self-start rounded-lg bg-white px-3 py-1.5 text-[10px] font-black text-brand-700 shadow-md hover:bg-brand-50 transition-all duration-200 hover:scale-105 font-sans">
                          Xem ngay
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>

          {/* RIGHT COLUMN: Map & Station Info */}
          <div className="space-y-5">
            {/* Station Map */}
            <section className="baggo-surface rounded-2xl border p-5 shadow-sm bg-white">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-800">
                <MapPin className="h-4 w-4 text-brand-600" />
                Bản đồ mạng lưới trạm Bago
              </h2>
              <StationMap
                stations={stations}
                selectedStationName={selectedStationName}
                onSelectStationName={setSelectedStationName}
              />
            </section>

            {/* Station List / Quick Guide */}
            <section className="baggo-surface rounded-2xl border p-5 shadow-sm bg-white">
              <h2 className="mb-4 text-sm font-extrabold text-slate-900">Hướng dẫn vận hành tủ Bago</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-2 text-left">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 text-xs font-black">1</span>
                  <h3 className="text-xs font-extrabold text-slate-800">Đặt trước / Login</h3>
                  <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                    Đặt giữ chỗ online trước 15 phút hoặc đăng nhập để kiểm tra phiên thuê hiện tại.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-2 text-left">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 text-xs font-black">2</span>
                  <h3 className="text-xs font-extrabold text-slate-800">Gửi hành lý</h3>
                  <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                    Đến trạm tủ, quét QR thanh toán hoặc nhập SĐT trên màn hình kiosk để mở ngăn tủ.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-2 text-left">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 text-xs font-black">3</span>
                  <h3 className="text-xs font-extrabold text-slate-800">Mở tủ từ xa</h3>
                  <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                    Đăng nhập tài khoản trên điện thoại để điều khiển mở tủ lấy đồ từ xa 24/7 tiện lợi.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>

        <Footer />
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
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => {
                setShowRentMore(!showRentMore);
                if (!phone && rentals.length > 0) {
                  setPhone(rentals[0].phone || '');
                }
              }}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-extrabold transition ${
                showRentMore 
                  ? 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100' 
                  : 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm'
              }`}
            >
              <Plus className="h-4 w-4" />
              {showRentMore ? 'Đóng bảng đặt thuê' : 'Đăng ký thuê thêm tủ'}
            </button>
            <button onClick={logout} className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-100 bg-white px-4 py-3 font-extrabold text-slate-700 hover:border-brand-300 hover:text-brand-700">
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </div>
        <div className="mt-4">
          <Message type={message.type}>{message.text}</Message>
        </div>
      </section>

      {showRentMore && (
        <div className="baggo-surface rounded-2xl border p-6 bg-white shadow-md space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
              <Plus className="h-5 w-5 text-brand-600" />
              Đăng ký đặt thuê tủ mới
            </h2>
            <button
              onClick={() => setShowRentMore(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              Đóng [X]
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-[340px_1fr] items-start">
            {/* Form details */}
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Số điện thoại liên hệ</span>
                <input
                  type="text"
                  disabled
                  value={phone}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-600 outline-none cursor-not-allowed"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Thời gian hẹn đến</span>
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
                        {h} giờ
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Price Panel */}
              <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>Đơn giá của trạm:</span>
                  <span>{money(config.price_per_hour || 10000)}/giờ</span>
                </div>
                <div className="flex items-center justify-between border-t border-brand-100/40 pt-2 text-sm font-extrabold text-slate-800">
                  <span>Ước tính tổng phí:</span>
                  <span className="text-lg font-black text-brand-700">
                    {money(reserveHours * (config.price_per_hour || 10000))}
                  </span>
                </div>
                {selectedLockerId && (
                  <div className="mt-1.5 rounded-lg bg-emerald-50 border border-emerald-200 py-1.5 text-center text-xs font-extrabold text-emerald-800">
                    Đang chọn: Ngăn {lockers.find(l => l.id === selectedLockerId)?.name || selectedLockerId}
                  </div>
                )}
              </div>

              {/* Policy checkbox */}
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={agreePolicy}
                  onChange={(e) => setAgreePolicy(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-brand-200 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-[11px] font-medium leading-4 text-slate-500">
                  Tôi đồng ý giữ chỗ và cam kết đến check-in gửi đồ trong vòng 15 phút so với giờ hẹn.
                </span>
              </label>

              <button
                onClick={handleReserve}
                disabled={loading || !selectedLockerId || !agreePolicy}
                className="baggo-primary inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-extrabold shadow-md disabled:opacity-60 transition"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Xác nhận đặt thuê ngay
              </button>
            </div>

            {/* Map & Selection */}
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/50">
                <h3 className="mb-2 flex items-center gap-2 text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                  <MapPin className="h-4 w-4 text-brand-600" />
                  Bản đồ trạm phục vụ
                </h3>
                <StationMap
                  stations={stations}
                  selectedStationName={selectedStationName}
                  onSelectStationName={setSelectedStationName}
                />
              </div>

              <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                  <h3 className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Chọn ngăn tủ còn trống</h3>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-100">
                    {filteredLockers.filter(l => l.status === 'AVAILABLE').length} trống
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {filteredLockers.map((locker) => {
                    const isAvailable = locker.status === 'AVAILABLE';
                    const isSelected = selectedLockerId === locker.id;
                    return (
                      <button
                        key={locker.id}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => setSelectedLockerId(locker.id)}
                        className={`relative rounded-lg border p-3 text-center transition duration-200 flex flex-col justify-between items-center min-h-[75px] ${
                          isSelected
                            ? 'border-brand-600 bg-brand-50/50 ring-2 ring-brand-600/20 text-brand-700 shadow-sm'
                            : isAvailable
                            ? 'border-emerald-100 bg-white hover:border-emerald-400 hover:shadow-sm'
                            : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                        }`}
                      >
                        <div className="text-sm font-extrabold text-slate-800">{locker.name}</div>
                        <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                          isSelected
                            ? 'bg-brand-600 text-white'
                            : isAvailable
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-400'
                        }`}>
                          {isSelected ? 'Đang chọn' : isAvailable ? 'Trống' : 'Bận'}
                        </div>
                      </button>
                    );
                  })}
                  {filteredLockers.length === 0 && (
                    <div className="col-span-full rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs font-bold text-slate-400">
                      Không tìm thấy ngăn tủ khả dụng.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mt-6">Các phiên thuê của tôi</div>
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
          const isExtend = paymentModalData?.paymentType === 'extend';
          setPaymentModalOpen(false);
          setPaymentModalData(null);
          if (isExtend) {
            setMessage({ type: 'success', text: 'Đã gia hạn thêm 1 giờ và thanh toán thành công!' });
          } else {
            setMessage({ type: 'success', text: 'Thanh toán check-in thành công. Tủ đã được mở khóa!' });
          }
          await loadRentals();
        }}
        amount={paymentModalData?.paymentType === 'extend'
          ? (paymentModalData?.customAmount || 10000)
          : (paymentModalData?.total_due || paymentModalData?.price || 0)
        }
        rentalId={paymentModalData?.id}
        lockerName={paymentModalData?.locker_name || `Ngăn ${paymentModalData?.locker_id}`}
        stationName={paymentModalData?.station_name || config.station_name}
        paymentType={paymentModalData?.paymentType || 'checkin'}
        token={token}
      />

      {/* Banner quảng cáo chèn cho khách hàng */}
      {ads && ads.length > 0 && (() => {
        const currentAd = ads[activeAdIndex];
        const hasImage = !!currentAd.image_url;
        return (
          <div 
            onClick={() => handleAdClick(currentAd)}
            className="mx-auto max-w-5xl mt-6 mb-6 cursor-pointer relative overflow-hidden rounded-2xl h-44 sm:h-56 md:h-64 lg:h-72 shadow-lg border border-slate-100 transition-all duration-300 hover:shadow-xl hover:scale-[1.005] group flex items-center justify-center bg-slate-950"
          >
            {hasImage ? (
              <>
                <div 
                  className="absolute inset-0 bg-cover bg-center filter blur-3xl scale-125 opacity-50 select-none pointer-events-none" 
                  style={{ backgroundImage: `url(${currentAd.image_url})` }} 
                />
                <div className="absolute inset-0 bg-slate-950/20" />
                <img 
                  src={currentAd.image_url} 
                  alt={currentAd.text} 
                  className="relative z-10 h-full w-auto object-contain transition-transform duration-700 group-hover:scale-[1.01]" 
                />
              </>
            ) : (
              <>
                <div className="absolute inset-0 bg-gradient-to-tr from-brand-700 via-indigo-600 to-brand-500" />
                <div className="relative z-10 w-full p-6 flex items-center justify-between gap-6 self-end">
                  <div className="text-white space-y-1.5 max-w-[70%] text-left">
                    <span className="inline-block rounded-full bg-brand-500/90 backdrop-blur-xs px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white font-sans">
                      Đăng Ký & Ưu Đãi
                    </span>
                    <h3 className="text-lg font-black leading-snug drop-shadow-sm line-clamp-2 font-sans">
                      {currentAd.text}
                    </h3>
                  </div>
                  {currentAd.link_url && (
                    <span className="rounded-xl bg-white px-5 py-3 text-sm font-black text-brand-700 shadow-md hover:bg-brand-50 transition-all duration-200 hover:scale-105 shrink-0 font-sans">
                      Xem ngay
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })()}

      <Footer />
    </div>
  );
}
