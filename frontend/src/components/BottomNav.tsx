import { NavLink } from 'react-router-dom'
import { ShoppingBag, Dices, Wallet, User, Headphones } from 'lucide-react'
import { useI18n } from '../i18n'

const itemDefinitions = [
  { to: '/', labelKey: 'nav.shop', Icon: ShoppingBag },
  { to: '/casino', labelKey: 'nav.casino', Icon: Dices },
  { to: '/balance', labelKey: 'nav.balance', Icon: Wallet },
  { to: '/profile', labelKey: 'nav.profile', Icon: User },
  { to: '/support', labelKey: 'nav.support', Icon: Headphones },
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
          <item.Icon size={20} strokeWidth={1.5} />
          <span>{t(item.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  )
}
