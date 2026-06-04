import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Wallet, ShoppingBag, CalendarDays, CreditCard, TrendingUp, MoreHorizontal, Settings as SettingsIcon, Package } from 'lucide-react'
import NotificationBanner from './components/NotificationBanner'
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

  const tabs = [
    { to: '/' as string | null, icon: LayoutDashboard, label: 'Home', exact: true, more: false },
    { to: '/personal' as string | null, icon: Wallet, label: 'Personal', exact: false, more: false },
    { to: null as string | null, icon: MoreHorizontal, label: 'More', exact: false, more: true },
    { to: '/business' as string | null, icon: ShoppingBag, label: 'Business', exact: false, more: false },
    { to: '/calendar' as string | null, icon: CalendarDays, label: 'Orders', exact: false, more: false },
  ]

  const moreRouteActive = moreTabs.some(t => t.to === location.pathname)

  const activeIdx = (() => {
    if (moreOpen || moreRouteActive) return 2
    const i = tabs.findIndex(t => !t.more && t.to && (t.exact ? location.pathname === t.to : location.pathname.startsWith(t.to)))
    return i < 0 ? 0 : i
  })()

  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  return (
    <>
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
      )}

      {moreOpen && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(108px + env(safe-area-inset-bottom))',
          left: 12, right: 12,
          zIndex: 51,
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
          overflow: 'hidden',
        }}>
          {moreTabs.map(({ to, icon: Icon, label }, idx) => (
            <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 20px',
                  color: isActive ? '#C9848A' : '#374151',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 15,
                  borderBottom: idx < moreTabs.length - 1 ? '1px solid #f5f0eb' : 'none',
                }}>
                  <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                  {label}
                </div>
              )}
            </NavLink>
          ))}
        </div>
      )}

      {/* Outer wrapper — extra paddingTop makes room for the elevated circle */}
      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        zIndex: 50,
        paddingTop: 28,
        paddingLeft: 12,
        paddingRight: 12,
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
        background: '#F9F3EE',
      }}>
        {/* Floating pill bar */}
        <div style={{
          background: '#fff',
          borderRadius: 24,
          height: 64,
          display: 'flex',
          alignItems: 'stretch',
          position: 'relative',
          overflow: 'visible',
          boxShadow: '0 4px 28px rgba(0,0,0,0.11)',
        }}>
          {tabs.map((tab, i) => {
            const isActive = i === activeIdx
            const Icon = tab.icon

            const tabStyle = {
              flex: 1,
              display: 'flex',
              flexDirection: 'column' as const,
              alignItems: 'center' as const,
              ...(isActive
                ? { justifyContent: 'flex-end' as const, paddingBottom: 10 }
                : { justifyContent: 'center' as const, gap: 4 }
              ),
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              position: 'relative' as const,
              overflow: 'visible' as const,
              textDecoration: 'none',
              zIndex: 1,
            }

            const iconNode = isActive ? (
              <div style={{
                position: 'absolute',
                top: -24,
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 4px 14px rgba(0,0,0,0.13)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Icon size={22} color="#C9848A" strokeWidth={2.2} />
              </div>
            ) : (
              <Icon size={20} color="#b8b0b0" strokeWidth={1.8} />
            )

            const labelNode = (
              <span style={{
                fontSize: 10,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#2D2D2D' : '#b8b0b0',
                letterSpacing: '0.02em',
                lineHeight: 1,
                fontFamily: "'Poppins', sans-serif",
              }}>
                {tab.label}
              </span>
            )

            if (tab.more) {
              return (
                <button key={i} onClick={() => setMoreOpen(o => !o)} style={tabStyle}>
                  {iconNode}
                  {labelNode}
                </button>
              )
            }
            return (
              <NavLink key={tab.to} to={tab.to!} end={tab.exact} style={tabStyle}>
                {iconNode}
                {labelNode}
              </NavLink>
            )
          })}
        </div>
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
        <NotificationBanner />
        {isDesktop && <SideNav />}
        <main style={{
          flex: 1,
          marginLeft: isDesktop ? sidebarWidth : 0,
          paddingBottom: isDesktop ? '24px' : 'calc(112px + env(safe-area-inset-bottom))',
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
