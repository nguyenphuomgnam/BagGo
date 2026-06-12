import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Clock,
  CreditCard,
  DoorClosed,
  DoorOpen,
  Loader2,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { api, subscribeWs } from '../lib/api';
import { getLockerStatusMeta } from '../lib/lockerStatus';
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

export default function KioskUI() {
  const [lockers, setLockers] = useState([]);
  const [config, setConfig] = useState({
    station_name: 'Trạm MVP',
    price_per_hour: 10000,
    overtime_price_per_hour: 15000,
    min_rental_hours: 1,
    max_rental_hours: 24,
    reservation_hold_seconds: 120,
  });
  const [flow, setFlow] = useState('store');
  const [step, setStep] = useState('select');
  const [selectedLocker, setSelectedLocker] = useState(null);
  const [phone, setPhone] = useState('');
  const [hours, setHours] = useState(2);
  const [rental, setRental] = useState(null);
  const [otp, setOtp] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [message, setMessage] = useState({ type: 'info', text: '' });
  const [overtimeAction, setOvertimeAction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const availableCount = useMemo(
    () => lockers.filter((locker) => locker.status === 'AVAILABLE').length,
    [lockers],
  );

  const hoursOptions = useMemo(() => {
    const candidates = [1, 2, 4, 8, 12, 24, 48]
      .filter((value) => value >= config.min_rental_hours && value <= config.max_rental_hours);
    if (!candidates.includes(config.min_rental_hours)) candidates.unshift(config.min_rental_hours);
    if (!candidates.includes(config.max_rental_hours)) candidates.push(config.max_rental_hours);
    return [...new Set(candidates)].sort((a, b) => a - b);
  }, [config.max_rental_hours, config.min_rental_hours]);

  const hourlyPrice = config.price_per_hour || 10000;

  async function loadLockers() {
    try {
      const data = await api.getLockers();
      setLockers(data);
      setSelectedLocker((current) => {
        if (!current) return null;
        return data.find((locker) => locker.id === current.id) || null;
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  async function loadConfig() {
    try {
      const data = await api.getPublicConfig();
      setConfig(data);
      setHours((current) => Math.min(Math.max(current, data.min_rental_hours), data.max_rental_hours));
    } catch (err) {
      console.warn('load config failed', err);
    }
  }

  useEffect(() => {
    loadLockers();
    loadConfig();
    const unsubscribe = subscribeWs(() => loadLockers());
    return () => {
      unsubscribe();
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (step === 'face-register' || step === 'face-identify') {
      startCamera();
    } else {
      stopCamera();
    }
  }, [step]);

  useEffect(() => {
    if (step === 'face-register' || step === 'face-identify') {
      if (cameraActive) {
        setCountdown(5);
      } else {
        setCountdown(null);
      }
    } else {
      setCountdown(null);
    }
  }, [step, cameraActive]);

  useEffect(() => {
    if (countdown === null || loading) return;

    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((c) => (c !== null ? c - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (countdown === 0 && cameraActive) {
      if (step === 'face-register') {
        registerFace();
      } else if (step === 'face-identify') {
        identifyFace();
      }
    }
  }, [countdown, step, cameraActive, loading]);

  async function startCamera() {
    if (streamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 640 },
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCameraActive(false);
      setMessage({ type: 'error', text: 'Không mở được camera. Hãy dùng phương án SĐT + OTP.' });
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  function isPendingKioskReservation() {
    return Boolean(
      rental?.rental_id
      && rental.payment_status !== 'PAID'
      && ['face-register', 'payment'].includes(step),
    );
  }

  async function cancelPendingReservation() {
    if (!isPendingKioskReservation()) return;
    try {
      await api.cancelReservation(rental.rental_id);
    } catch (err) {
      console.warn('cancel reservation failed', err);
    }
  }

  function captureBlob() {
    return new Promise((resolve) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) return resolve(null);
      const size = Math.min(video.videoWidth, video.videoHeight);
      const sx = (video.videoWidth - size) / 2;
      const sy = (video.videoHeight - size) / 2;
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(video, sx, sy, size, size, 0, 0, size, size);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
    });
  }

  async function reset() {
    cancelPendingReservation();
    setStep('select');
    setSelectedLocker(null);
    setPhone('');
    setHours(2);
    setRental(null);
    setOtp('');
    setOtpHint('');
    setOvertimeAction(null);
    setMessage({ type: 'info', text: '' });
    loadLockers();
  }

  function chooseLocker(locker) {
    setSelectedLocker(locker);
    setMessage({ type: 'info', text: '' });
    if (flow === 'store') {
      if (locker.status === 'RESERVED') {
        setStep('otp');
        setMessage({ type: 'info', text: 'Nhập số điện thoại đã dùng để đặt trước để tiến hành check-in và gửi đồ.' });
        return;
      }
      if (locker.status !== 'AVAILABLE') {
        setMessage({ type: 'error', text: 'Ngăn này chưa trống. Hãy chọn ngăn có trạng thái Trống.' });
        return;
      }
      setStep('details');
      return;
    }
    if (locker.status === 'AVAILABLE') {
      setMessage({ type: 'error', text: 'Ngăn này đang trống, không có phiên cần nhận đồ.' });
      return;
    }
    if (locker.status === 'RESERVED') {
      setMessage({ type: 'error', text: 'Ngăn tủ này đã được đặt trước nhưng chưa gửi đồ. Vui lòng chọn mục Gửi đồ để check-in.' });
      return;
    }
    if (!['OCCUPIED', 'OVERTIME', 'ADMIN_INTERVENTION'].includes(locker.status)) {
      setMessage({ type: 'error', text: 'Phiên này chưa thanh toán và chưa mở tủ. Hãy hoàn tất gửi đồ hoặc chờ phiên giữ chỗ tự hủy.' });
      return;
    }
    setStep('face-identify');
  }

  async function reserve() {
    setLoading(true);
    setMessage({ type: 'info', text: '' });
    try {
      const data = await api.reserve({ lockerId: selectedLocker.id, hours, phone });
      setRental(data);
      setStep('face-register');
    } catch (err) {
      setMessage({ type: 'error', text: `${err.message}. Bạn có thể thử lại, dùng OTP hoặc bấm Làm mới để hủy phiên giữ chỗ.` });
    } finally {
      setLoading(false);
    }
  }

  async function registerFace() {
    setLoading(true);
    setMessage({ type: 'info', text: 'Đang lưu Face ID cho phiên thuê.' });
    try {
      const blob = await captureBlob();
      if (!blob) throw new Error('Camera chưa sẵn sàng.');
      await api.uploadFace(rental.rental_id, blob);
      setStep('payment');
      setMessage({ type: 'success', text: 'Face ID đã được lưu. Vui lòng thanh toán để mở tủ.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function confirmPayment() {
    setLoading(true);
    try {
      const data = await api.paymentCallback(rental.rental_id);
      setRental((current) => ({ ...current, ...data, payment_status: 'PAID' }));
      setStep('success');
      setMessage({ type: 'success', text: 'Thanh toán thành công. Tủ đã nhận lệnh mở.' });
      loadLockers();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function identifyFace() {
    setLoading(true);
    setMessage({ type: 'info', text: 'Đang đối chiếu Face ID.' });
    try {
      const blob = await captureBlob();
      if (!blob) throw new Error('Camera chưa sẵn sàng.');
      const data = await api.identify(blob);
      setRental(data);
      setStep('actions');
      setMessage({ type: 'success', text: 'Xác thực thành công.' });
    } catch {
      setStep('otp');
      setMessage({ type: 'error', text: 'Face ID chưa nhận được. Hãy dùng SĐT + OTP dự phòng.' });
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp() {
    setLoading(true);
    try {
      const data = await api.requestOtp(phone);
      setOtpHint(`OTP demo: ${data.dev_otp}`);
      setMessage({ type: 'success', text: 'OTP đã được tạo cho số điện thoại này.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    try {
      const data = await api.verifyOtp(phone, otp);
      const matched = selectedLocker
        ? data.rentals.find((item) => item.locker_id === selectedLocker.id)
        : data.rentals[0];
      if (!matched) throw new Error('Số điện thoại này không có phiên ở ngăn đã chọn.');
      setRental({ ...matched, rental_id: matched.id });
      
      if (matched.status === 'RESERVED') {
        setStep('payment');
        setMessage({ type: 'success', text: 'Xác thực OTP thành công. Vui lòng thanh toán để check-in.' });
      } else {
        setStep('actions');
        setMessage({ type: 'success', text: 'OTP hợp lệ. Bạn có thể thao tác với tủ.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function executeTempOpen() {
    setLoading(true);
    try {
      await api.tempOpen(rental.rental_id);
      setMessage({ type: 'success', text: 'Đã gửi lệnh mở tạm thời. Hãy đóng cửa tủ sau khi thao tác.' });
      setStep('done');
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
      setOvertimeAction(null);
    }
  }

  async function executeReturnLocker() {
    setLoading(true);
    try {
      await api.returnLocker(rental.rental_id);
      setMessage({ type: 'success', text: 'Đã kết thúc phiên thuê và mở tủ để nhận đồ.' });
      setStep('done');
      loadLockers();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
      setOvertimeAction(null);
    }
  }

  function tempOpen() {
    if (rental?.overtime_fee > 0 || rental?.is_overtime) {
      setOvertimeAction('temp-open');
      setStep('overtime-payment');
    } else {
      executeTempOpen();
    }
  }

  function returnLocker() {
    if (rental?.overtime_fee > 0 || rental?.is_overtime) {
      setOvertimeAction('return');
      setStep('overtime-payment');
    } else {
      executeReturnLocker();
    }
  }

  const buttonBusy = loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null;

  return (
    <div className="w-full space-y-5">
      <section className="baggo-surface rounded-lg border p-5">
        <div className="flex flex-col items-center gap-4 text-center">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Kiosk tại tủ BAGGO</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {config.station_name} - {availableCount}/{lockers.length || 0} ngăn trống. Chọn thao tác rồi chọn ngăn.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-brand-100 bg-brand-50 p-1">
            <button
              className={`rounded-md px-4 py-2 text-sm font-extrabold ${flow === 'store' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-700'}`}
              onClick={() => {
                setFlow('store');
                reset();
              }}
            >
              Gửi đồ
            </button>
            <button
              className={`rounded-md px-4 py-2 text-sm font-extrabold ${flow === 'retrieve' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-700'}`}
              onClick={() => {
                setFlow('retrieve');
                reset();
              }}
            >
              Nhận đồ
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          {lockers.map((locker) => {
            const displayStatus = locker.reservation_stage || locker.status;
            const meta = getLockerStatusMeta(displayStatus, {
              label: locker.status_label,
              hint: locker.status_hint,
            });
            const selected = selectedLocker?.id === locker.id;
            return (
              <button
                key={locker.id}
                onClick={() => chooseLocker(locker)}
                className={`min-h-32 rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                  selected ? 'border-brand-600 ring-2 ring-brand-600/15 bg-brand-50' : 'border-brand-100 bg-white'
                } ${locker.status === 'AVAILABLE' ? '' : 'bg-brand-50/60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-lg font-extrabold">{locker.name}</div>
                  {locker.unlocking ? (
                    <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                  ) : locker.locked === 0 ? (
                    <DoorOpen className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <DoorClosed className="h-5 w-5 text-slate-400" />
                  )}
                </div>
                <div className={`mt-5 inline-flex rounded-md border px-2 py-1 text-xs font-extrabold ${meta.className}`}>
                  {meta.label}
                </div>
                <div className="mt-3 text-xs font-semibold text-slate-500">{meta.hint}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Modal Popup for Kiosk Actions */}
      {selectedLocker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 overflow-y-auto">
          <div className="baggo-surface w-full max-w-md rounded-xl border p-6 shadow-2xl relative bg-white flex flex-col max-h-[90vh]">
            {/* Close button */}
            <button
              onClick={reset}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Header */}
            <div className="mb-4 border-b border-brand-100 pb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-extrabold uppercase text-slate-400">Phiên thao tác</div>
                <div className="text-xl font-extrabold text-slate-950">{selectedLocker.name}</div>
              </div>
              <div className="text-xs">
                {selectedLocker.unlocking ? (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-2 py-0.5 font-bold text-amber-700">
                    <Loader2 className="h-3 w-3 animate-spin" /> Đang mở...
                  </span>
                ) : selectedLocker.locked === 0 ? (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-bold text-emerald-700">
                    <DoorOpen className="h-3 w-3" /> Cửa đang mở
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-50 border border-slate-200 px-2 py-0.5 font-bold text-slate-600">
                    <DoorClosed className="h-3 w-3" /> Cửa đã đóng
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto pr-1">
              <Message type={message.type}>{message.text}</Message>

              {step === 'select' && (
                <div className="mt-4 space-y-4 text-sm font-medium text-slate-600">
                  <p>Gửi đồ: chọn ngăn trống để bắt đầu đăng ký.</p>
                  <p>Nhận đồ: chọn ngăn đang dùng, sau đó xác thực bằng Face ID hoặc OTP dự phòng.</p>
                </div>
              )}

              {step === 'details' && (
                <div className="mt-4 space-y-4">
                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">Số điện thoại</span>
                    <input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-brand-100 px-3 py-3 text-base font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                      inputMode="tel"
                      placeholder="Ví dụ: 0901234567"
                    />
                  </label>
                  <div>
                    <div className="text-sm font-bold text-slate-700">Thời gian thuê</div>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {hoursOptions.map((item) => (
                        <button
                          key={item}
                          onClick={() => setHours(item)}
                          className={`rounded-lg border px-3 py-3 text-sm font-extrabold ${hours === item ? 'border-brand-600 bg-brand-600 text-white' : 'border-brand-100 bg-white text-slate-700'}`}
                        >
                          {item}h
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-brand-100 bg-brand-50 px-4 py-3">
                    <span className="text-sm font-bold text-slate-500">Tạm tính</span>
                    <span className="text-xl font-extrabold">{money(hours * hourlyPrice)}</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-500">Giá hiện tại: {money(hourlyPrice)}/giờ</div>
                  <button
                    disabled={loading}
                    onClick={reserve}
                    className="baggo-primary inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-extrabold disabled:opacity-60"
                  >
                    {buttonBusy}
                    Tiếp tục Face ID
                  </button>
                </div>
              )}

              {(step === 'face-register' || step === 'face-identify') && (
                <div className="mt-4 space-y-4">
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
                    <video ref={videoRef} autoPlay playsInline className="aspect-square w-full object-cover" />
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      disabled={loading || !cameraActive}
                      onClick={step === 'face-register' ? registerFace : identifyFace}
                      className="baggo-primary inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 font-extrabold disabled:opacity-60"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      {loading ? (
                        step === 'face-register' ? 'Đang lưu Face ID...' : 'Đang đối chiếu Face ID...'
                      ) : (
                        `${step === 'face-register' ? 'Lưu Face ID' : 'Quét Face ID'} ${countdown !== null ? `(Tự động sau ${countdown}s)` : ''}`
                      )}
                    </button>
                    {step === 'face-register' && (
                      <button
                        onClick={() => {
                          setStep('payment');
                          setMessage({ type: 'info', text: 'Bạn sẽ dùng SĐT + OTP nếu cần nhận đồ dự phòng.' });
                        }}
                        className="rounded-lg border border-brand-100 bg-white px-4 py-3 font-extrabold text-slate-700 hover:border-brand-300 hover:text-brand-700"
                      >
                        Dùng OTP
                      </button>
                    )}
                  </div>
                </div>
              )}

              {step === 'payment' && (
                <div className="mt-4 text-center py-8 text-slate-500 font-semibold border border-dashed rounded-lg bg-slate-50">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand-600 mb-2" />
                  Đang mở cổng thanh toán VietQR...
                  <PaymentQrModal
                    isOpen={step === 'payment'}
                    onClose={reset}
                    onPaymentSuccess={confirmPayment}
                    amount={rental?.price || 0}
                    rentalId={rental?.rental_id}
                    lockerName={selectedLocker?.name || `Ngăn ${rental?.locker_id}`}
                    stationName={selectedLocker?.station_name || config.station_name}
                  />
                </div>
              )}

              {step === 'otp' && (
                <div className="mt-4 space-y-4">
                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">Số điện thoại đã đăng ký</span>
                    <input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-brand-100 px-3 py-3 text-base font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                      inputMode="tel"
                    />
                  </label>
                  <button onClick={requestOtp} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-100 bg-white px-4 py-3 font-extrabold text-slate-700 hover:border-brand-300 hover:text-brand-700">
                    <Smartphone className="h-4 w-4" />
                    Tạo OTP dự phòng
                  </button>
                  {otpHint && <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">{otpHint}</div>}
                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">OTP</span>
                    <input
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-brand-100 px-3 py-3 text-center text-xl font-extrabold tracking-widest outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                      inputMode="numeric"
                      placeholder="000000"
                    />
                  </label>
                  <button onClick={verifyOtp} disabled={loading} className="baggo-primary inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-extrabold disabled:opacity-60">
                    {buttonBusy}
                    Xác thực OTP
                  </button>
                </div>
              )}

              {step === 'actions' && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg border border-brand-100 bg-brand-50 p-4">
                    <div className="text-sm font-bold text-slate-500">Phiên #{rental?.rental_id}</div>
                    <div className="mt-1 text-xl font-extrabold">Ngăn {rental?.locker_id}</div>
                    <div className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-slate-600">
                      <Clock className="h-4 w-4" />
                      {rental?.time_left || 'Đang hoạt động'}
                    </div>
                  </div>
                  <button onClick={tempOpen} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-100 bg-white px-4 py-3 font-extrabold text-slate-700 hover:border-brand-300 hover:text-brand-700">
                    <DoorOpen className="h-4 w-4" />
                    Mở tạm thời
                  </button>
                  <button onClick={returnLocker} disabled={loading} className="baggo-primary inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-extrabold">
                    <ShieldCheck className="h-4 w-4" />
                    Trả tủ và kết thúc
                  </button>
                </div>
              )}

              {step === 'overtime-payment' && (
                <div className="mt-4 text-center py-8 text-slate-500 font-semibold border border-dashed rounded-lg bg-slate-50">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand-600 mb-2" />
                  Đang mở cổng thanh toán VietQR cho phí quá hạn...
                  <PaymentQrModal
                    isOpen={step === 'overtime-payment'}
                    onClose={() => {
                      setStep('actions');
                      setOvertimeAction(null);
                    }}
                    onPaymentSuccess={overtimeAction === 'temp-open' ? executeTempOpen : executeReturnLocker}
                    amount={rental?.overtime_fee || 0}
                    rentalId={rental?.rental_id}
                    lockerName={selectedLocker?.name || `Ngăn ${rental?.locker_id}`}
                    stationName={selectedLocker?.station_name || config.station_name}
                  />
                </div>
              )}

              {step === 'success' && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-brand-800">
                    <CheckCircle2 className="mb-3 h-8 w-8" />
                    <div className="text-lg font-extrabold">Tủ đã mở</div>
                    <p className="mt-1 text-sm font-semibold">Hãy cất hành lý, đóng chặt cửa và giữ SĐT/OTP để nhận đồ khi cần.</p>
                  </div>
                  <button onClick={reset} className="baggo-primary w-full rounded-lg px-4 py-3 font-extrabold">Hoàn tất</button>
                </div>
              )}

              {step === 'done' && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg border border-brand-100 bg-brand-50 p-4 text-sm font-semibold text-slate-700">
                    Thao tác đã gửi đến hệ thống IoT. Kiểm tra cửa tủ trước khi rời kiosk.
                  </div>
                  <button onClick={reset} className="baggo-primary w-full rounded-lg px-4 py-3 font-extrabold">Về màn hình chính</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
