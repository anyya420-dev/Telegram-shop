import styles from './PlaceholderPage.module.css';

export default function CasinoPage() {
  return (
    <div className={styles.page}>
      <div className={styles.icon}>🎰</div>
      <h1 className={styles.title}>Казино</h1>
      <p className={styles.text}>Казино будет доступно позже</p>
      <div className={styles.badge}>Скоро</div>
    </div>
  );
}
