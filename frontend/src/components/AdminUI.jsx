import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  DoorClosed,
  DoorOpen,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  MinusCircle,
  PlusCircle,
  ReceiptText,
  Search,
  Settings2,
  ShieldAlert,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { api, subscribeWs } from '../lib/api';
import { getLockerStatusMeta } from '../lib/lockerStatus';
import StationManager from './StationManager';

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

function Badge({ status, label, hint }) {
  const meta = getLockerStatusMeta(status, { label, hint });
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-extrabold ${meta.className}`}>{meta.label}</span>;
}

function SectionCard({ title, children, action, className = '' }) {
  return (
    <section className={`baggo-surface rounded-lg border p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-extrabold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, icon: Icon, tone }) {
  return (
    <div className="baggo-surface rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-extrabold uppercase text-slate-400">{label}</div>
          <div className={`mt-2 text-2xl font-extrabold ${tone}`}>{value}</div>
        </div>
        <div className="rounded-lg bg-brand-50 p-3 text-brand-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ action, loading, onCancel, onConfirm }) {
  if (!action) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="baggo-surface w-full max-w-md rounded-lg border p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-amber-50 p-3 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">{action.title}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{action.description}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="rounded-lg border border-brand-100 bg-white px-4 py-3 font-extrabold text-slate-700 hover:border-brand-300">
            Hủy
          </button>
          <button onClick={onConfirm} disabled={loading} className="baggo-primary inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-extrabold disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {action.label}
          </button>
        </div>
      </div>
    </div>
  );
}

