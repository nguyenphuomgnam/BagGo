import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, LockKeyhole, Smartphone } from 'lucide-react';
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
    <div className="min-h-screen text-slate-950">
      <header className="sticky top-0 z-40 border-b border-brand-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center">
            <img src="/brand/bago-logo.svg" alt="BAGO Smart Locker" className="h-12 w-auto max-w-[210px] object-contain" />
          </div>
          <nav className="flex flex-wrap gap-2">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition ${
                    isActive
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-brand-100 bg-white text-slate-700 hover:border-brand-300 hover:text-brand-700'
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
          <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
          <Route path="/admin/:activeTab" element={<AdminUI />} />
          <Route path="*" element={<Navigate to="/kiosk" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default Shell;
