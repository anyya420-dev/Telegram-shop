import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../context/AppContext'
import { getLocalizedCityName } from '../lib/localized'
import type { Language } from '../types'

export function CityPicker() {
  const { cities, cityPickerOpen, closeCityPicker, refreshCities, selectCity, user } = useApp()
  const [pendingCityId, setPendingCityId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { t, i18n } = useTranslation()
  const language = i18n.language as Language

  const loadCities = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      await refreshCities()
    } catch (cityError) {
      setError(cityError instanceof Error ? cityError.message : t('errors.request_failed'))
    } finally {
      setLoading(false)
    }
  }, [refreshCities, t])

  useEffect(() => {
    if (!cityPickerOpen) {
      return
    }

    void loadCities()
  }, [cityPickerOpen, loadCities])

  if (!cityPickerOpen) {
    return null
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-card__header">
          <div>
            <span className="eyebrow">{t('cityPicker.badge')}</span>
            <h2>{t('cityPicker.title')}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={closeCityPicker}>
            {user?.selectedCityId ? t('common.later') : t('common.close')}
          </button>
        </div>
        {loading ? (
          <p className="subtle-text">{t('common.loading')}</p>
        ) : error ? (
          <>
            <p className="subtle-text">{error}</p>
            <button className="ghost-button" type="button" onClick={() => void loadCities()}>
              {t('common.retry')}
            </button>
          </>
        ) : cities.length === 0 ? (
          <p className="subtle-text">{t('city.empty')}</p>
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
        )}
        <p className="subtle-text">{t('cityPicker.helper')}</p>
      </div>
    </div>
  )
}
