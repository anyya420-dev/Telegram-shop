import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n'
import { getLocalizedCityName } from '../lib/localized'
import type { Language } from '../types'

const languageOptions: Language[] = ['ru', 'en']

export function ProfilePage() {
  const { user, telegramEnvironment, openCityPicker, updateLanguagePreference } = useApp()
  const { language, t } = useI18n()
  const [savingLanguage, setSavingLanguage] = useState<Language | null>(null)

  if (!user) {
    return null
  }

  return (
    <div className="page-stack">
      <section className="panel-card profile-card">
        <span className="eyebrow">{t('profile.badge')}</span>
        <h1>{user.firstName}</h1>
        <dl className="profile-grid">
          <div>
            <dt>{t('profile.firstName')}</dt>
            <dd>{user.firstName}</dd>
          </div>
          <div>
            <dt>{t('profile.telegramUsername')}</dt>
            <dd>{user.username ? `@${user.username}` : t('common.notSpecified')}</dd>
          </div>
          <div>
            <dt>{t('profile.selectedCity')}</dt>
            <dd>{user.selectedCity ? getLocalizedCityName(user.selectedCity, language) : t('common.notSelected')}</dd>
          </div>
          <div>
            <dt>{t('profile.mode')}</dt>
            <dd>{telegramEnvironment ? t('profile.telegramMode') : t('profile.demoMode')}</dd>
          </div>
        </dl>
        <button className="secondary-button" type="button" onClick={openCityPicker}>
          {t('cityPicker.changeCity')}
        </button>
        <p className="subtle-text">{t('cityPicker.cityChangeNotice')}</p>
      </section>

      <section className="panel-card">
        <span className="eyebrow">{t('profile.settingsBadge')}</span>
        <h2>{t('profile.settingsTitle')}</h2>
        <p className="subtle-text">{t('profile.settingsDescription')}</p>
        <div className="category-row">
          {languageOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`category-pill ${user.language === option ? 'category-pill--active' : ''}`}
              disabled={savingLanguage === option}
              onClick={async () => {
                setSavingLanguage(option)
                try {
                  await updateLanguagePreference(option)
                } finally {
                  setSavingLanguage(null)
                }
              }}
            >
              {t(`languages.${option}`)}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
