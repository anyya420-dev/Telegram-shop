import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n'
import { getLocalizedCityName } from '../lib/localized'
import styles from './CitySelectPage.module.css'

export default function CitySelectPage() {
  const { cities, loading, selectCity, user } = useApp()
  const { language, t } = useI18n()
  const navigate = useNavigate()
  const [selecting, setSelecting] = useState<number | null>(null)

  useEffect(() => {
    if (user?.selectedCityId) {
      navigate('/shop', { replace: true })
    }
  }, [navigate, user])

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
        <div className={styles.icon}>📍</div>
        <h1 className={styles.title}>{t('cityPicker.title')}</h1>
        <p className={styles.subtitle}>{t('cityPicker.helper')}</p>
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} aria-hidden="true" />
        </div>
      ) : (
        <div className={styles.list}>
          {cities.map((city) => (
            <button
              key={city.id}
              className={`${styles.cityBtn} ${selecting === city.id ? styles.selected : ''}`}
              onClick={() => handleSelect(city.id)}
              disabled={selecting !== null}
              type="button"
            >
              <span className={styles.cityName}>{getLocalizedCityName(city, language)}</span>
              <span className={styles.arrow}>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
