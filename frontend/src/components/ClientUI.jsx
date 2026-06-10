import { useEffect, useState } from 'react';
import {
  Bell,
  Clock,
  DoorOpen,
  Loader2,
  LockKeyhole,
  LogOut,
  MapPin,
  Plus,
  ShieldCheck,
  Smartphone,
  Zap,
} from 'lucide-react';
import { api, makeWs } from '../lib/api';

function money(value) {
  return Number(value || 0).toLocaleString('vi-VN') + 'đ';
}

function Message({ type = 'info', children }) {
  if (!children) return null;
  const tone = type === 'error'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-slate-200 bg-white text-slate-700';
  return <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${tone}`}>{children}</div>;
}

function ConfirmModal({ title, description, actionLabel, onCancel, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h3 className="text-lg font-extrabold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm font-medium text-slate-500">{description}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-3 font-extrabold text-slate-700">
            Hủy
          </button>
          <button onClick={onConfirm} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-extrabold text-white disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientUI() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [token, setToken] = useState(() => sessionStorage.getItem('baggo_customer_token') || '');
  const [rentals, setRentals] = useState([]);
  const [message, setMessage] = useState({ type: 'info', text: '' });
  const [loading, setLoading] = useState(false);
  const [confirmRental, setConfirmRental] = useState(null);

  function getFriendlyError(err, action) {
    if (err?.status === 404 && action === 'otp') {
      return 'Số điện thoại này chưa có phiên thuê. Hãy quay lại kiosk để tạo phiên trước.';
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
    } catch (err) {
      sessionStorage.removeItem('baggo_customer_token');
      setToken('');
      setMessage({ type: 'error', text: err.message });
    }
  }

  useEffect(() => {
    loadRentals();
    if (!token) return undefined;
    const ws = makeWs();
    ws.onmessage = () => loadRentals();
    ws.onerror = () => {};
    return () => ws.close();
  }, [token]);

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

  async function tempOpen(rentalId) {
    setLoading(true);
    try {
      await api.customerTempOpen(token, rentalId);
      setMessage({ type: 'success', text: 'Đã gửi lệnh mở tạm thời. Hãy đóng cửa tủ sau khi thao tác.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function extend(rentalId) {
    setLoading(true);
    try {
      await api.customerExtend(token, rentalId, 1);
      await loadRentals();
      setMessage({ type: 'success', text: 'Đã gia hạn thêm 1 giờ bằng thanh toán demo.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function returnRental() {
    if (!confirmRental) return;
    setLoading(true);
    try {
      await api.customerReturn(token, confirmRental.id);
      setConfirmRental(null);
      await loadRentals();
      setMessage({ type: 'success', text: 'Phiên thuê đã kết thúc. Tủ đã nhận lệnh mở.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Smartphone className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Quản lý tủ của bạn</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
            Nhập đúng số điện thoại đã dùng tại kiosk. Nếu chưa có phiên thuê thì quay lại kiosk tạo phiên trước, rồi mới lấy OTP để vào tủ của bạn.
          </p>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Số điện thoại</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-base font-semibold outline-none focus:border-slate-900"
                placeholder="0901234567"
              />
            </label>
            <button onClick={requestOtp} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 font-extrabold text-slate-700 disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Gửi OTP
            </button>
            {otpHint && <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">{otpHint}</div>}
            <label className="block">
              <span className="text-sm font-bold text-slate-700">OTP</span>
              <input
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                inputMode="numeric"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-xl font-extrabold tracking-widest outline-none focus:border-slate-900"
                placeholder="000000"
              />
            </label>
            <button onClick={verifyOtp} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 font-extrabold text-white disabled:opacity-60">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Mở tủ
            </button>
            <Message type={message.type}>{message.text}</Message>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Face ID tại kiosk', 'Nhanh khi camera và ánh sáng ổn định.'],
              ['SĐT + OTP dự phòng', 'Dùng khi Face ID không nhận được.'],
              ['Điều khiển từ xa', 'Xem thời gian, nháy LED, gia hạn và trả tủ.'],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-emerald-600" />
                <div className="font-extrabold text-slate-900">{title}</div>
                <p className="mt-2 text-sm font-medium leading-5 text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-extrabold text-slate-700">
              <MapPin className="h-4 w-4 text-slate-500" />
              Trạm MVP
            </div>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Bản này tập trung 1 trạm 6 ngăn. Khi mở rộng nhiều trạm, màn này sẽ thêm bản đồ và đặt trước theo vị trí.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Tủ của tôi</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">{rentals.length} phiên đang hoạt động</p>
          </div>
          <button onClick={logout} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 font-extrabold text-slate-700">
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
          <article key={rental.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-extrabold uppercase text-slate-400">Phiên #{rental.id}</div>
                <h2 className="mt-1 text-2xl font-extrabold">{rental.locker_name || `Ngăn ${rental.locker_id}`}</h2>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <LockKeyhole className="h-5 w-5 text-slate-500" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-bold text-slate-400">Thời gian</div>
                <div className={`mt-1 text-sm font-extrabold ${rental.is_overtime ? 'text-orange-600' : 'text-slate-800'}`}>
                  {rental.time_left}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-bold text-slate-400">Đã thanh toán</div>
                <div className="mt-1 text-sm font-extrabold text-emerald-700">{money(rental.price)}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => blink(rental.locker_id)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-3 text-sm font-extrabold text-slate-700">
                <Zap className="h-4 w-4" />
                Tìm tủ
              </button>
              <button onClick={() => extend(rental.id)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-3 text-sm font-extrabold text-slate-700">
                <Plus className="h-4 w-4" />
                +1 giờ
              </button>
              <button onClick={() => tempOpen(rental.id)} disabled={loading || rental.status === 'RESERVED'} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-3 text-sm font-extrabold text-slate-700 disabled:opacity-40">
                <DoorOpen className="h-4 w-4" />
                Mở tạm
              </button>
              <button onClick={() => setConfirmRental(rental)} disabled={loading || rental.status === 'RESERVED'} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-3 text-sm font-extrabold text-white disabled:opacity-40">
                <ShieldCheck className="h-4 w-4" />
                Trả tủ
              </button>
            </div>
            {rental.status === 'RESERVED' && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                {rental.status_label || 'Phiên chưa hoàn tất'}: hãy hoàn tất thao tác và thanh toán tại kiosk.
              </div>
            )}
          </article>
        ))}
        {rentals.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-500 md:col-span-2">
            Không có phiên thuê đang hoạt động.
          </div>
        )}
      </section>

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
    </div>
  );
}
