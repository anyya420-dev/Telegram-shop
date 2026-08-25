import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { getLocalizedCityName } from '../lib/localized'
import type { Language } from '../types'

export function CityPicker() {
  const { cities, cityPickerOpen, closeCityPicker, selectCity, user } = useApp()
  const [pendingCityId, setPendingCityId] = useState<number | null>(null)
  const { t, i18n } = useTranslation()
  const language = i18n.language as Language

  if (!cityPickerOpen) {
    return null
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-card__header">
          <div>
            <span className="eyebrow">{t('cityPicker.badge')}</span>
            <h2><MapPin size={18} strokeWidth={1.5} style={{ verticalAlign: 'middle', marginRight: 6 }} />{t('cityPicker.title')}</h2>
          </div>
          {user?.selectedCityId ? (
            <button className="ghost-button" type="button" onClick={closeCityPicker}>
              {t('common.later')}
            </button>
          ) : null}
        </div>
        <div className="city-list city-list--stacked">
          {cities.map((city) => (
            <button
              key={city.id}
              type="button"
              className="city-button"
              disabled={pendingCityId === city.id}
              onClick={async () => {
                setPendingCityId(city.id)
                try {
                  await selectCity(city.id)
                } finally {
                  setPendingCityId(null)
                }
              }}
            >
              <span>{getLocalizedCityName(city, language)}</span>
              <span>→</span>
            </button>
          ))}
        </div>
        <p className="subtle-text">{t('cityPicker.helper')}</p>
      </div>
    </div>
  )
}
