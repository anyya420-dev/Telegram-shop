import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, City } from '../context/AppContext';
import { api } from '../lib/api';
import styles from './CitySelectPage.module.css';
import { useTranslation } from 'react-i18next';

export default function CitySelectPage() {
  const { setCity, user } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<number | null>(null);

  useEffect(() => {
    api.get<City[]>('/cities').then(setCities).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user?.selectedCityId) {
      navigate('/shop', { replace: true });
    }
  }, [user, navigate]);

  async function handleSelect(city: City) {
    setSelecting(city.id);
    try {
      await setCity(city);
      navigate('/shop');
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
          <div className={styles.spinner} />
        </div>
      ) : (
        <div className={styles.list}>
          {cities.map((city) => (
            <button
              key={city.id}
              className={`${styles.cityBtn} ${selecting === city.id ? styles.selected : ''}`}
              onClick={() => handleSelect(city)}
              disabled={selecting !== null}
            >
              <span className={styles.cityName}>{city.name}</span>
              <span className={styles.arrow}>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
