import { useApp } from '../context/AppContext'

export function ProfilePage() {
  const { user, telegramEnvironment, openCityPicker } = useApp()

  if (!user) {
    return null
  }

  return (
    <div className="page-stack">
      <section className="panel-card profile-card">
        <span className="eyebrow">Профиль</span>
        <h1>{user.firstName}</h1>
        <dl className="profile-grid">
          <div>
            <dt>Имя</dt>
            <dd>{user.firstName}</dd>
          </div>
          <div>
            <dt>Telegram username</dt>
            <dd>{user.username ? `@${user.username}` : 'Не указан'}</dd>
          </div>
          <div>
            <dt>Выбранный город</dt>
            <dd>{user.selectedCity?.name ?? 'Не выбран'}</dd>
          </div>
          <div>
            <dt>Режим</dt>
            <dd>{telegramEnvironment ? 'Telegram Web App' : 'Локальная демо-сессия'}</dd>
          </div>
        </dl>
        <button className="secondary-button" type="button" onClick={openCityPicker}>
          Изменить город
        </button>
        <p className="subtle-text">При смене города корзина очищается, чтобы не смешивать товары из разных локаций.</p>
      </section>
    </div>
  )
}
