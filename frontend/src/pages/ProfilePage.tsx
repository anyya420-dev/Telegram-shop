import { useState } from 'react';
import { useApp, City } from '../context/AppContext';
import { api } from '../lib/api';
import styles from './ProfilePage.module.css';

export default function ProfilePage() {
  const { user, selectedCity, setCity } = useApp();
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [cities, setCities] = useState<City[]>([]);

  async function openCityPicker() {
    const data = await api.get<City[]>('/cities');
    setCities(data);
    setShowCityPicker(true);
  }

  async function handleCityChange(city: City) {
    await setCity(city);
    setShowCityPicker(false);
  }

  const displayName = user?.firstName
    ? [user.firstName, user.lastName].filter(Boolean).join(' ')
    : user?.username || 'Пользователь';

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Профиль</h1>

      <div className={styles.avatar}>
        <div className={styles.avatarCircle}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className={styles.userInfo}>
          <p className={styles.displayName}>{displayName}</p>
          {user?.username && (
            <p className={styles.username}>@{user.username}</p>
          )}
        </div>
      </div>

      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Telegram ID</span>
          <span className={styles.cardValue}>{user?.telegramId}</span>
        </div>

        <div className={styles.card} onClick={() => void openCityPicker()}>
          <span className={styles.cardLabel}>Город</span>
          <div className={styles.cardRight}>
            <span className={styles.cardValue}>
              {selectedCity?.name || 'Не выбран'}
            </span>
            <span className={styles.cardArrow}>›</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Баланс</h3>
        <div className={styles.placeholder}>
          <span className={styles.placeholderIcon}>💰</span>
          <p>Баланс будет доступен позже</p>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Мои заказы</h3>
        <div className={styles.placeholder}>
          <span className={styles.placeholderIcon}>📦</span>
          <p>История заказов будет доступна позже</p>
        </div>
      </div>

      {showCityPicker && (
        <div className={styles.modal} onClick={() => setShowCityPicker(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>📍 Выберите город</h3>
            {cities.map((city) => (
              <button
                key={city.id}
                className={`${styles.cityBtn} ${selectedCity?.id === city.id ? styles.cityActive : ''}`}
                onClick={() => void handleCityChange(city)}
              >
                {city.name}
                {selectedCity?.id === city.id && <span className={styles.check}>✓</span>}
              </button>
            ))}
            <button className={styles.cancelBtn} onClick={() => setShowCityPicker(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
