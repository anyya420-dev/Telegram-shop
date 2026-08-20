import { NavLink } from 'react-router-dom'
import { useI18n } from '../i18n'

const itemDefinitions = [
  { to: '/', labelKey: 'nav.shop', icon: '🛍' },
  { to: '/casino', labelKey: 'nav.casino', icon: '🎰' },
  { to: '/balance', labelKey: 'nav.balance', icon: '💰' },
  { to: '/profile', labelKey: 'nav.profile', icon: '👤' },
  { to: '/support', labelKey: 'nav.support', icon: '🎧' },
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
          <span>{item.icon}</span>
          <span>{t(item.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  )
}
