import { useState } from 'react';
import { Loader2, X, CheckCircle2, ReceiptText, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';

export default function PaymentQrModal({
  isOpen,
  onClose,
  onPaymentSuccess,
  amount,
  rentalId,
  lockerName,
  stationName,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  function money(value) {
    return Number(value || 0).toLocaleString('vi-VN') + 'đ';
  }

  async function handleConfirmPayment() {
    setLoading(true);
    setError('');
    try {
      await api.paymentCallback(rentalId);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onPaymentSuccess(rentalId);
      }, 1500);
    } catch (err) {
      setError(err.message || 'Thanh toán thất bại, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
      <div className="baggo-surface w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl transition-all duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-brand-600" />
            <h3 className="text-lg font-extrabold text-slate-800">Thanh toán Check-in</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
            <div className="rounded-full bg-emerald-100 p-4 text-emerald-600 animate-bounce">
              <ShieldCheck className="h-12 w-12" />
            </div>
            <h4 className="text-xl font-extrabold text-emerald-600">Thanh toán thành công!</h4>
            <p className="text-sm font-semibold text-slate-500">Hệ thống đang mở khóa ngăn {lockerName}...</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Info details */}
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 text-sm font-semibold text-slate-600 space-y-2">
              <div className="flex justify-between">
                <span>Mã phiên thuê:</span>
                <span className="font-mono text-slate-900 font-bold">#{rentalId}</span>
              </div>
              <div className="flex justify-between">
                <span>Trạm phục vụ:</span>
                <span className="text-slate-900 font-bold">{stationName}</span>
              </div>
              <div className="flex justify-between">
                <span>Ngăn tủ khóa:</span>
                <span className="text-brand-600 font-extrabold">{lockerName}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-base">
                <span className="text-slate-800 font-bold">Tổng tiền cần trả:</span>
                <span className="font-mono font-extrabold text-brand-700">{money(amount)}</span>
              </div>
            </div>

            {/* VietQR Mockup Card */}
            <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50/20 to-indigo-50/20 p-4 flex flex-col items-center shadow-xs">
              <div className="text-xs font-extrabold uppercase tracking-wide text-brand-600 mb-2">VietQR - Ngân hàng Thử Nghiệm</div>
              
              {/* QR Code Container */}
              <div className="relative border-2 border-brand-600 rounded-lg p-2 bg-white">
                <svg className="h-44 w-44 text-slate-800" viewBox="0 0 100 100" fill="currentColor">
                  {/* Outer Frame */}
                  <path d="M5,5 h90 v90 h-90 z" fill="none" stroke="currentColor" strokeWidth="2"/>
                  {/* Position detection patterns */}
                  <rect x="10" y="10" width="20" height="20" fill="currentColor" />
                  <rect x="13" y="13" width="14" height="14" fill="white" />
                  <rect x="16" y="16" width="8" height="8" fill="currentColor" />
                  
                  <rect x="70" y="10" width="20" height="20" fill="currentColor" />
                  <rect x="73" y="13" width="14" height="14" fill="white" />
                  <rect x="76" y="16" width="8" height="8" fill="currentColor" />
                  
                  <rect x="10" y="70" width="20" height="20" fill="currentColor" />
                  <rect x="13" y="73" width="14" height="14" fill="white" />
                  <rect x="16" y="76" width="8" height="8" fill="currentColor" />
                  
                  {/* Mock QR details */}
                  <rect x="35" y="15" width="6" height="6" fill="currentColor" />
                  <rect x="45" y="20" width="8" height="4" fill="currentColor" />
                  <rect x="40" y="30" width="12" height="12" fill="currentColor" />
                  <rect x="60" y="35" width="6" height="8" fill="currentColor" />
                  <rect x="25" y="45" width="10" height="10" fill="currentColor" />
                  <rect x="15" y="60" width="6" height="6" fill="currentColor" />
                  <rect x="55" y="55" width="15" height="15" fill="currentColor" />
                  <rect x="75" y="50" width="8" height="12" fill="currentColor" />
                  
                  <rect x="40" y="75" width="8" height="8" fill="currentColor" />
                  <rect x="55" y="78" width="12" height="6" fill="currentColor" />
                  <rect x="78" y="75" width="6" height="10" fill="currentColor" />
                </svg>
                
                {/* QR Center logo */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-md bg-brand-600 px-1.5 py-0.5 text-3xs font-extrabold text-white uppercase shadow-md">
                    BAGGO
                  </div>
                </div>
              </div>
              
              <div className="mt-3 text-center space-y-0.5 text-xs font-semibold text-slate-500">
                <div>Chủ tài khoản: <span className="font-extrabold text-slate-800 uppercase">CONG TY BAGO VIET NAM</span></div>
                <div>Số tài khoản: <span className="font-mono font-bold text-slate-800">0123456789</span></div>
                <div>Nội dung: <span className="font-mono font-extrabold text-brand-700">BAGGO RENTAL {rentalId}</span></div>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700">
                {error}
              </div>
            )}

            {/* Confirm Payment button */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-brand-100 bg-white py-3 font-extrabold text-slate-700 hover:border-brand-300 transition"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={loading}
                className="baggo-primary inline-flex items-center justify-center gap-2 rounded-lg py-3 font-extrabold disabled:opacity-60 transition"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Xác nhận đã thanh toán
              </button>
            </div>
            
            <p className="text-3xs text-center font-medium text-slate-400">
              * Click "Xác nhận đã thanh toán" để giả lập giao dịch chuyển khoản VietQR thành công.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
