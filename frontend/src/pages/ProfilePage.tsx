import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../api/client';
import styles from './ProfilePage.module.css';
import { useTranslation } from 'react-i18next';
import { saveLanguage } from '../lib/i18n';
import i18n from '../lib/i18n';
import { getLocalizedCityName } from '../lib/localized';
import type { Language, UserProfile } from '../types';

export default function ProfilePage() {
  const { user: bootstrapUser, openCityPicker, updateLanguagePreference, orders, fetchOrders } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [profile, setProfile] = useState<UserProfile | null>(bootstrapUser);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        setProfileLoading(true);
        setProfileError(null);
        const response = await api.getProfile();
        setProfile(response.user);
      } catch (err) {
        setProfileError(err instanceof Error ? err.message : t('errors.request_failed'));
      } finally {
        setProfileLoading(false);
      }
    }
    void loadProfile();
    void fetchOrders();
  }, [fetchOrders]);

  function handleLanguageChange(lang: Language) {
    void i18n.changeLanguage(lang);
    saveLanguage(lang);
    void updateLanguagePreference(lang);
  }

  if (profileLoading) {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>{t('profile.title')}</h1>
        <div className={styles.placeholder}>
          <span className={styles.placeholderIcon}>⏳</span>
          <p>{t('common.loading', 'Loading...')}</p>
        </div>
      </div>
    );
  }

  if (profileError && !profile) {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>{t('profile.title')}</h1>
        <div className={styles.placeholder}>
          <span className={styles.placeholderIcon}>⚠️</span>
          <p>{profileError}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>{t('profile.title')}</h1>
        <div className={styles.placeholder}>
          <span className={styles.placeholderIcon}>👤</span>
          <p>{t('profile.defaultName')}</p>
        </div>
      </div>
    );
  }

  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.username || t('profile.defaultName');

  const cityName = profile.selectedCity
    ? getLocalizedCityName(profile.selectedCity, i18n.language as Language)
    : t('profile.cityNotSelected');

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>{t('profile.title')}</h1>

      {profileError && (
        <div className="error-banner" role="alert" style={{ marginBottom: 12 }}>
          <span>{profileError}</span>
        </div>
      )}

      <div className={styles.avatar}>
        <div className={styles.avatarCircle}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className={styles.userInfo}>
          <p className={styles.displayName}>{displayName}</p>
          {profile.username && (
            <p className={styles.username}>@{profile.username}</p>
          )}
        </div>
      </div>

      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('profile.telegramId')}</span>
          <span className={styles.cardValue}>{profile.telegramId}</span>
        </div>

        {profile.balance != null && (
          <div className={styles.card} onClick={() => navigate('/balance')} style={{ cursor: 'pointer' }}>
            <span className={styles.cardLabel}>{t('profile.balance')}</span>
            <div className={styles.cardRight}>
              <span className={styles.cardValue}>💰 {profile.balance.toFixed(2)}</span>
              <span className={styles.cardArrow}>›</span>
            </div>
          </div>
        )}

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
        {profile.orderCount != null ? (
          profile.orderCount === 0 ? (
            <div className={styles.placeholder}>
              <span className={styles.placeholderIcon}>📦</span>
              <p>{t('profile.ordersEmpty')}</p>
            </div>
          ) : (
            <div
              className={styles.ordersLink}
              onClick={() => navigate('/orders')}
            >
              <span>{t('profile.ordersCount', { count: profile.orderCount })}</span>
              <span className={styles.cardArrow}>›</span>
            </div>
          )
        ) : orders.length === 0 ? (
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
