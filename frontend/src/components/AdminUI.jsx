import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  DoorClosed,
  DoorOpen,
  Loader2,
  LockKeyhole,
  LogOut,
  ShieldAlert,
  TrendingUp,
  Users,
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

function Badge({ status, label, hint }) {
  const meta = getLockerStatusMeta(status, { label, hint });
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-extrabold ${meta.className}`}>{meta.label}</span>;
}

function ConfirmModal({ action, loading, onCancel, onConfirm }) {
  if (!action) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
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
          <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-3 font-extrabold text-slate-700">
            Hủy
          </button>
          <button onClick={onConfirm} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 font-extrabold text-white disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {action.label}
          </button>
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
  const [rentals, setRentals] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedLocker, setSelectedLocker] = useState(null);
  const [message, setMessage] = useState({ type: 'info', text: '' });
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const selectedFreshLocker = useMemo(
    () => lockers.find((locker) => locker.id === selectedLocker?.id) || selectedLocker,
    [lockers, selectedLocker],
  );

  async function loadAll(activeToken = token) {
    if (!activeToken) return;
    try {
      const [lockerData, statData, rentalData, logData] = await Promise.all([
        api.getLockers(),
        api.adminStats(activeToken),
        api.adminRentals(activeToken),
        api.adminLogs(activeToken),
      ]);
      setLockers(lockerData);
      setStats(statData);
      setRentals(rentalData);
      setLogs(logData);
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
    const ws = makeWs();
    ws.onmessage = () => loadAll();
    ws.onerror = () => {};
    return () => ws.close();
  }, [token]);

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
    setSelectedLocker(null);
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
      setPendingAction(null);
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
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900 text-white">
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
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-base font-semibold outline-none focus:border-slate-900"
                placeholder="admin123"
              />
            </label>
            <button onClick={login} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 font-extrabold text-white disabled:opacity-60">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Đăng nhập
            </button>
            <Message type={message.type}>{message.text}</Message>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold">Quản trị MVP</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ['Theo dõi real-time', 'Tủ đổi trạng thái qua WebSocket khi backend nhận MQTT hoặc lệnh vận hành.'],
              ['Phiên thuê và doanh thu', 'Bảng lấy trực tiếp từ SQLite, không còn chart dữ liệu giả.'],
              ['Can thiệp IoT', 'Mở, đóng, giải phóng cưỡng chế có log đầy đủ.'],
              ['Audit log', 'Ghi nhận reserve, payment, OTP, mở tủ và thao tác admin.'],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <CheckCircle2 className="mb-3 h-5 w-5 text-emerald-600" />
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
    { label: 'Doanh thu', value: money(stats?.total_revenue), icon: TrendingUp, tone: 'text-emerald-700' },
    { label: 'Hôm nay', value: money(stats?.today_revenue), icon: BarChart3, tone: 'text-slate-800' },
    { label: 'Phiên hoạt động', value: stats?.active_sessions || 0, icon: Users, tone: 'text-slate-800' },
    { label: 'Tỷ lệ dùng tủ', value: `${stats?.utilization_rate || 0}%`, icon: Activity, tone: 'text-orange-700' },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Dashboard vận hành</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {stats?.available_lockers || 0}/{stats?.total_lockers || 0} ngăn trống, {stats?.overtime_sessions || 0} phiên quá hạn.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => loadAll()} className="rounded-lg border border-slate-300 px-4 py-3 font-extrabold text-slate-700">
              Làm mới
            </button>
            <button onClick={logout} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-3 font-extrabold text-slate-700">
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </div>
        <div className="mt-4">
          <Message type={message.type}>{message.text}</Message>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-extrabold uppercase text-slate-400">{label}</div>
                <div className={`mt-2 text-2xl font-extrabold ${tone}`}>{value}</div>
              </div>
              <div className="rounded-lg bg-slate-100 p-3 text-slate-500">
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold">Sơ đồ tủ</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {lockers.map((locker) => (
              <button
                key={locker.id}
                onClick={() => setSelectedLocker(locker)}
                className={`min-h-28 rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                  selectedFreshLocker?.id === locker.id ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-lg font-extrabold">{locker.name}</div>
                  <LockKeyhole className="h-5 w-5 text-slate-400" />
                </div>
                <div className="mt-4"><Badge status={locker.reservation_stage || locker.status} label={locker.status_label} hint={locker.status_hint} /></div>
                <div className="mt-2 text-xs font-semibold text-slate-500">{getLockerStatusMeta(locker.reservation_stage || locker.status, { label: locker.status_label, hint: locker.status_hint }).hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold">Điều khiển IoT</h2>
          {selectedFreshLocker ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-extrabold uppercase text-slate-400">Đang chọn</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-xl font-extrabold">{selectedFreshLocker.name}</div>
                  <Badge status={selectedFreshLocker.reservation_stage || selectedFreshLocker.status} label={selectedFreshLocker.status_label} hint={selectedFreshLocker.status_hint} />
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-500">{getLockerStatusMeta(selectedFreshLocker.reservation_stage || selectedFreshLocker.status, { label: selectedFreshLocker.status_label, hint: selectedFreshLocker.status_hint }).hint}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => openAction('open')} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-extrabold text-emerald-700">
                  <DoorOpen className="h-4 w-4" />
                  Mở khóa
                </button>
                <button onClick={() => openAction('close')} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-3 text-sm font-extrabold text-slate-700">
                  <DoorClosed className="h-4 w-4" />
                  Đóng tủ
                </button>
              </div>
              <button onClick={() => openAction('force')} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-extrabold text-rose-700">
                <AlertTriangle className="h-4 w-4" />
                Giải phóng cưỡng chế
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
              Chọn một ngăn trong sơ đồ để vận hành.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold">Phiên thuê</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
                  <th className="py-3 pr-4 font-extrabold">ID</th>
                  <th className="py-3 pr-4 font-extrabold">Ngăn</th>
                  <th className="py-3 pr-4 font-extrabold">SĐT</th>
                  <th className="py-3 pr-4 font-extrabold">Thời gian</th>
                  <th className="py-3 pr-4 font-extrabold">Tiền</th>
                  <th className="py-3 pr-4 font-extrabold">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rentals.slice(0, 12).map((rental) => (
                  <tr key={rental.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 font-mono font-bold">#{rental.id}</td>
                    <td className="py-3 pr-4 font-bold">{rental.locker_name}</td>
                    <td className="py-3 pr-4 font-mono">{rental.phone || '-'}</td>
                    <td className={`py-3 pr-4 font-semibold ${rental.is_overtime ? 'text-orange-600' : 'text-slate-600'}`}>{rental.time_left}</td>
                    <td className="py-3 pr-4 font-mono font-bold text-emerald-700">{money(rental.price)}</td>
                    <td className="py-3 pr-4"><Badge status={rental.reservation_stage || rental.status} label={rental.status_label} hint={rental.status_hint} /></td>
                  </tr>
                ))}
                {rentals.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-8 text-center font-semibold text-slate-400">Chưa có phiên thuê.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold">Nhật ký</h2>
          <div className="mt-4 max-h-[460px] space-y-3 overflow-y-auto pr-1">
            {logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-400">{log.created_at}</span>
                  <span className="rounded bg-white px-2 py-1 text-xs font-extrabold text-slate-500">{log.actor}</span>
                </div>
                <div className="mt-2 text-sm font-extrabold text-slate-800">{log.action}</div>
                <p className="mt-1 text-sm font-medium text-slate-500">{log.detail}</p>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-400">
                Chưa có log.
              </div>
            )}
          </div>
        </div>
      </section>

      <ConfirmModal
        action={pendingAction}
        loading={loading}
        onCancel={() => setPendingAction(null)}
        onConfirm={runAction}
      />
    </div>
  );
}
