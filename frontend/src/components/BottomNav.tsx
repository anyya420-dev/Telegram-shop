import { NavLink } from 'react-router-dom'
import { useI18n } from '../i18n'

function Icon({ path, active }: { path: string; active: boolean }) {
  const color = active ? 'var(--accent)' : 'var(--text-muted)'
  if (path === '/') {
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" /><path d="M9 21V12h6v9" /></svg>
  }
  if (path === '/casino') {
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7"><rect x="4" y="4" width="16" height="16" rx="2" /><circle cx="9" cy="9" r="1" /><circle cx="15" cy="9" r="1" /><circle cx="9" cy="15" r="1" /><circle cx="15" cy="15" r="1" /></svg>
  }
  if (path === '/balance') {
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="16" cy="12" r="2" /></svg>
  }
  if (path === '/support') {
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7"><path d="M21 15a2 2 0 0 1-2 2h-1l-4 3v-3H8a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2z" /><path d="M3 9v8a2 2 0 0 0 2 2h1" /></svg>
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
}

const itemDefinitions = [
  { to: '/', labelKey: 'nav.shop' },
  { to: '/casino', labelKey: 'nav.casino' },
  { to: '/balance', labelKey: 'nav.balance' },
  { to: '/profile', labelKey: 'nav.profile' },
  { to: '/support', labelKey: 'nav.support' },
] as const

export function BottomNav() {
  const { t } = useI18n()

  return (
    <nav className="bottom-nav">
      {itemDefinitions.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`}
        >
          {({ isActive }) => (
            <>
              <Icon path={item.to} active={isActive} />
              <span>{t(item.labelKey)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
