import { NavLink } from 'react-router-dom'

const items = [
  { to: '/', label: 'Магазин', icon: '🛍' },
  { to: '/casino', label: 'Казино', icon: '🎰' },
  { to: '/balance', label: 'Баланс', icon: '💰' },
  { to: '/profile', label: 'Профиль', icon: '👤' },
  { to: '/support', label: 'Поддержка', icon: '🎧' },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
