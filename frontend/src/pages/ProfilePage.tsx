import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ChevronRight, Coins, Heart, Languages, MapPin, RefreshCw, ShieldCheck, ShoppingBag, UserRound } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { api } from '../api/client'
import { getErrorMessage } from '../lib/errors'
import styles from './ProfilePage.module.css'
import { useTranslation } from 'react-i18next'
import { saveLanguage } from '../lib/i18n'
import i18n from '../lib/i18n'
import { getLocalizedCityName } from '../lib/localized'
import type { Language, UserProfile } from '../types'

export default function ProfilePage() {
  const { user: bootstrapUser, telegramEnvironment, openCityPicker, updateLanguagePreference } = useApp()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [profile, setProfile] = useState<UserProfile | null>(bootstrapUser)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [languageSaving, setLanguageSaving] = useState<Language | null>(null)

  async function loadProfile() {
    try {
      setProfileLoading(true)
      setProfileError(null)
      const response = await api.getProfile()
      setProfile(response.user)
    } catch (error) {
      setProfileError(getErrorMessage(error, t, 'request_failed'))
    } finally {
      setProfileLoading(false)
    }
  }

  useEffect(() => {
    setProfile(bootstrapUser)
  }, [bootstrapUser])

  useEffect(() => {
    void loadProfile()
  }, [])

  async function handleLanguageChange(language: Language) {
    if (!profile || languageSaving || i18n.language === language) {
      return
    }

    const previousLanguage = i18n.language as Language

    try {
      setLanguageSaving(language)
      setProfileError(null)
      void i18n.changeLanguage(language)
      saveLanguage(language)
      await updateLanguagePreference(language)
      setProfile((current) => (current ? { ...current, language } : current))
    } catch (error) {
      void i18n.changeLanguage(previousLanguage)
      saveLanguage(previousLanguage)
      setProfileError(getErrorMessage(error, t, 'language_update_failed'))
    } finally {
      setLanguageSaving(null)
    }
  }

  if (profileLoading) {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>{t('profile.title')}</h1>
        <div className={styles.placeholder}>
          <span className={styles.placeholderIcon}>
            <RefreshCw size={18} strokeWidth={1.8} />
          </span>
          <p>{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>{t('profile.title')}</h1>
        <div className={styles.placeholder}>
          <span className={styles.placeholderIcon}>
            <AlertCircle size={18} strokeWidth={1.8} />
          </span>
          <p>{profileError ?? t('profile.notAvailable')}</p>
          <button className={styles.retryBtn} onClick={() => void loadProfile()} type="button">
            {t('common.retry')}
          </button>
        </div>
      </div>
    )
  }

  const language = i18n.language as Language
  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.username || t('profile.defaultName')
  const avatarUrl = telegramEnvironment ? window.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url : undefined
  const cityName = profile.selectedCity
    ? getLocalizedCityName(profile.selectedCity, language)
    : t('profile.cityNotSelected')

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>{t('profile.title')}</h1>

      {!telegramEnvironment ? (
        <div className={styles.notice}>
          <AlertCircle size={16} strokeWidth={1.8} />
          <span>{t('profile.telegramWebAppOnly')}</span>
        </div>
      ) : null}

      {profileError ? (
        <div className={styles.notice}>
          <AlertCircle size={16} strokeWidth={1.8} />
          <span>{profileError}</span>
        </div>
      ) : null}

      <div className={styles.avatar}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className={styles.avatarImage} />
        ) : (
          <div className={styles.avatarCircle}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className={styles.userInfo}>
          <p className={styles.displayName}>{displayName}</p>
          {profile.username ? <p className={styles.username}>@{profile.username}</p> : null}
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('profile.accountInfo')}</h2>
        <div className={styles.cards}>
          <div className={styles.card}>
            <div className={styles.cardLeft}>
              <ShieldCheck size={16} strokeWidth={1.7} />
              <span className={styles.cardLabel}>{t('profile.telegramId')}</span>
            </div>
            <span className={styles.cardValue}>{profile.telegramId}</span>
          </div>

          <div className={styles.card}>
            <div className={styles.cardLeft}>
              <UserRound size={16} strokeWidth={1.7} />
              <span className={styles.cardLabel}>{t('profile.firstName')}</span>
            </div>
            <span className={styles.cardValue}>{profile.firstName}</span>
          </div>

          {profile.lastName ? (
            <div className={styles.card}>
              <div className={styles.cardLeft}>
                <UserRound size={16} strokeWidth={1.7} />
                <span className={styles.cardLabel}>{t('profile.lastName')}</span>
              </div>
              <span className={styles.cardValue}>{profile.lastName}</span>
            </div>
          ) : null}

          {profile.username ? (
            <div className={styles.card}>
              <div className={styles.cardLeft}>
                <UserRound size={16} strokeWidth={1.7} />
                <span className={styles.cardLabel}>{t('profile.username')}</span>
              </div>
              <span className={styles.cardValue}>@{profile.username}</span>
            </div>
          ) : null}

          <button className={styles.cardButton} onClick={openCityPicker} type="button">
            <div className={styles.cardLeft}>
              <MapPin size={16} strokeWidth={1.7} />
              <span className={styles.cardLabel}>{t('profile.city')}</span>
            </div>
            <div className={styles.cardRight}>
              <span className={styles.cardValue}>{cityName}</span>
              <ChevronRight size={16} strokeWidth={1.8} />
            </div>
          </button>

          {typeof profile.balance === 'number' ? (
            <button className={styles.cardButton} onClick={() => navigate('/balance')} type="button">
              <div className={styles.cardLeft}>
                <Coins size={16} strokeWidth={1.7} />
                <span className={styles.cardLabel}>{t('profile.balance')}</span>
              </div>
              <div className={styles.cardRight}>
                <span className={styles.cardValue}>{profile.balance.toFixed(2)}</span>
                <ChevronRight size={16} strokeWidth={1.8} />
              </div>
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('profile.settings')}</h2>
        <div className={styles.card}>
          <div className={styles.cardLeft}>
            <Languages size={16} strokeWidth={1.7} />
            <span className={styles.cardLabel}>{t('profile.language')}</span>
          </div>
          <div className={styles.cardRight}>
            <button
              className={`${styles.langBtn} ${language === 'ru' ? styles.langActive : ''}`}
              onClick={() => void handleLanguageChange('ru')}
              disabled={languageSaving !== null}
              type="button"
            >
              RU
            </button>
            <button
              className={`${styles.langBtn} ${language === 'en' ? styles.langActive : ''}`}
              onClick={() => void handleLanguageChange('en')}
              disabled={languageSaving !== null}
              type="button"
            >
              EN
            </button>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('profile.activity')}</h2>
        <button className={styles.linkCard} onClick={() => navigate('/orders')} type="button">
          <div className={styles.cardLeft}>
            <ShoppingBag size={16} strokeWidth={1.7} />
            <span>{t('profile.orders')}</span>
          </div>
          <div className={styles.cardRight}>
            <span className={styles.cardValue}>{t('profile.ordersCount', { count: profile.orderCount ?? 0 })}</span>
            <ChevronRight size={16} strokeWidth={1.8} />
          </div>
        </button>

        <button className={styles.linkCard} onClick={() => navigate('/wishlist')} type="button">
          <div className={styles.cardLeft}>
            <Heart size={16} strokeWidth={1.7} />
            <span>{t('wishlist.title')}</span>
          </div>
          <div className={styles.cardRight}>
            <ChevronRight size={16} strokeWidth={1.8} />
          </div>
        </button>
      </div>
    </div>
  )
}
