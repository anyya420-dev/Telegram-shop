import { useI18n } from '../i18n'
import styles from './PlaceholderPage.module.css'

export default function CasinoPage() {
  const { t } = useI18n()

  return (
    <div className={styles.page}>
      <div className={styles.icon}>🎰</div>
      <h1 className={styles.title}>{t('nav.casino')}</h1>
      <p className={styles.text}>{t('placeholders.casinoDescription')}</p>
      <div className={styles.badge}>{t('common.soon')}</div>
    </div>
  )
}
