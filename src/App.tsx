import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, Wallet, ShoppingBag, CalendarDays, CreditCard, TrendingUp } from 'lucide-react'
import NotificationBanner from './components/NotificationBanner'
import OfflineBanner from './components/OfflineBanner'
import InstallBanner from './components/InstallBanner'
import { checkAndFireReminders } from './lib/notifications'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import PersonalExpenses from './pages/PersonalExpenses'
import BusinessExpenses from './pages/BusinessExpenses'
import OrdersCalendar from './pages/OrdersCalendar'
import CustomerPayments from './pages/CustomerPayments'
import RevenueSummary from './pages/RevenueSummary'

const tabs = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/personal', icon: Wallet, label: 'Personal' },
  { to: '/business', icon: ShoppingBag, label: 'Business' },
  { to: '/calendar', icon: CalendarDays, label: 'Orders' },
  { to: '/payments', icon: CreditCard, label: 'Payments' },
  { to: '/revenue', icon: TrendingUp, label: 'Revenue' },
]

export default function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('af-authed'))

  useEffect(() => {
    if (authed) checkAndFireReminders()
  }, [authed])

  if (!authed) {
    return <Auth onAuth={() => setAuthed(true)} />
  }

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100svh' }}>
        <InstallBanner />
        <OfflineBanner />
        <NotificationBanner />
        <main style={{ flex: 1, paddingBottom: 'calc(72px + env(safe-area-inset-bottom) + 8px)', overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/personal" element={<PersonalExpenses />} />
            <Route path="/business" element={<BusinessExpenses />} />
            <Route path="/calendar" element={<OrdersCalendar />} />
            <Route path="/payments" element={<CustomerPayments />} />
            <Route path="/revenue" element={<RevenueSummary />} />
          </Routes>
        </main>

        <nav style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 'calc(72px + env(safe-area-inset-bottom))',
          background: '#fff',
          borderTop: '1px solid #e5e0db',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
          zIndex: 50,
        }}>
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'} style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <span style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '3px',
                  color: isActive ? '#C9848A' : '#9ca3af',
                  fontSize: '10px',
                  fontWeight: isActive ? 600 : 400,
                  minWidth: '48px',
                }}>
                  <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </BrowserRouter>
  )
}
