import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Wallet, ShoppingBag, CalendarDays, CreditCard, TrendingUp, MoreHorizontal, Settings as SettingsIcon, Package } from 'lucide-react'
import NotificationBanner from './components/NotificationBanner'
import OfflineBanner from './components/OfflineBanner'
import InstallBanner from './components/InstallBanner'
import { checkAndFireReminders } from './lib/notifications'
import { restoreFromSupabase } from './lib/sync'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import PersonalExpenses from './pages/PersonalExpenses'
import BusinessExpenses from './pages/BusinessExpenses'
import OrdersCalendar from './pages/OrdersCalendar'
import CustomerPayments from './pages/CustomerPayments'
import RevenueSummary from './pages/RevenueSummary'
import Settings from './pages/Settings'
import Inventory from './pages/Inventory'

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = (e: MediaQueryListEvent) => setMatches(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return matches
}

const SIDEBAR_NARROW = 72
const SIDEBAR_WIDE = 245

const moreTabs = [
  { to: '/revenue', icon: TrendingUp, label: 'Revenue' },
  { to: '/payments', icon: CreditCard, label: 'Payments' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/settings', icon: SettingsIcon, label: 'Settings' },
]

function BottomNav() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const isMoreActive = moreTabs.some(t => t.to === location.pathname)

  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  const leftTabs = [
    { to: '/', icon: LayoutDashboard, label: 'Home' },
    { to: '/personal', icon: Wallet, label: 'Personal' },
  ]
  const rightTabs = [
    { to: '/business', icon: ShoppingBag, label: 'Business' },
    { to: '/calendar', icon: CalendarDays, label: 'Orders' },
  ]

  return (
    <>
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 49 }}
        />
      )}

      {moreOpen && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(68px + env(safe-area-inset-bottom))',
          right: 0,
          left: 0,
          background: '#fff',
          borderTop: '1px solid #e5e0db',
          borderRadius: '16px 16px 0 0',
          zIndex: 51,
          paddingBottom: '4px',
        }}>
          {moreTabs.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px 24px',
                  color: isActive ? '#C9848A' : '#374151',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: '15px',
                }}>
                  <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                  {label}
                </div>
              )}
            </NavLink>
          ))}
        </div>
      )}

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50 }}>
        <nav style={{
          position: 'relative',
          height: 'calc(68px + env(safe-area-inset-bottom))',
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
          overflow: 'visible',
        }}>
          {/* Floating center button */}
          <button
            onClick={() => setMoreOpen(o => !o)}
            style={{
              position: 'absolute',
              top: '-24px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '52px',
              height: '52px',
              background: '#C9848A',
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px #C9848A55',
              transition: 'box-shadow 0.2s ease',
            }}
          >
            <MoreHorizontal
              size={24}
              color="#fff"
              strokeWidth={2}
              style={{
                transform: moreOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.22s ease',
              }}
            />
          </button>

          {leftTabs.map(({ to, icon: Icon, label }) => (
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
                  minWidth: '60px',
                  transform: isActive ? 'translateY(-3px)' : 'translateY(0)',
                  transition: 'transform 0.22s ease, color 0.22s ease',
                }}>
                  <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                  {label}
                  <span style={{
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: isActive ? '#C9848A' : 'transparent',
                    transition: 'background 0.22s ease',
                    marginTop: '-1px',
                  }} />
                </span>
              )}
            </NavLink>
          ))}

          {/* Spacer for floating center button */}
          <span style={{ minWidth: '60px', flexShrink: 0 }} />

          {rightTabs.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <span style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '3px',
                  color: isActive ? '#C9848A' : '#9ca3af',
                  fontSize: '10px',
                  fontWeight: isActive ? 600 : 400,
                  minWidth: '60px',
                  transform: isActive ? 'translateY(-3px)' : 'translateY(0)',
                  transition: 'transform 0.22s ease, color 0.22s ease',
                }}>
                  <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                  {label}
                  <span style={{
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: isActive ? '#C9848A' : 'transparent',
                    transition: 'background 0.22s ease',
                    marginTop: '-1px',
                  }} />
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  )
}