function Pagination({ page, pages, total, onPageChange, compact }) {
  if (pages <= 1) return null;

  if (compact) {
    return (
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2.5 mt-2 bg-white rounded-lg">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="relative inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          Trước
        </button>
        <span className="text-xs text-slate-600 font-bold">
          Trang <span className="text-brand-600 font-extrabold">{page}</span> / <span className="text-slate-800 font-extrabold">{pages}</span>
        </span>
        <button
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          className="relative inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          Sau
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6 mt-4 bg-white rounded-lg">
      <div className="flex flex-1 justify-between sm:hidden">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="relative inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Trước
        </button>
        <button
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          className="relative ml-3 inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Sau
        </button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-700 font-semibold">
            Hiển thị trang <span className="font-extrabold text-brand-700">{page}</span> trên tổng số <span className="font-extrabold text-slate-900">{pages}</span> trang (Tổng <span className="font-extrabold text-slate-900">{total}</span> bản ghi)
          </p>
        </div>
        <div>
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-xs" aria-label="Pagination">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="relative inline-flex items-center rounded-l-md px-3 py-2 text-slate-400 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 disabled:opacity-40 text-xs font-bold"
            >
              &larr; Trước
            </button>
            {Array.from({ length: pages }).map((_, idx) => {
              const p = idx + 1;
              const isCurrent = p === page;
              if (pages > 8 && p !== 1 && p !== pages && Math.abs(p - page) > 2) {
                if (p === 2 && page > 4) return <span key={p} className="relative inline-flex items-center px-3 py-2 text-xs font-semibold text-slate-400">...</span>;
                if (p === pages - 1 && page < pages - 3) return <span key={p} className="relative inline-flex items-center px-3 py-2 text-xs font-semibold text-slate-400">...</span>;
                return null;
              }
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`relative inline-flex items-center px-3.5 py-2 text-xs font-extrabold ring-1 ring-inset ${
                    isCurrent
                      ? 'z-10 bg-brand-600 text-white ring-brand-600'
                      : 'text-slate-700 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              disabled={page >= pages}
              onClick={() => onPageChange(page + 1)}
              className="relative inline-flex items-center rounded-r-md px-3 py-2 text-slate-400 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 disabled:opacity-40 text-xs font-bold"
            >
              Sau &rarr;
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}

export default function AdminUI() {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(() => localStorage.getItem('baggo_admin_token') || '');
  const [lockers, setLockers] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [settingsDraft, setSettingsDraft] = useState({
    station_name: 'Trạm MVP',
    price_per_hour: 10000,
    overtime_price_per_hour: 15000,
    min_rental_hours: 1,
    max_rental_hours: 24,
    reservation_hold_seconds: 120,
  });
  const [newLocker, setNewLocker] = useState({
    name: '',
    station_name: 'Trạm MVP',
  });
  const [stations, setStations] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [logs, setLogs] = useState([]);
  const [rentalPage, setRentalPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [rentalMeta, setRentalMeta] = useState({ total: 0, pages: 1 });
  const [logMeta, setLogMeta] = useState({ total: 0, pages: 1 });
  const [activeRentals, setActiveRentals] = useState([]);
  const [activeRentalPage, setActiveRentalPage] = useState(1);
  const [activeRentalMeta, setActiveRentalMeta] = useState({ total: 0, pages: 1 });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedLocker, setSelectedLocker] = useState(null);
  const [rentalFilter, setRentalFilter] = useState('all');
  const [rentalSearch, setRentalSearch] = useState('');
  const [message, setMessage] = useState({ type: 'info', text: '' });
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const { activeTab = 'overview' } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(rentalSearch);
    }, 400);
    return () => clearTimeout(handler);
  }, [rentalSearch]);

  const selectedFreshLocker = useMemo(
    () => lockers.find((locker) => locker.id === selectedLocker?.id) || selectedLocker,
    [lockers, selectedLocker],
  );

  const [activeRentalForSelectedLocker, setActiveRentalForSelectedLocker] = useState(null);

  useEffect(() => {
    if (!selectedFreshLocker || !selectedFreshLocker.active_rental_id) {
      setActiveRentalForSelectedLocker(null);
      return;
    }
    let active = true;
    api.adminRentalDetail(token, selectedFreshLocker.active_rental_id)
      .then((detail) => {
        if (active) setActiveRentalForSelectedLocker(detail);
      })
      .catch((err) => {
        console.error("Failed to load rental detail", err);
      });
    return () => {
      active = false;
    };
  }, [selectedFreshLocker, token]);

  async function fetchRentals(page, filter, search, activeToken = token) {
    if (!activeToken) return;
    try {
      const res = await api.adminRentals(activeToken, page, 20, filter, search);
      setRentals(res.items);
      setRentalMeta({ total: res.total, pages: res.pages });
      setRentalPage(res.page);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchLogs(page, activeToken = token) {
    if (!activeToken) return;
    try {
      const res = await api.adminLogs(activeToken, page, 20);
      setLogs(res.items);
      setLogMeta({ total: res.total, pages: res.pages });
      setLogPage(res.page);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadAll(activeToken = token) {
    if (!activeToken) return;
    try {
      const [lockerData, statData, rentalRes, logRes, settingsData, activeRes, stationData] = await Promise.all([
        api.getLockers(),
        api.adminStats(activeToken),
        api.adminRentals(activeToken, 1, 20, rentalFilter, debouncedSearch),
        api.adminLogs(activeToken, 1, 20),
        api.adminSettings(activeToken),
        api.adminRentals(activeToken, 1, 5, 'active', ''),
        api.getStations(),
      ]);
      setLockers(lockerData);
      setStats(statData);
      setRentals(rentalRes.items);
      setRentalMeta({ total: rentalRes.total, pages: rentalRes.pages });
      setRentalPage(1);
      setLogs(logRes.items);
      setLogMeta({ total: logRes.total, pages: logRes.pages });
      setLogPage(1);
      setActiveRentals(activeRes.items);
      setActiveRentalMeta({ total: activeRes.total, pages: activeRes.pages });
      setActiveRentalPage(1);
      const defaultSettings = {
        station_name: 'Trạm MVP',
        price_per_hour: 10000,
        overtime_price_per_hour: 15000,
        min_rental_hours: 1,
        max_rental_hours: 24,
        reservation_hold_seconds: 120,
      };
      setSettings(settingsData || defaultSettings);
      setSettingsDraft(settingsData || defaultSettings);
      setStations(stationData || []);
      setNewLocker((current) => ({
        ...current,
        station_name: stationData && stationData.length > 0 ? stationData[0].name : ((settingsData || defaultSettings).station_name || current.station_name),
      }));
      if (selectedLocker) {
        setSelectedLocker(lockerData.find((locker) => locker.id === selectedLocker.id) || null);
      }
    } catch (err) {
      localStorage.removeItem('baggo_admin_token');
      setToken('');
      setMessage({ type: 'error', text: err.message });
    }
  }

  useEffect(() => {
    loadAll();
    if (!token) return undefined;
    return subscribeWs(() => {
      api.getLockers().then(setLockers).catch(console.error);
      api.adminStats(token).then(setStats).catch(console.error);
      fetchRentals(rentalPage, rentalFilter, debouncedSearch, token);
      fetchLogs(logPage, token);
      api.adminRentals(token, activeRentalPage, 5, 'active', '')
        .then((res) => {
          setActiveRentals(res.items);
          setActiveRentalMeta({ total: res.total, pages: res.pages });
        })
        .catch(console.error);
    });
  }, [token, activeRentalPage, rentalPage, rentalFilter, debouncedSearch, logPage]);

  useEffect(() => {
    if (token) {
      fetchRentals(rentalPage, rentalFilter, debouncedSearch, token);
    }
  }, [rentalPage, rentalFilter, debouncedSearch, token]);

  useEffect(() => {
    if (token) {
      fetchLogs(logPage, token);
    }
  }, [logPage, token]);

  useEffect(() => {
    if (token) {
      api.adminRentals(token, activeRentalPage, 5, 'active', '')
        .then((res) => {
          setActiveRentals(res.items);
          setActiveRentalMeta({ total: res.total, pages: res.pages });
        })
        .catch(console.error);
    }
  }, [activeRentalPage, token]);

  useEffect(() => {
    setRentalPage(1);
  }, [rentalFilter, debouncedSearch]);

  async function login() {
    setLoading(true);
    try {
      const data = await api.adminLogin(password);
      localStorage.setItem('baggo_admin_token', data.token);
      setToken(data.token);
      setPassword('');
      setMessage({ type: 'success', text: 'Đăng nhập admin thành công.' });
      await loadAll(data.token);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem('baggo_admin_token');
    setToken('');
    setLockers([]);
    setRentals([]);
    setLogs([]);
    setStats(null);
    setSettings(null);
    setSelectedLocker(null);
  }

  function updateSettingsField(field, value) {
    setSettingsDraft((current) => ({ ...current, [field]: value }));
  }

  function updateNewLockerField(field, value) {
    setNewLocker((current) => ({ ...current, [field]: value }));
  }

  async function saveSettings() {
    setLoading(true);
    try {
      const data = await api.updateAdminSettings(token, settingsDraft);
      setSettings(data);
      setSettingsDraft(data);
      await loadAll();
      setMessage({ type: 'success', text: 'Đã lưu cấu hình vận hành.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function addLocker() {
    if (!newLocker.name.trim()) {
      setMessage({ type: 'error', text: 'Nhập tên tủ trước khi thêm.' });
      return;
    }
    setLoading(true);
    try {
      await api.createLocker(token, newLocker);
      setNewLocker((current) => ({ ...current, name: '' }));
      await loadAll();
      setMessage({ type: 'success', text: 'Đã thêm tủ mới.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  function openAction(type) {
    if (!selectedFreshLocker) {
      setMessage({ type: 'error', text: 'Hãy chọn một ngăn trước.' });
      return;
    }
    const name = selectedFreshLocker.name;
    const actions = {
      open: {
        type,
        title: `Mở khóa khẩn cấp ${name}`,
        description: 'Backend sẽ gửi lệnh mở qua MQTT và chuyển ngăn sang trạng thái can thiệp admin.',
        label: 'Mở khóa',
      },
      close: {
        type,
        title: `Đóng/khôi phục ${name}`,
        description: 'Backend gửi lệnh đóng và khôi phục trạng thái theo phiên thuê đang hoạt động.',
        label: 'Đóng tủ',
      },
      force: {
        type,
        title: `Giải phóng cưỡng chế ${name}`,
        description: 'Phiên thuê đang hoạt động sẽ bị kết thúc, Face ID được chuyển vào lịch sử và tủ trở về trạng thái trống.',
        label: 'Giải phóng',
      },
      remove: {
        type,
        title: `Bớt tủ ${name}`,
        description: 'Tủ này sẽ bị ẩn khỏi sơ đồ vận hành. Chỉ làm khi tủ không còn phiên thuê nào đang chạy.',
        label: 'Bớt tủ',
      },
    };
    setPendingAction(actions[type]);
  }

  async function runAction() {
    if (!pendingAction || !selectedFreshLocker) return;
    setLoading(true);
    try {
      if (pendingAction.type === 'open') await api.adminOpen(token, selectedFreshLocker.id);
      if (pendingAction.type === 'close') await api.adminClose(token, selectedFreshLocker.id);
      if (pendingAction.type === 'force') await api.adminForceReturn(token, selectedFreshLocker.id);
      if (pendingAction.type === 'remove') await api.deleteLocker(token, selectedFreshLocker.id);
      setPendingAction(null);
      if (pendingAction.type === 'remove') {
        setSelectedLocker(null);
      }
      await loadAll();
      setMessage({ type: 'success', text: 'Thao tác admin đã được gửi thành công.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="baggo-surface rounded-lg border p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-600 text-white">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Admin BAGGO</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
            Dùng mật khẩu từ biến môi trường <span className="font-extrabold text-slate-700">ADMIN_PASSWORD</span>. Nếu chưa cấu hình, backend dùng mật khẩu demo.
          </p>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Mật khẩu</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-lg border border-brand-100 px-3 py-3 text-base font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                placeholder="admin123"
              />
            </label>
            <button onClick={login} disabled={loading} className="baggo-primary inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-extrabold disabled:opacity-60">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Đăng nhập
            </button>
            <Message type={message.type}>{message.text}</Message>
          </div>
        </section>

        <section className="baggo-surface rounded-lg border p-5">
          <h2 className="text-lg font-extrabold">Quản trị MVP</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ['Theo dõi real-time', 'Tủ đổi trạng thái qua WebSocket khi backend nhận MQTT hoặc lệnh vận hành.'],
              ['Phiên thuê và doanh thu', 'Bảng lấy trực tiếp từ SQLite, không còn chart dữ liệu giả.'],
              ['Can thiệp IoT', 'Mở, đóng, giải phóng cưỡng chế có log đầy đủ.'],
              ['Audit log', 'Ghi nhận reserve, payment, OTP, mở tủ và thao tác admin.'],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-lg border border-brand-100 bg-brand-50 p-4">
                <CheckCircle2 className="mb-3 h-5 w-5 text-brand-600" />
                <div className="font-extrabold text-slate-900">{title}</div>
                <p className="mt-2 text-sm font-medium leading-5 text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const cards = [
    { label: 'Doanh thu', value: money(stats?.total_revenue), icon: TrendingUp, tone: 'text-brand-700' },
    { label: 'Hôm nay', value: money(stats?.today_revenue), icon: BarChart3, tone: 'text-slate-800' },
    { label: 'Phiên hoạt động', value: stats?.active_sessions || 0, icon: Users, tone: 'text-slate-800' },
    { label: 'Cần thu quá giờ', value: money(stats?.overtime_due || 0), icon: ReceiptText, tone: 'text-orange-700' },
    { label: 'Tỷ lệ dùng tủ', value: `${stats?.utilization_rate || 0}%`, icon: Activity, tone: 'text-slate-800' },
  ];
  const alerts = stats?.alerts || [];
  const selectedLockerCanRemove = selectedFreshLocker && selectedFreshLocker.status === 'AVAILABLE';
  const rentalFilterOptions = [
    { value: 'all', label: 'Tất cả', count: rentalMeta.total },
    { value: 'active', label: 'Đang chạy', count: stats?.active_sessions || 0 },
    { value: 'overtime', label: 'Quá giờ', count: stats?.overtime_sessions || 0 },
    { value: 'completed', label: 'Hoàn tất' },
    { value: 'cancelled', label: 'Đã hủy' },
  ];

  const tabs = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'lockers', label: 'Sơ đồ tủ', icon: LockKeyhole },
    { id: 'orders', label: 'Đơn đặt tủ', icon: ReceiptText },
    { id: 'settings', label: 'Cấu hình', icon: Settings2 },
  ];

  return (
    <div className="space-y-5">
      {/* Header Panel */}
      <section className="baggo-surface rounded-lg border p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Dashboard vận hành
              <span className="ml-2 text-brand-700">- {settings?.station_name || 'Trạm MVP'}</span>
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {stats?.available_lockers || 0}/{stats?.total_lockers || 0} ngăn trống, {stats?.overtime_sessions || 0} phiên quá hạn.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => loadAll()} className="rounded-lg border border-brand-100 bg-white px-4 py-3 font-extrabold text-slate-700 hover:border-brand-300 hover:text-brand-700 transition">
              Làm mới
            </button>
            <button onClick={logout} className="inline-flex items-center gap-2 rounded-lg border border-brand-100 bg-white px-4 py-3 font-extrabold text-slate-700 hover:border-brand-300 hover:text-brand-700 transition">
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </div>
        <div className="mt-4">
          <Message type={message.type}>{message.text}</Message>
        </div>
      </section>

      {/* Tabs Navigation */}
      <div className="flex border-b border-brand-100 bg-white/40 backdrop-blur rounded-lg p-1 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => navigate(`/admin/${tab.id}`)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md py-3 text-sm font-extrabold transition-all duration-200 ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-white/60 hover:text-brand-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.id === 'overview' && stats?.overtime_sessions > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-orange-500 px-2 py-0.5 text-2xs font-extrabold text-white animate-pulse">
                  {stats.overtime_sessions}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Stat Cards */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {cards.map(({ label, value, icon: Icon, tone }) => (
              <StatCard key={label} label={label} value={value} icon={Icon} tone={tone} />
            ))}
          </section>

          {/* Alerts & Logs Layout */}
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            {/* Left side list of alerts and active rentals */}
            <div className="space-y-5 flex flex-col justify-start">
              {/* Overtime Alerts */}
              <SectionCard
                title="Cảnh báo quá giờ"
                action={
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-extrabold text-amber-700">
                    {stats?.overtime_sessions || 0} quá hạn
                  </div>
                }
              >
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {alerts.length} phiên đang vượt thời gian. Kiểm tra trạm, ngăn và phí phát sinh.
                </p>
                <div className="mt-4 space-y-3">
                  {alerts.map((alert) => (
                    <div key={alert.rental_id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-extrabold uppercase text-amber-700">{alert.station_name || settings?.station_name || 'Trạm MVP'}</div>
                          <div className="mt-1 text-lg font-extrabold text-slate-900">{alert.locker_name}</div>
                        </div>
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold text-slate-700">
                        <div>SĐT: {alert.phone || '-'}</div>
                        <div>Quá giờ: {alert.overtime_hours} giờ</div>
                        <div>Phí quá hạn: {money(alert.overtime_fee)}</div>
                        <div>Cần thu thêm: {money(alert.amount_due)}</div>
                      </div>
                    </div>
                  ))}
                  {alerts.length === 0 && (
                    <div className="rounded-lg border border-dashed border-brand-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">
                      Không có phiên quá giờ.
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* Active Renters */}
              <SectionCard
                title="Khách hàng đang thuê"
                action={
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-extrabold text-indigo-700">
                    {stats?.active_sessions || 0} đang dùng
                  </div>
                }
              >
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Danh sách ngăn tủ đang hoạt động và thông tin liên hệ của khách hàng.
                </p>
                <div className="mt-4 space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {activeRentals.map((rental) => (
                    <div key={rental.id} className="rounded-lg border border-brand-100 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-slate-900">{rental.locker_name || `Ngăn ${rental.locker_id}`}</span>
                          <span className={`rounded px-1.5 py-0.5 text-2xs font-extrabold border ${
                            rental.status === 'OVERTIME'
                              ? 'bg-rose-50 border-rose-200 text-rose-700'
                              : rental.status === 'RESERVED'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          }`}>
                            {rental.status_label}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                          <div>SĐT: <span className="font-bold text-slate-700">{rental.phone || '-'}</span></div>
                          <div>Mã mở tủ: <span className="font-mono font-bold text-slate-700">{rental.access_code || '-'}</span></div>
                          <div className="col-span-2 mt-1 flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            <span className={rental.is_overtime ? 'text-rose-600 font-bold animate-pulse' : 'text-slate-600'}>
                              {rental.time_left}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-400">Tạm tính</div>
                        <div className="text-base font-extrabold text-brand-700">{money(rental.total_due || rental.price)}</div>
                      </div>
                    </div>
                  ))}
                  {activeRentals.length === 0 && (
                    <div className="rounded-lg border border-dashed border-brand-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">
                      Không có khách đang thuê.
                    </div>
                  )}
                </div>
                {activeRentalMeta.pages > 1 && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <Pagination page={activeRentalPage} pages={activeRentalMeta.pages} total={activeRentalMeta.total} onPageChange={setActiveRentalPage} compact={true} />
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Audit Logs */}
            <div className="baggo-surface rounded-lg border p-5 flex flex-col justify-between h-full min-h-[500px]">
              <h2 className="text-lg font-extrabold text-slate-800">Nhật ký hoạt động</h2>
              <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-brand-100 bg-brand-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-400">{log.created_at}</span>
                      <span className="rounded bg-white px-2 py-1 text-xs font-extrabold text-slate-500">{log.actor}</span>
                    </div>
                    <div className="mt-2 text-sm font-extrabold text-slate-800">{log.action}</div>
                    <p className="mt-1 text-sm font-medium text-slate-500">{log.detail}</p>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="rounded-lg border border-dashed border-brand-200 p-8 text-center text-sm font-semibold text-slate-400">
                    Chưa có log.
                  </div>
                )}
              </div>
              <Pagination page={logPage} pages={logMeta.pages} total={logMeta.total} onPageChange={setLogPage} compact={true} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'lockers' && (
        <div className="baggo-surface rounded-lg border p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-extrabold text-slate-800">Sơ đồ ngăn tủ</h2>
              <p className="text-sm font-medium text-slate-500 mt-1">Chọn một ngăn tủ dưới đây để xem thông tin chi tiết và thao tác điều khiển khẩn cấp.</p>
            </div>
            <div className="flex gap-4 text-xs font-extrabold flex-wrap">
              <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-500 border border-emerald-600 inline-block"></span> Trống</div>
              <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-indigo-500 border border-indigo-600 inline-block"></span> Đặt trước</div>
              <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-500 border border-amber-600 inline-block"></span> Đang thuê</div>
              <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-rose-500 border border-rose-600 inline-block"></span> Quá giờ</div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {lockers.map((locker) => (
              <button
                key={locker.id}
                onClick={() => setSelectedLocker(locker)}
                className={`min-h-28 rounded-xl border p-4 text-left transition duration-200 transform hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between ${
                  selectedFreshLocker?.id === locker.id 
                    ? 'border-brand-600 ring-2 ring-brand-600/20 bg-brand-50/20 shadow-md' 
                    : 'border-slate-100 bg-white hover:border-brand-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2 w-full">
                  <div className="text-lg font-extrabold text-slate-800">{locker.name}</div>
                  {locker.unlocking ? (
                    <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                  ) : locker.locked === 0 ? (
                    <DoorOpen className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <DoorClosed className="h-4 w-4 text-slate-400" />
                  )}
                </div>
                <div className="mt-4">
                  <Badge status={locker.reservation_stage || locker.status} label={locker.status_label} hint={locker.status_hint} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="baggo-surface rounded-lg border p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-extrabold text-slate-800">Đơn đặt tủ</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Danh sách các phiên thuê tủ (đặt chỗ, đang thuê, quá giờ, hoàn tất và hủy bỏ).
              </p>
            </div>
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={rentalSearch}
                onChange={(event) => setRentalSearch(event.target.value)}
                placeholder="Tìm SĐT, ngăn, trạm, mã phiên"
                className="w-full rounded-lg border border-brand-100 bg-white py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {rentalFilterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setRentalFilter(option.value)}
                className={`rounded-lg border px-4 py-2 text-xs font-extrabold transition-all duration-150 ${
                  rentalFilter === option.value
                    ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                    : 'border-brand-100 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700'
                }`}
              >
                {option.label}{option.count !== undefined ? ` · ${option.count}` : ''}
              </button>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-3.5 px-4 font-extrabold">ID</th>
                  <th className="py-3.5 px-4 font-extrabold">Trạm</th>
                  <th className="py-3.5 px-4 font-extrabold">Ngăn</th>
                  <th className="py-3.5 px-4 font-extrabold">Số điện thoại</th>
                  <th className="py-3.5 px-4 font-extrabold">Thời gian</th>
                  <th className="py-3.5 px-4 font-extrabold text-right">Phí thuê gốc</th>
                  <th className="py-3.5 px-4 font-extrabold text-right">Phí quá giờ</th>
                  <th className="py-3.5 px-4 font-extrabold text-right">Tổng cộng</th>
                  <th className="py-3.5 px-4 font-extrabold">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rentals.map((rental) => (
                  <tr key={rental.id} className="hover:bg-slate-50/50 transition duration-150">
                    <td className="py-3 px-4 font-mono font-bold text-slate-500">#{rental.id}</td>
                    <td className="py-3 px-4 font-semibold text-slate-600">{rental.station_name || settings?.station_name || '-'}</td>
                    <td className="py-3 px-4 font-bold text-slate-800">{rental.locker_name}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">{rental.phone || '-'}</td>
                    <td className={`py-3 px-4 font-semibold ${rental.is_overtime ? 'text-rose-600' : 'text-slate-600'}`}>{rental.time_left}</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-700 text-right">{money(rental.base_price || rental.price)}</td>
                    <td className="py-3 px-4 font-mono font-bold text-orange-600 text-right">{money(rental.overtime_fee || 0)}</td>
                    <td className="py-3 px-4 font-mono font-bold text-brand-700 text-right">{money(rental.total_due || rental.price)}</td>
                    <td className="py-3 px-4"><Badge status={rental.reservation_stage || rental.status} label={rental.status_label} hint={rental.status_hint} /></td>
                  </tr>
                ))}
                {rentals.length === 0 && (
                  <tr>
                    <td colSpan="9" className="py-12 text-center font-semibold text-slate-400 bg-white">Không có đơn đặt tủ phù hợp bộ lọc.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={rentalPage} pages={rentalMeta.pages} total={rentalMeta.total} onPageChange={setRentalPage} />
        </div>
      )}

      {activeTab === 'settings' && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
          {/* Operating Settings Form */}
          <div className="baggo-surface rounded-lg border p-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Settings2 className="h-5 w-5 text-brand-700" />
              <h2 className="text-lg font-extrabold text-slate-800">Cấu hình vận hành</h2>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-bold text-slate-700">Tên trạm</span>
                <input
                  value={settingsDraft.station_name}
                  onChange={(event) => updateSettingsField('station_name', event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-brand-100 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Giá / giờ</span>
                <input
                  type="number"
                  min="0"
                  value={settingsDraft.price_per_hour}
                  onChange={(event) => updateSettingsField('price_per_hour', Number(event.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-brand-100 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Phí quá giờ / giờ</span>
                <input
                  type="number"
                  min="0"
                  value={settingsDraft.overtime_price_per_hour}
                  onChange={(event) => updateSettingsField('overtime_price_per_hour', Number(event.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-brand-100 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Giờ thuê tối thiểu</span>
                <input
                  type="number"
                  min="1"
                  value={settingsDraft.min_rental_hours}
                  onChange={(event) => updateSettingsField('min_rental_hours', Number(event.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-brand-100 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Giờ thuê tối đa</span>
                <input
                  type="number"
                  min="1"
                  value={settingsDraft.max_rental_hours}
                  onChange={(event) => updateSettingsField('max_rental_hours', Number(event.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-brand-100 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-bold text-slate-700">Thời gian giữ chỗ (giây)</span>
                <input
                  type="number"
                  min="0"
                  value={settingsDraft.reservation_hold_seconds}
                  onChange={(event) => updateSettingsField('reservation_hold_seconds', Number(event.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-brand-100 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
                />
              </label>
            </div>
            <button onClick={saveSettings} disabled={loading} className="baggo-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-extrabold disabled:opacity-60 transition-all duration-150">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Lưu cấu hình
            </button>
            {settings && (
              <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50/50 p-3.5 text-xs font-semibold text-slate-600">
                Đang áp dụng: <span className="text-brand-700 font-extrabold">{settings.station_name}</span>, <span className="font-extrabold">{money(settings.price_per_hour)}/giờ</span>, giữ chỗ {settings.reservation_hold_seconds} giây.
              </div>
            )}
          </div>

          {/* Add New Locker Form */}
          <div className="baggo-surface rounded-lg border p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <PlusCircle className="h-5 w-5 text-brand-700" />
                <h2 className="text-lg font-extrabold text-slate-800">Thêm ngăn tủ mới</h2>
              </div>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">Tên ngăn tủ mới</span>
                  <input
                    value={newLocker.name}
                    onChange={(event) => updateNewLockerField('name', event.target.value)}
                    placeholder="Ví dụ: Ngăn 7"
                    className="mt-1.5 w-full rounded-lg border border-brand-100 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">Trạm trực thuộc</span>
                  <select
                    value={newLocker.station_name}
                    onChange={(event) => updateNewLockerField('station_name', event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-brand-100 px-3.5 py-2.5 text-sm font-semibold outline-none bg-white focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
                  >
                    {stations.map((station) => (
                      <option key={station.id} value={station.name}>
                        {station.name}
                      </option>
                    ))}
                    {stations.length === 0 && (
                      <option value="">(Không có trạm nào - Vui lòng thêm trạm phía dưới)</option>
                    )}
                  </select>
                </label>
              </div>
            </div>
            <button onClick={addLocker} disabled={loading} className="baggo-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-extrabold disabled:opacity-60 transition-all duration-150">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Thêm tủ
            </button>
          </div>
        </div>

          {/* Station Management Panel */}
          <div className="mt-6">
            <StationManager
              token={token}
              stations={stations}
              onRefresh={() => loadAll()}
              setMessage={setMessage}
            />
          </div>
        </>
      )}

      {/* Locker Details Drawer (Box hiện lên) */}
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-xs transition-opacity duration-300 ${
          selectedFreshLocker ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
        }`}
        onClick={() => setSelectedLocker(null)}
      />
      
      {/* Drawer Panel */}
      <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white border-l border-slate-200 shadow-2xl p-6 flex flex-col justify-between transition-transform duration-300 ease-in-out transform ${
        selectedFreshLocker ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {selectedFreshLocker ? (
          <div className="flex flex-col h-full justify-between">
            <div className="space-y-5 overflow-y-auto pr-1">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Chi tiết ngăn tủ</h3>
                  <p className="text-xs text-slate-400 font-medium">ID ngăn: {selectedFreshLocker.id}</p>
                </div>
                <button 
                  onClick={() => setSelectedLocker(null)}
                  className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition duration-150"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Status Section */}
              <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
                <div className="text-xs font-extrabold uppercase text-slate-400">Trạng thái ngăn</div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-2xl font-extrabold text-slate-800">{selectedFreshLocker.name}</span>
                  <Badge 
                    status={selectedFreshLocker.reservation_stage || selectedFreshLocker.status} 
                    label={selectedFreshLocker.status_label} 
                    hint={selectedFreshLocker.status_hint} 
                  />
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-500">
                  {getLockerStatusMeta(selectedFreshLocker.reservation_stage || selectedFreshLocker.status, { 
                    label: selectedFreshLocker.status_label, 
                    hint: selectedFreshLocker.status_hint 
                  }).hint}
                </div>
                <div className="mt-4 pt-3 border-t border-brand-100/50 flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-400 uppercase">Cửa vật lý (IoT):</span>
                  {selectedFreshLocker.unlocking ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-2 py-0.5 font-bold text-amber-700">
                      <Loader2 className="h-3 w-3 animate-spin" /> Đang mở khóa...
                    </span>
                  ) : selectedFreshLocker.locked === 0 ? (
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

              {/* Active Rental info inside the Drawer if occupied or overtime */}
              {activeRentalForSelectedLocker && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="text-xs font-extrabold uppercase text-slate-400 pb-2 border-b border-slate-200/50">Thông tin phiên thuê</div>
                  <div className="mt-3 space-y-2 text-sm font-semibold text-slate-700">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Mã phiên:</span>
                      <span className="font-mono text-slate-900 font-bold">#{activeRentalForSelectedLocker.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Khách hàng:</span>
                      <span className="font-mono text-slate-950 font-bold">{activeRentalForSelectedLocker.phone || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Thời gian thuê còn lại:</span>
                      <span className={`font-bold ${activeRentalForSelectedLocker.is_overtime ? 'text-rose-600' : 'text-slate-800'}`}>
                        {activeRentalForSelectedLocker.time_left}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200">
                      <span className="text-slate-400">Phí gốc:</span>
                      <span className="font-mono font-bold text-slate-800">{money(activeRentalForSelectedLocker.base_price || activeRentalForSelectedLocker.price)}</span>
                    </div>
                    {activeRentalForSelectedLocker.overtime_fee > 0 && (
                      <div className="flex justify-between text-orange-600">
                        <span>Phí quá giờ:</span>
                        <span className="font-mono font-bold">{money(activeRentalForSelectedLocker.overtime_fee)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1.5 font-bold text-brand-700 text-base border-t border-dashed border-slate-200">
                      <span>Cần thu / Tổng:</span>
                      <span className="font-mono font-extrabold">{money(activeRentalForSelectedLocker.total_due || activeRentalForSelectedLocker.price)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* IoT Actions Section */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="text-xs font-extrabold uppercase text-slate-400">Điều khiển phần cứng (IoT)</div>
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 gap-2">
                    <button 
                      onClick={() => openAction('open')} 
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-3 text-sm font-extrabold text-brand-700 hover:bg-brand-100 transition duration-150"
                    >
                      <DoorOpen className="h-6 w-6" />
                      Mở khóa khẩn
                    </button>
                    {/* <button 
                      onClick={() => openAction('close')} 
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50 transition duration-150"
                    >
                      <DoorClosed className="h-4 w-4" />
                      Khôi phục đóng
                    </button> */}
                  </div>
                  
                  <button 
                    onClick={() => openAction('force')} 
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-extrabold text-rose-700 hover:bg-rose-100 transition duration-150"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Giải phóng cưỡng chế
                  </button>
                  
                  <button
                    onClick={() => openAction('remove')}
                    disabled={!selectedLockerCanRemove}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition duration-150"
                  >
                    <MinusCircle className="h-4 w-4" />
                    Bớt tủ khỏi sơ đồ
                  </button>
                  
                  {!selectedLockerCanRemove && (
                    <p className="text-xs font-semibold text-slate-400 text-center leading-relaxed">
                      Chỉ có thể bớt tủ khi tủ đang trống (AVAILABLE) và không có phiên thuê hoạt động.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Close footer button */}
            <div className="pt-4 border-t border-slate-100">
              <button 
                onClick={() => setSelectedLocker(null)} 
                className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-extrabold text-slate-500 hover:bg-slate-50 transition duration-150"
              >
                Đóng thông tin
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 text-brand-600 animate-spin" />
          </div>
        )}
      </div>

      <ConfirmModal
        action={pendingAction}
        loading={loading}
        onCancel={() => setPendingAction(null)}
        onConfirm={runAction}
      />
    </div>
  );
}
