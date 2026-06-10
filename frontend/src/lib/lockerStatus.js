const STATUS_META = {
  AVAILABLE: {
    label: 'Trống',
    hint: 'Sẵn sàng nhận hành lý',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  RESERVED: {
    label: 'Giữ chỗ',
    hint: 'Đã có phiên đặt trước',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  REGISTERING: {
    label: 'Đang đăng ký',
    hint: 'Chưa hoàn tất xác thực',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  AWAITING_PAYMENT: {
    label: 'Chờ thanh toán',
    hint: 'Đã xác thực, chưa mở tủ',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  OCCUPIED: {
    label: 'Đang dùng',
    hint: 'Cần xác thực để mở',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  OVERTIME: {
    label: 'Quá giờ',
    hint: 'Phiên đã hết hạn',
    className: 'border-orange-200 bg-orange-50 text-orange-700',
  },
  ADMIN_INTERVENTION: {
    label: 'Can thiệp',
    hint: 'Tạm khóa bởi admin',
    className: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  },
  COMPLETED: {
    label: 'Hoàn tất',
    hint: 'Phiên đã kết thúc',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  },
  CANCELLED: {
    label: 'Đã hủy',
    hint: 'Phiên đăng ký đã bị hủy',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  },
};

export function getLockerStatusMeta(status, fallback = {}) {
  const meta = STATUS_META[status] || STATUS_META.ADMIN_INTERVENTION;
  return {
    ...meta,
    label: fallback.label || meta.label,
    hint: fallback.hint || meta.hint,
    className: fallback.className || meta.className,
  };
}

export const LOCKER_STATUS_META = STATUS_META;