function SideNav() {
  const isWide = useMediaQuery('(min-width: 1264px)')
  const w = isWide ? SIDEBAR_WIDE : SIDEBAR_NARROW

  const tabs = [
    { to: '/', icon: LayoutDashboard, label: 'Home' },
    { to: '/personal', icon: Wallet, label: 'Personal' },
    { to: '/business', icon: ShoppingBag, label: 'Business' },
    { to: '/calendar', icon: CalendarDays, label: 'Orders' },
    { to: '/revenue', icon: TrendingUp, label: 'Revenue' },
    { to: '/payments', icon: CreditCard, label: 'Payments' },
    { to: '/inventory', icon: Package, label: 'Inventory' },
  ]

  return (
    <nav style={{
      position: 'fixed',
      left: 0, top: 0, bottom: 0,
      width: w,
      background: '#fff',
      borderRight: '1px solid #e5e0db',
      display: 'flex',
      flexDirection: 'column',
      padding: '8px',
      zIndex: 100,
      overflowY: 'auto',
    }}>
      <div style={{
        padding: '16px 8px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isWide ? 'flex-start' : 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>🌸</span>
        {isWide && (
          <span style={{ fontWeight: 800, fontSize: 17, color: '#2D2D2D', letterSpacing: '-0.3px' }}>
            Amara Fleur
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} style={{ textDecoration: 'none' }}>
            {({ isActive }) => (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: isWide ? 'flex-start' : 'center',
                gap: isWide ? 16 : 0,
                padding: isWide ? '12px 16px' : '14px 0',
                background: isActive ? '#C9848A14' : 'transparent',
                color: isActive ? '#C9848A' : '#374151',
                fontWeight: isActive ? 700 : 400,
                fontSize: 15,
                borderRadius: 12,
                cursor: 'pointer',
                width: '100%',
              }}>
                <Icon size={24} strokeWidth={isActive ? 2.3 : 1.7} />
                {isWide && <span>{label}</span>}
              </div>
            )}
          </NavLink>
        ))}
      </div>

      <NavLink to="/settings" style={{ textDecoration: 'none', flexShrink: 0 }}>
        {({ isActive }) => (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isWide ? 'flex-start' : 'center',
            gap: isWide ? 16 : 0,
            padding: isWide ? '12px 16px' : '14px 0',
            background: isActive ? '#C9848A14' : 'transparent',
            color: isActive ? '#C9848A' : '#374151',
            fontWeight: isActive ? 700 : 400,
            fontSize: 15,
            borderRadius: 12,
            cursor: 'pointer',
            width: '100%',
            marginBottom: 8,
          }}>
            <SettingsIcon size={24} strokeWidth={isActive ? 2.3 : 1.7} />
            {isWide && <span>Settings</span>}
          </div>
        )}
      </NavLink>
    </nav>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('af-authed'))
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isWide = useMediaQuery('(min-width: 1264px)')
  const sidebarWidth = isWide ? SIDEBAR_WIDE : SIDEBAR_NARROW

  useEffect(() => {
    if (authed) {
      checkAndFireReminders()
      restoreFromSupabase().catch(console.warn)
    }
  }, [authed])

  if (!authed) {
    return <Auth onAuth={() => setAuthed(true)} />
  }

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100svh' }}>
        <InstallBanner />
        <OfflineBanner />
        <NotificationBanner />
        {isDesktop && <SideNav />}
        <main style={{
          flex: 1,
          marginLeft: isDesktop ? sidebarWidth : 0,
          paddingBottom: isDesktop ? '24px' : 'calc(68px + env(safe-area-inset-bottom) + 24px)',
          overflowY: 'auto',
        }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/personal" element={<PersonalExpenses />} />
            <Route path="/business" element={<BusinessExpenses />} />
            <Route path="/calendar" element={<OrdersCalendar />} />
            <Route path="/payments" element={<CustomerPayments />} />
            <Route path="/revenue" element={<RevenueSummary />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/inventory" element={<Inventory />} />
          </Routes>
        </main>
        {!isDesktop && <BottomNav />}
      </div>
    </BrowserRouter>
  )
}
