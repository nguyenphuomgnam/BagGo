import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Clock,
  CreditCard,
  DoorOpen,
  Loader2,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { api, makeWs } from '../lib/api';
import { getLockerStatusMeta } from '../lib/lockerStatus';

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
  const [flow, setFlow] = useState('store');
  const [step, setStep] = useState('select');
  const [selectedLocker, setSelectedLocker] = useState(null);
  const [phone, setPhone] = useState('');
  const [hours, setHours] = useState(2);
  const [rental, setRental] = useState(null);
  const [otp, setOtp] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [message, setMessage] = useState({ type: 'info', text: '' });
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const availableCount = useMemo(
    () => lockers.filter((locker) => locker.status === 'AVAILABLE').length,
    [lockers],
  );

  async function loadLockers() {
    try {
      const data = await api.getLockers();
      setLockers(data);
      if (selectedLocker) {
        const fresh = data.find((locker) => locker.id === selectedLocker.id);
        if (fresh) setSelectedLocker(fresh);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  useEffect(() => {
    loadLockers();
    const ws = makeWs();
    ws.onmessage = () => loadLockers();
    ws.onerror = () => {};
    return () => {
      ws.close();
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
    await cancelPendingReservation();
    setStep('select');
    setSelectedLocker(null);
    setPhone('');
    setHours(2);
    setRental(null);
    setOtp('');
    setOtpHint('');
    setMessage({ type: 'info', text: '' });
    loadLockers();
  }

  function chooseLocker(locker) {
    setSelectedLocker(locker);
    setMessage({ type: 'info', text: '' });
    if (flow === 'store') {
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
    if (!['OCCUPIED', 'OVERTIME'].includes(locker.status)) {
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
      setStep('actions');
      setMessage({ type: 'success', text: 'OTP hợp lệ. Bạn có thể thao tác với tủ.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function tempOpen() {
    setLoading(true);
    try {
      await api.tempOpen(rental.rental_id);
      setMessage({ type: 'success', text: 'Đã gửi lệnh mở tạm thời. Hãy đóng cửa tủ sau khi thao tác.' });
      setStep('done');
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function returnLocker() {
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
    }
  }

  const buttonBusy = loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Kiosk tại tủ BAGGO</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {availableCount}/{lockers.length || 0} ngăn trống. Chọn thao tác rồi chọn ngăn.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              className={`rounded-md px-4 py-2 text-sm font-extrabold ${flow === 'store' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
              onClick={() => {
                setFlow('store');
                reset();
              }}
            >
              Gửi đồ
            </button>
            <button
              className={`rounded-md px-4 py-2 text-sm font-extrabold ${flow === 'retrieve' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
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
                  selected ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200'
                } ${locker.status === 'AVAILABLE' ? 'bg-white' : 'bg-slate-50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-lg font-extrabold">{locker.name}</div>
                  <LockKeyhole className="h-5 w-5 text-slate-400" />
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

      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="text-xs font-extrabold uppercase text-slate-400">Phiên thao tác</div>
            <div className="text-lg font-extrabold">{selectedLocker ? selectedLocker.name : 'Chưa chọn ngăn'}</div>
          </div>
          <button onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600">
            <RotateCcw className="h-4 w-4" />
            Làm mới
          </button>
        </div>

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
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-base font-semibold outline-none focus:border-slate-900"
                inputMode="tel"
                placeholder="Ví dụ: 0901234567"
              />
            </label>
            <div>
              <div className="text-sm font-bold text-slate-700">Thời gian thuê</div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {[1, 2, 4, 8].map((item) => (
                  <button
                    key={item}
                    onClick={() => setHours(item)}
                    className={`rounded-lg border px-3 py-3 text-sm font-extrabold ${hours === item ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}
                  >
                    {item}h
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-sm font-bold text-slate-500">Tạm tính</span>
              <span className="text-xl font-extrabold">{money(hours * 10000)}</span>
            </div>
            <button
              disabled={loading}
              onClick={reserve}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 font-extrabold text-white disabled:opacity-60"
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
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 font-extrabold text-white disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {step === 'face-register' ? 'Lưu Face ID' : 'Quét Face ID'}
              </button>
              {step === 'face-register' && (
                <button
                  onClick={() => {
                    setStep('payment');
                    setMessage({ type: 'info', text: 'Bạn sẽ dùng SĐT + OTP nếu cần nhận đồ dự phòng.' });
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-3 font-extrabold text-slate-700"
                >
                  Dùng OTP
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'payment' && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-col items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-5">
              <PaymentQr />
              <div className="text-center">
                <div className="text-sm font-bold text-slate-500">VietQR demo</div>
                <div className="text-2xl font-extrabold">{money(rental?.price)}</div>
              </div>
            </div>
            <button
              disabled={loading}
              onClick={confirmPayment}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-extrabold text-white disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Xác nhận đã thanh toán
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Số điện thoại đã đăng ký</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-base font-semibold outline-none focus:border-slate-900"
                inputMode="tel"
              />
            </label>
            <button onClick={requestOtp} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 font-extrabold text-slate-700">
              <Smartphone className="h-4 w-4" />
              Tạo OTP dự phòng
            </button>
            {otpHint && <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">{otpHint}</div>}
            <label className="block">
              <span className="text-sm font-bold text-slate-700">OTP</span>
              <input
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-xl font-extrabold tracking-widest outline-none focus:border-slate-900"
                inputMode="numeric"
                placeholder="000000"
              />
            </label>
            <button onClick={verifyOtp} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 font-extrabold text-white disabled:opacity-60">
              {buttonBusy}
              Xác thực OTP
            </button>
          </div>
        )}

        {step === 'actions' && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-500">Phiên #{rental?.rental_id}</div>
              <div className="mt-1 text-xl font-extrabold">Ngăn {rental?.locker_id}</div>
              <div className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-slate-600">
                <Clock className="h-4 w-4" />
                {rental?.time_left || 'Đang hoạt động'}
              </div>
            </div>
            <button onClick={tempOpen} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 font-extrabold text-slate-700">
              <DoorOpen className="h-4 w-4" />
              Mở tạm thời
            </button>
            <button onClick={returnLocker} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-extrabold text-white">
              <ShieldCheck className="h-4 w-4" />
              Trả tủ và kết thúc
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
              <CheckCircle2 className="mb-3 h-8 w-8" />
              <div className="text-lg font-extrabold">Tủ đã mở</div>
              <p className="mt-1 text-sm font-semibold">Hãy cất hành lý, đóng chặt cửa và giữ SĐT/OTP để nhận đồ khi cần.</p>
            </div>
            <button onClick={reset} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-extrabold text-white">Hoàn tất</button>
          </div>
        )}

        {step === 'done' && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              Thao tác đã gửi đến hệ thống IoT. Kiểm tra cửa tủ trước khi rời kiosk.
            </div>
            <button onClick={reset} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-extrabold text-white">Về màn hình chính</button>
          </div>
        )}
      </aside>
    </div>
  );
}
