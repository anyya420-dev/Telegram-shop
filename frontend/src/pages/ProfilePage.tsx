import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import styles from './ProfilePage.module.css';
import { useTranslation } from 'react-i18next';
import { saveLanguage } from '../lib/i18n';
import i18n from '../lib/i18n';
import { getLocalizedCityName } from '../lib/localized';
import type { Language } from '../types';
import { resolveApiErrorMessage } from '../lib/errors';

export default function ProfilePage() {
  const { user: profile, authStatus, telegramEnvironment, openCityPicker, updateLanguagePreference, orders, isAdmin } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [languageSaving, setLanguageSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  function handleLanguageChange(lang: Language) {
    if (languageSaving) {
      return;
    }

    setProfileError(null);
    setLanguageSaving(true);
    void i18n.changeLanguage(lang);
    saveLanguage(lang);
    void updateLanguagePreference(lang)
      .catch((error) => {
        setProfileError(resolveApiErrorMessage(error, t, 'language_update_failed'));
      })
      .finally(() => {
        setLanguageSaving(false);
      });
  }

  if (authStatus === 'AUTH_LOADING') {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>{t('profile.title')}</h1>
        <div className={styles.placeholder}>
          <p>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>{t('profile.title')}</h1>
        <div className={styles.placeholder}>
          <span className={styles.placeholderIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </span>
          <p>{t('profile.defaultName')}</p>
        </div>
      </div>
    );
  }

  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.username || t('profile.defaultName');
  const avatarUrl = telegramEnvironment ? window.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url : undefined;

  const cityName = profile.selectedCity
    ? getLocalizedCityName(profile.selectedCity, i18n.language as Language)
    : t('profile.cityNotSelected');

  const orderCount = profile.orderCount ?? orders.length;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>{t('profile.title')}</h1>

      {!telegramEnvironment && (
        <div className={styles.placeholder} style={{ marginBottom: 16 }}>
          <p>{t('profile.telegramWebAppOnly')}</p>
        </div>
      )}

      {profileError && (
        <div className={styles.placeholder} style={{ marginBottom: 16 }}>
          <p>{profileError}</p>
        </div>
      )}

      <div className={styles.avatar}>
        {avatarUrl && !avatarFailed ? (
          <img src={avatarUrl} alt={displayName} className={styles.avatarImage} onError={() => setAvatarFailed(true)} />
        ) : (
          <div className={styles.avatarCircle}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
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
              <span className={styles.cardValue}>{profile.balance.toFixed(2)}</span>
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
              disabled={languageSaving}
              aria-label={t('profile.languageRu')}
              title={t('profile.languageRu')}
              type="button"
            >
              RU
            </button>
            <button
              className={`${styles.langBtn} ${i18n.language === 'en' ? styles.langActive : ''}`}
              onClick={() => handleLanguageChange('en')}
              disabled={languageSaving}
              aria-label={t('profile.languageEn')}
              title={t('profile.languageEn')}
              type="button"
            >
              EN
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
          <span>{t('wishlist.title')}</span>
          <span className={styles.cardArrow}>›</span>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('profile.orders')}</h3>
        {orderCount === 0 ? (
          <div className={styles.placeholder}>
            <span className={styles.placeholderIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
            </span>
            <p>{t('profile.ordersEmpty')}</p>
          </div>
        ) : (
          <div
            className={styles.ordersLink}
            onClick={() => navigate('/orders')}
          >
            <span>{t('profile.ordersCount', { count: orderCount })}</span>
            <span className={styles.cardArrow}>›</span>
          </div>
        )}
      </div>
      {isAdmin && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('admin.title', { defaultValue: 'Admin' })}</h3>
          <div
            className={styles.ordersLink}
            onClick={() => navigate('/admin')}
          >
            <span>{t('admin.settings', { defaultValue: 'Admin Settings' })}</span>
            <span className={styles.cardArrow}>›</span>
          </div>
        </div>
      )}
    </div>
  );
}
