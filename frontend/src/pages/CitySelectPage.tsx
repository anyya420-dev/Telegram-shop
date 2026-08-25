import { useEffect, useState } from 'react'
import { ChevronRight, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useApp } from '../context/AppContext'
import { getLocalizedCityName } from '../lib/localized'
import styles from './CitySelectPage.module.css'
import type { Language } from '../types'

export default function CitySelectPage() {
  const { t, i18n } = useTranslation()
  const { cities, citiesLoading, reloadCities, selectCity, user } = useApp()
  const navigate = useNavigate()
  const [selecting, setSelecting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const language = i18n.language as Language

  useEffect(() => {
    if (user?.selectedCityId) {
      navigate('/shop', { replace: true })
    }
  }, [navigate, user])

  useEffect(() => {
    if (cities.length > 0 || citiesLoading) {
      return
    }

    void handleReloadCities()
  }, [cities.length, citiesLoading])

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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.icon}>
          <MapPin size={28} strokeWidth={1.5} />
        </div>
        <h1 className={styles.title}>{t('city.title')}</h1>
        <p className={styles.subtitle}>{t('city.subtitle')}</p>
      </div>

      {citiesLoading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} aria-hidden="true" />
        </div>
      ) : error ? (
        <div className={styles.stateCard}>
          <p>{error}</p>
          <button className={styles.retryBtn} onClick={() => void handleReloadCities()} type="button">
            {t('common.retry')}
          </button>
        </div>
      ) : cities.length === 0 ? (
        <div className={styles.stateCard}>
          <p>{t('city.empty')}</p>
          <button className={styles.retryBtn} onClick={() => void handleReloadCities()} type="button">
            {t('common.retry')}
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
