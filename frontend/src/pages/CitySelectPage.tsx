import { useState } from 'react'
import { ChevronRight, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useApp } from '../context/AppContext'
import { getLocalizedCityName } from '../lib/localized'
import styles from './CitySelectPage.module.css'
import type { Language } from '../types'

export default function CitySelectPage() {
  const { t, i18n } = useTranslation()
  const { loading, cities, citiesLoading, reloadCities, selectCity, user } = useApp()
  const navigate = useNavigate()
  const [selecting, setSelecting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const language = i18n.language as Language

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} aria-hidden="true" />
      </div>
    )
  }

  if (user?.selectedCityId) {
    return <Navigate to="/shop" replace />
  }

  async function handleReloadCities() {
    try {
      setError(null)
      await reloadCities()
    } catch (loadError) {
      setError(loadError instanceof ApiError && loadError.code ? t(`errors.${loadError.code}`) : t('errors.request_failed'))
    }
  }

  async function handleSelect(cityId: number) {
    setSelecting(cityId)
    try {
      await selectCity(cityId)
      navigate('/shop', { replace: true })
    } finally {
      setSelecting(null)
    }
  }

  function handleLater() {
    navigate('/shop', { replace: true })
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.icon}>
          <MapPin size={28} strokeWidth={1.5} />
        </div>
        <h1 className={styles.title}>{t('city.title')}</h1>
        <p className={styles.subtitle}>{t('city.subtitle')}</p>
        <button className={styles.retryBtn} onClick={handleLater} type="button">
          {t('common.later')}
        </button>
      </div>

      {citiesLoading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} aria-hidden="true" />
        </div>
      ) : error ? (
        <div className={styles.stateCard}>
          <p>{error}</p>
          <button className={styles.retryBtn} onClick={handleLater} type="button">
            {t('common.later')}
          </button>
          <button className={styles.retryBtn} onClick={() => void handleReloadCities()} type="button">
            {t('city.reload', { defaultValue: 'Обновить список' })}
          </button>
        </div>
      ) : cities.length === 0 ? (
        <div className={styles.stateCard}>
          <p>{t('city.empty')}</p>
          <button className={styles.retryBtn} onClick={handleLater} type="button">
            {t('common.later')}
          </button>
          <button className={styles.retryBtn} onClick={() => void handleReloadCities()} type="button">
            {t('city.reload', { defaultValue: 'Обновить список' })}
          </button>
        </div>
      ) : (
        <div className={styles.list}>
          {cities.map((city) => (
            <button
              key={city.id}
              className={`${styles.cityBtn} ${selecting === city.id ? styles.selected : ''}`}
              onClick={() => void handleSelect(city.id)}
              disabled={selecting !== null}
              type="button"
            >
              <span className={styles.cityName}>{getLocalizedCityName(city, language)}</span>
              <ChevronRight className={styles.arrow} size={18} strokeWidth={1.5} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
