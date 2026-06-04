import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

const NAV_H = 68
const CR = 28       // FAB circle radius
const NR = CR + 10  // notch arc radius — wider than FAB so cream shows in the gap
const NAV_MARGIN = 10
const NAV_PILL_R = 20

function buildBar(cx: number, bw: number): string {
  const iL = NAV_MARGIN + NAV_PILL_R
  const iR = bw - NAV_MARGIN - NAV_PILL_R
  const bL = NAV_MARGIN
  const bR = bw - NAV_MARGIN
  const ncx = Math.max(iL + NR, Math.min(iR - NR, cx))
  return [
    `M ${iL} 0`,
    `L ${ncx - NR} 0`,
    `A ${NR} ${NR} 0 0 0 ${ncx + NR} 0`,
    `L ${iR} 0`,
    `Q ${bR} 0 ${bR} ${NAV_PILL_R}`,
    `L ${bR} ${NAV_H - NAV_PILL_R}`,
    `Q ${bR} ${NAV_H} ${iR} ${NAV_H}`,
    `L ${iL} ${NAV_H}`,
    `Q ${bL} ${NAV_H} ${bL} ${NAV_H - NAV_PILL_R}`,
    `L ${bL} ${NAV_PILL_R}`,
    `Q ${bL} 0 ${iL} 0`,
    `Z`,
  ].join(' ')
}

function BottomNav() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [barW, setBarW] = useState(window.innerWidth)

  const animCx = useRef<number | null>(null)
  const targetCxRef = useRef(0)
  const rafRef = useRef(0)
  const pathRef = useRef<SVGPathElement>(null)
  const fabRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = () => setBarW(window.innerWidth)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  const tabs = [
    { to: '/' as string | null, icon: LayoutDashboard, exact: true, more: false },
    { to: '/personal' as string | null, icon: Wallet, exact: false, more: false },
    { to: null as string | null, icon: MoreHorizontal, exact: false, more: true },
    { to: '/business' as string | null, icon: ShoppingBag, exact: false, more: false },
    { to: '/calendar' as string | null, icon: CalendarDays, exact: false, more: false },
  ]

  const moreRouteActive = moreTabs.some(t => t.to === location.pathname)

  const activeIdx = (() => {
    if (moreOpen || moreRouteActive) return 2
    const i = tabs.findIndex(t => !t.more && t.to && (t.exact ? location.pathname === t.to : location.pathname.startsWith(t.to)))
    return i < 0 ? 0 : i
  })()

  const innerLeft = NAV_MARGIN + NAV_PILL_R
  const innerW = barW - 2 * (NAV_MARGIN + NAV_PILL_R)
  const slotW = innerW / 5
  const newCx = innerLeft + (activeIdx + 0.5) * slotW

  // Sync DOM with current animated position before every paint — prevents React
  // reconciliation from overwriting the ref-controlled attributes mid-animation.
  useLayoutEffect(() => {
    const cx = animCx.current ?? newCx
    if (animCx.current === null) animCx.current = newCx
    pathRef.current?.setAttribute('d', buildBar(cx, barW))
    if (fabRef.current) fabRef.current.style.left = `${cx - CR}px`
  })

  // RAF lerp toward new target whenever active tab or bar width changes
  useEffect(() => {
    if (animCx.current === null) return
    targetCxRef.current = newCx
    cancelAnimationFrame(rafRef.current)
    const bw = barW
    const step = () => {
      const diff = targetCxRef.current - animCx.current!
      if (Math.abs(diff) < 0.4) {
        animCx.current = targetCxRef.current
        pathRef.current?.setAttribute('d', buildBar(animCx.current, bw))
        if (fabRef.current) fabRef.current.style.left = `${animCx.current - CR}px`
        return
      }
      animCx.current = animCx.current! + diff * 0.15
      pathRef.current?.setAttribute('d', buildBar(animCx.current, bw))
      if (fabRef.current) fabRef.current.style.left = `${animCx.current - CR}px`
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [newCx, barW])

  const ActiveIcon = tabs[activeIdx].icon

  return (
    <>
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
      )}

      {moreOpen && (
        <div style={{
          position: 'fixed',
          bottom: `calc(${NAV_H}px + env(safe-area-inset-bottom))`,
          left: 0, right: 0, zIndex: 51,
          background: '#fff',
          borderTop: '1px solid #e5e0db',
          borderRadius: '16px 16px 0 0',
          paddingBottom: 4,
        }}>
          {moreTabs.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 24px',
                  color: isActive ? '#C9848A' : '#374151',
                  fontWeight: isActive ? 600 : 400, fontSize: 15,
                }}>
                  <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                  {label}
                </div>
              )}
            </NavLink>
          ))}
        </div>
      )}

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, height: `calc(${NAV_H}px + env(safe-area-inset-bottom))`, background: '#F9F3EE' }}>
        <svg width={barW} height={NAV_H} viewBox={`0 0 ${barW} ${NAV_H}`}
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', filter: 'drop-shadow(0 -4px 20px rgba(0,0,0,0.12))' }}>
          <path ref={pathRef} fill="white" />
        </svg>

        {/* FAB — position driven entirely by refs */}
        <div
          ref={fabRef}
          onClick={tabs[activeIdx].more ? () => setMoreOpen(o => !o) : undefined}
          style={{
            position: 'absolute', top: -CR, left: 0,
            width: CR * 2, height: CR * 2,
            background: '#C9848A', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(201,132,138,0.4)',
            zIndex: 2, cursor: 'pointer',
          }}
        >
          <ActiveIcon
            key={activeIdx}
            size={21}
            color="white"
            strokeWidth={2.2}
            style={{
              animation: 'iconPop 0.32s cubic-bezier(0.34,1.56,0.64,1) both',
              ...(tabs[activeIdx].more
                ? { transform: moreOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.22s ease' }
                : {}),
            }}
          />
        </div>

        {tabs.map((tab, i) => {
          const isActive = i === activeIdx
          if (tab.more) {
            return (
              <button key={i} onClick={() => setMoreOpen(o => !o)}
                style={{
                  position: 'absolute', top: 0, left: innerLeft + i * slotW, width: slotW, height: NAV_H,
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 8,
                  zIndex: 1, opacity: isActive ? 0 : 1, pointerEvents: isActive ? 'none' : 'auto',
                  transition: 'opacity 0.25s ease',
                }}>
                <tab.icon size={22} color="#c4b5b5" strokeWidth={1.8} />
              </button>
            )
          }
          return (
            <NavLink key={tab.to} to={tab.to!} end={tab.exact}
              style={{
                position: 'absolute', top: 0, left: innerLeft + i * slotW, width: slotW, height: NAV_H,
                textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 8,
                zIndex: 1, opacity: isActive ? 0 : 1, pointerEvents: isActive ? 'none' : 'auto',
                transition: 'opacity 0.25s ease',
              }}
            >
              <tab.icon size={22} color="#c4b5b5" strokeWidth={1.8} />
            </NavLink>
          )
        })}
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
