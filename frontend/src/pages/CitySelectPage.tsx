import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getLocalizedCityName } from '../lib/localized';
import styles from './CitySelectPage.module.css';
import { useTranslation } from 'react-i18next';
import i18n from '../lib/i18n';

export default function CitySelectPage() {
  const { cities, loading, selectCity, user } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [selecting, setSelecting] = useState<number | null>(null);

  useEffect(() => {
    if (user?.selectedCityId) {
      navigate('/shop', { replace: true });
    }
  }, [navigate, user]);

  async function handleSelect(cityId: number) {
    setSelecting(cityId);
    try {
      await selectCity(cityId);
      navigate('/shop', { replace: true });
    } finally {
      setSelecting(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.icon}>📍</div>
        <h1 className={styles.title}>{t('city.title')}</h1>
        <p className={styles.subtitle}>{t('city.subtitle')}</p>
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
              <span className={styles.cityName}>{getLocalizedCityName(city, i18n.language as 'ru' | 'en')}</span>
              <span className={styles.arrow}>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
