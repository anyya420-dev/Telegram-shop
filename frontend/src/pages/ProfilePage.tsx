import { useState } from 'react';
import { useApp, City } from '../context/AppContext';
import { api } from '../lib/api';
import styles from './ProfilePage.module.css';
import { useTranslation } from 'react-i18next';
import { saveLanguage } from '../lib/i18n';

export default function ProfilePage() {
  const { user, selectedCity, setCity } = useApp();
  const { t, i18n } = useTranslation();
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [cities, setCities] = useState<City[]>([]);

  async function openCityPicker() {
    const data = await api.get<City[]>('/cities');
    setCities(data);
    setShowCityPicker(true);
  }

  async function handleCityChange(city: City) {
    await setCity(city);
    setShowCityPicker(false);
  }

  function handleLanguageChange(lang: string) {
    void i18n.changeLanguage(lang);
    saveLanguage(lang);
  }

  const displayName = user?.firstName
    ? [user.firstName, user.lastName].filter(Boolean).join(' ')
    : user?.username || t('profile.defaultName');

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>{t('profile.title')}</h1>

      <div className={styles.avatar}>
        <div className={styles.avatarCircle}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className={styles.userInfo}>
          <p className={styles.displayName}>{displayName}</p>
          {user?.username && (
            <p className={styles.username}>@{user.username}</p>
          )}
        </div>
      </div>

      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('profile.telegramId')}</span>
          <span className={styles.cardValue}>{user?.telegramId}</span>
        </div>

        <div className={styles.card} onClick={() => void openCityPicker()}>
          <span className={styles.cardLabel}>{t('profile.city')}</span>
          <div className={styles.cardRight}>
            <span className={styles.cardValue}>
              {selectedCity?.name || t('profile.cityNotSelected')}
            </span>
            <span className={styles.cardArrow}>›</span>
          </div>
        </div>

        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('profile.language')}</span>
          <div className={styles.cardRight}>
            <button
              className={`${styles.langBtn} ${i18n.language === 'ru' ? styles.langActive : ''}`}
              onClick={() => handleLanguageChange('ru')}
              aria-label={t('profile.languageRu')}
              title={t('profile.languageRu')}
            >
              🇷🇺
            </button>
            <button
              className={`${styles.langBtn} ${i18n.language === 'en' ? styles.langActive : ''}`}
              onClick={() => handleLanguageChange('en')}
              aria-label={t('profile.languageEn')}
              title={t('profile.languageEn')}
            >
              🇬🇧
            </button>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('profile.balance')}</h3>
        <div className={styles.placeholder}>
          <span className={styles.placeholderIcon}>💰</span>
          <p>{t('profile.balanceSoon')}</p>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('profile.orders')}</h3>
        <div className={styles.placeholder}>
          <span className={styles.placeholderIcon}>📦</span>
          <p>{t('profile.ordersSoon')}</p>
        </div>
      </div>

      {showCityPicker && (
        <div className={styles.modal} onClick={() => setShowCityPicker(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{t('profile.selectCity')}</h3>
            {cities.map((city) => (
              <button
                key={city.id}
                className={`${styles.cityBtn} ${selectedCity?.id === city.id ? styles.cityActive : ''}`}
                onClick={() => void handleCityChange(city)}
              >
                {city.name}
                {selectedCity?.id === city.id && <span className={styles.check}>✓</span>}
              </button>
            ))}
            <button className={styles.cancelBtn} onClick={() => setShowCityPicker(false)}>
              {t('profile.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
