import { useEffect, useRef, useState } from 'react'
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
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>(() => (
    cities.length > 0 ? 'success' : 'idle'
  ))
  const hasInitialLoadAttempt = useRef(false)
  const language = i18n.language as Language

  useEffect(() => {
    if (user?.selectedCityId) {
      navigate('/shop', { replace: true })
    }
  }, [navigate, user])

  useEffect(() => {
    if (cities.length > 0) {
      setLoadState('success')
    }
  }, [cities.length])

  useEffect(() => {
    if (hasInitialLoadAttempt.current || cities.length > 0 || citiesLoading) {
      return
    }
    hasInitialLoadAttempt.current = true
    void handleReloadCities()
  }, [cities.length, citiesLoading])

  async function handleReloadCities() {
    if (citiesLoading) {
      return
    }

    try {
      setLoadState('loading')
      setError(null)
      const response = await reloadCities()
      setLoadState(response.length > 0 ? 'success' : 'empty')
    } catch (loadError) {
      setLoadState('error')
      setError(loadError instanceof ApiError && loadError.code ? t(`errors.${loadError.code}`) : t('errors.request_failed'))
    }
  }

  async function handleSelect(cityId: number) {
    setSelecting(cityId)
    try {
      setError(null)
      await selectCity(cityId)
      navigate('/shop', { replace: true })
    } catch (selectError) {
      setError(selectError instanceof ApiError && selectError.code ? t(`errors.${selectError.code}`) : t('errors.request_failed'))
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

      {citiesLoading || loadState === 'loading' ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} aria-hidden="true" />
        </div>
      ) : loadState === 'error' && error ? (
        <div className={styles.stateCard}>
          <p>{error}</p>
          <button className={styles.retryBtn} onClick={() => void handleReloadCities()} type="button">
            {t('common.retry')}
          </button>
        </div>
      ) : loadState === 'empty' || cities.length === 0 ? (
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
