import styles from './PlaceholderPage.module.css';

export default function BalancePage() {
  return (
    <div className={styles.page}>
      <div className={styles.icon}>💰</div>
      <h1 className={styles.title}>Баланс</h1>
      <p className={styles.text}>Баланс будет доступен позже</p>
      <div className={styles.badge}>Скоро</div>
    </div>
  );
}
