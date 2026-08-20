import styles from './PlaceholderPage.module.css';

export default function SupportPage() {
  return (
    <div className={styles.page}>
      <div className={styles.icon}>🎧</div>
      <h1 className={styles.title}>Поддержка</h1>
      <p className={styles.text}>Поддержка будет доступна позже</p>
      <div className={styles.badge}>Скоро</div>
    </div>
  );
}
