import styles from './PlaceholderPage.module.css';
import { useTranslation } from 'react-i18next';

export default function SupportPage() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <div className={styles.icon}>🎧</div>
      <h1 className={styles.title}>{t('support.title')}</h1>
      <p className={styles.text}>{t('support.text')}</p>
      <div className={styles.badge}>{t('support.soon')}</div>
    </div>
  );
}
