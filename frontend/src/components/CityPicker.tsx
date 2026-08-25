import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ChevronRight, MapPin, RefreshCw } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { getLocalizedCityName } from '../lib/localized'
import type { Language } from '../types'
import { ApiError } from '../api/client'

export function CityPicker() {
  const { cities, citiesLoading, cityPickerOpen, closeCityPicker, selectCity, reloadCities, user } = useApp()
  const [pendingCityId, setPendingCityId] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { t, i18n } = useTranslation()
  const language = i18n.language as Language

  if (!cityPickerOpen) {
    return null
  }

  async function handleReloadCities() {
    try {
      setLoadError(null)
      await reloadCities()
    } catch (error) {
      setLoadError(error instanceof ApiError && error.code ? t(`errors.${error.code}`) : t('errors.request_failed'))
    }
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
        {loadError ? (
          <div className="empty-state" style={{ padding: 16 }}>
            <p className="subtle-text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} strokeWidth={1.5} />
              {loadError}
            </p>
            <button className="ghost-button" type="button" onClick={() => void handleReloadCities()} style={{ marginTop: 12 }}>
              <RefreshCw size={16} strokeWidth={1.5} />
              {t('common.retry')}
            </button>
          </div>
        ) : citiesLoading ? (
          <p className="subtle-text">{t('common.loading')}</p>
        ) : cities.length === 0 ? (
          <div className="empty-state" style={{ padding: 16 }}>
            <p className="subtle-text">{t('city.empty')}</p>
            <button className="ghost-button" type="button" onClick={() => void handleReloadCities()} style={{ marginTop: 12 }}>
              <RefreshCw size={16} strokeWidth={1.5} />
              {t('common.retry')}
            </button>
          </div>
        ) : (
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
                    setLoadError(null)
                  } finally {
                    setPendingCityId(null)
                  }
                }}
              >
                <span>{getLocalizedCityName(city, language)}</span>
                <ChevronRight size={16} strokeWidth={1.5} />
              </button>
            ))}
          </div>
        )}
        <p className="subtle-text">{t('cityPicker.helper')}</p>
      </div>
    </div>
  )
}
