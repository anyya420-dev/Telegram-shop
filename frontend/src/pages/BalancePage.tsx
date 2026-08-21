import styles from './PlaceholderPage.module.css';
import { useTranslation } from 'react-i18next';

export default function BalancePage() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <div className={styles.icon}>💰</div>
      <h1 className={styles.title}>{t('balance.title')}</h1>
      <p className={styles.text}>{t('balance.text')}</p>
      <div className={styles.badge}>{t('balance.soon')}</div>
    </div>
  )
}
