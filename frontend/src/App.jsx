import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, LockKeyhole, Luggage, Smartphone } from 'lucide-react';
import AdminUI from './components/AdminUI';
import ClientUI from './components/ClientUI';
import KioskUI from './components/KioskUI';
import './App.css';

function Shell() {
  const links = [
    { to: '/kiosk', label: 'Kiosk', icon: LockKeyhole },
    { to: '/customer', label: 'Khách hàng', icon: Smartphone },
    { to: '/admin', label: 'Admin', icon: LayoutDashboard },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Luggage className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-wide">BAGGO</div>
              <div className="text-xs font-medium text-slate-500">Smart locker MVP</div>
            </div>
          </div>
          <nav className="flex flex-wrap gap-2">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition ${
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/kiosk" replace />} />
          <Route path="/kiosk" element={<KioskUI />} />
          <Route path="/customer" element={<ClientUI />} />
          <Route path="/admin" element={<AdminUI />} />
          <Route path="*" element={<Navigate to="/kiosk" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default Shell;
