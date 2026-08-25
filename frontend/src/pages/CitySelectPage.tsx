import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getLocalizedCityName } from '../lib/localized';
import styles from './CitySelectPage.module.css';
import { useTranslation } from 'react-i18next';
import i18n from '../lib/i18n';
import { api } from '../api/client';
import type { City } from '../types';

export default function CitySelectPage() {
  const { cities, selectCity, user } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [selecting, setSelecting] = useState<number | null>(null);
  const [cityList, setCityList] = useState<City[]>(cities);
  const [loading, setLoading] = useState(cities.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.selectedCityId) {
      navigate('/shop', { replace: true });
    }
  }, [navigate, user]);

  async function loadCities() {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getCities();
      setCityList(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.request_failed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCities();
  }, []);

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
        <div className={styles.icon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <h1 className={styles.title}>{t('city.title')}</h1>
        <p className={styles.subtitle}>{t('city.subtitle')}</p>
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} aria-hidden="true" />
        </div>
      ) : error ? (
        <div className={styles.stateCard}>
          <p>{error}</p>
          <button className={styles.retryBtn} onClick={() => void loadCities()} type="button">
            {t('common.retry')}
          </button>
        </div>
      ) : cityList.length === 0 ? (
        <div className={styles.stateCard}>
          <p>{t('city.empty')}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {cityList.map((city) => (
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
