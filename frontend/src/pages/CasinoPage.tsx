import styles from './PlaceholderPage.module.css';
import { useTranslation } from 'react-i18next';

export default function CasinoPage() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <div className={styles.icon}>🎰</div>
      <h1 className={styles.title}>{t('casino.title')}</h1>
      <p className={styles.text}>{t('casino.text')}</p>
      <div className={styles.badge}>{t('casino.soon')}</div>
    </div>
  );
}
