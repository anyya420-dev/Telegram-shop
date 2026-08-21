import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import styles from './ProfilePage.module.css';
import { useTranslation } from 'react-i18next';
import { saveLanguage } from '../lib/i18n';
import i18n from '../lib/i18n';
import { getLocalizedCityName } from '../lib/localized';
import type { Language } from '../types';

export default function ProfilePage() {
  const { user, openCityPicker, updateLanguagePreference, orders } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (!user) {
    return null;
  }

  function handleLanguageChange(lang: Language) {
    void i18n.changeLanguage(lang);
    saveLanguage(lang);
    void updateLanguagePreference(lang);
  }

  const displayName = user.firstName
    ? [user.firstName].filter(Boolean).join(' ')
    : user.username || t('profile.defaultName');

  const cityName = user.selectedCity
    ? getLocalizedCityName(user.selectedCity, i18n.language as Language)
    : t('profile.cityNotSelected');

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>{t('profile.title')}</h1>

      <div className={styles.avatar}>
        <div className={styles.avatarCircle}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className={styles.userInfo}>
          <p className={styles.displayName}>{displayName}</p>
          {user.username && (
            <p className={styles.username}>@{user.username}</p>
          )}
        </div>
      </div>

      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('profile.telegramId')}</span>
          <span className={styles.cardValue}>{user.telegramId}</span>
        </div>

        <div className={styles.card} onClick={() => openCityPicker()}>
          <span className={styles.cardLabel}>{t('profile.city')}</span>
          <div className={styles.cardRight}>
            <span className={styles.cardValue}>{cityName}</span>
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
        <div
          className={styles.ordersLink}
          onClick={() => navigate('/balance')}
        >
          <span>💰 {t('profile.balance')}</span>
          <span className={styles.cardArrow}>›</span>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('wishlist.title')}</h3>
        <div
          className={styles.ordersLink}
          onClick={() => navigate('/wishlist')}
        >
          <span>🤍 {t('wishlist.title')}</span>
          <span className={styles.cardArrow}>›</span>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('profile.orders')}</h3>
        {orders.length === 0 ? (
          <div className={styles.placeholder}>
            <span className={styles.placeholderIcon}>📦</span>
            <p>{t('profile.ordersEmpty')}</p>
          </div>
        ) : (
          <div
            className={styles.ordersLink}
            onClick={() => navigate('/orders')}
          >
            <span>{t('profile.ordersCount', { count: orders.length })}</span>
            <span className={styles.cardArrow}>›</span>
          </div>
        )}
      </div>
    </div>
  );
}
