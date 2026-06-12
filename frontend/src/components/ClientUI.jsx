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
  X,
  Zap,
} from 'lucide-react';
import { api, subscribeWs } from '../lib/api';

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
      <div className="baggo-surface w-full max-w-sm rounded-lg border p-5 shadow-xl">
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

function LockerActionModal({ rental, onCancel, onBlink, onExtend, onTempOpen, onReturn, loading }) {
  if (!rental) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="baggo-surface w-full max-w-sm rounded-lg border p-5 shadow-xl space-y-4">
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
            {rental.status_label || 'Phiên chưa hoàn tất'}: hãy hoàn tất thao tác và thanh toán tại kiosk.
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-brand-100">
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
            disabled={loading || rental.status === 'RESERVED'}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-100 bg-white px-3 py-3 text-sm font-extrabold text-slate-700 hover:border-brand-300 hover:text-brand-700 disabled:opacity-40 transition"
          >
            <DoorOpen className="h-4 w-4 text-amber-500" />
            Mở tạm
          </button>
          <button
            onClick={() => onReturn(rental)}
            disabled={loading || rental.status === 'RESERVED'}
            className="baggo-primary inline-flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-extrabold disabled:opacity-40 transition"
          >
            <ShieldCheck className="h-4 w-4" />
            Trả tủ
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, description, actionLabel, onCancel, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="baggo-surface w-full max-w-sm rounded-lg border p-5 shadow-xl">
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
    if (!token) return undefined;
    return subscribeWs(() => loadRentals());
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
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="baggo-surface rounded-lg border p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-600 text-white">
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
                className="mt-2 w-full rounded-lg border border-brand-100 px-3 py-3 text-base font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                placeholder="0901234567"
              />
            </label>
            <button onClick={requestOtp} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-100 bg-white px-4 py-3 font-extrabold text-slate-700 hover:border-brand-300 hover:text-brand-700 disabled:opacity-60">
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
                className="mt-2 w-full rounded-lg border border-brand-100 px-3 py-3 text-center text-xl font-extrabold tracking-widest outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                placeholder="000000"
              />
            </label>
            <button onClick={verifyOtp} disabled={loading} className="baggo-primary inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-extrabold disabled:opacity-60">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Mở tủ
            </button>
            <Message type={message.type}>{message.text}</Message>
          </div>
        </section>

        <section className="baggo-surface rounded-lg border p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Face ID tại kiosk', 'Nhanh khi camera và ánh sáng ổn định.'],
              ['SĐT + OTP dự phòng', 'Dùng khi Face ID không nhận được.'],
              ['Điều khiển từ xa', 'Xem thời gian, nháy LED, gia hạn và trả tủ.'],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-lg border border-brand-100 bg-brand-50 p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-brand-600" />
                <div className="font-extrabold text-slate-900">{title}</div>
                <p className="mt-2 text-sm font-medium leading-5 text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-brand-100 bg-brand-50 p-4">
            <div className="flex items-center gap-2 text-sm font-extrabold text-slate-700">
              <MapPin className="h-4 w-4 text-slate-500" />
              {config.station_name}
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
      <section className="baggo-surface rounded-lg border p-5">
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
            className="baggo-surface rounded-lg border p-5 cursor-pointer hover:border-brand-500 hover:shadow-md transition duration-200"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-extrabold uppercase text-slate-400">Phiên #{rental.id}</div>
                <h2 className="mt-1 text-2xl font-extrabold">{rental.locker_name || `Ngăn ${rental.locker_id}`}</h2>
              </div>
              <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
                <LockKeyhole className="h-5 w-5 text-slate-500" />
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
    </div>
  );
}
