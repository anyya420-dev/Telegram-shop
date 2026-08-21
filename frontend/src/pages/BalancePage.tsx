import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Balance } from '../types';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language } from '../types';
import styles from './BalancePage.module.css';

const TOPUP_AMOUNTS = [100, 250, 500, 1000, 2500, 5000];

export default function BalancePage() {
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [topping, setTopping] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void api.getBalance().then((r) => { setBalance(r.balance); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleTopup(amount: number) {
    if (topping || amount <= 0) return;
    setTopping(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await api.topupBalance(amount);
      setBalance(r.balance);
      setSuccess(t('balance.topupSuccess', { amount: formatCurrency(amount, language) }));
      setCustomAmount('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('balance.topupError'));
    } finally {
      setTopping(false);
    }
  }

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('balance.title')}</h1>

      <div className={styles.card}>
        <span className={styles.cardLabel}>{t('balance.current')}</span>
        <span className={styles.amount}>{formatCurrency(balance?.amount ?? 0, language)}</span>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('balance.topup')}</h3>
        <div className={styles.amounts}>
          {TOPUP_AMOUNTS.map((a) => (
            <button key={a} className={styles.amountBtn} onClick={() => void handleTopup(a)} disabled={topping}>
              +{formatCurrency(a, language)}
            </button>
          ))}
        </div>
        <div className={styles.customRow}>
          <input
            className={styles.customInput}
            type="number"
            min="1"
            max="100000"
            placeholder={t('balance.customAmount')}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
          />
          <button
            className={styles.customBtn}
            disabled={topping || !customAmount}
            onClick={() => void handleTopup(Number(customAmount))}
          >
            {t('balance.topupBtn')}
          </button>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        {success && <p className={styles.success}>{success}</p>}
      </div>

      {balance && balance.transactions.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('balance.history')}</h3>
          <div className={styles.txList}>
            {balance.transactions.map((tx) => (
              <div key={tx.id} className={`${styles.tx} ${tx.amount >= 0 ? styles.txIn : styles.txOut}`}>
                <div>
                  <span className={styles.txType}>{t(`balance.txType.${tx.type}`, { defaultValue: tx.type })}</span>
                  {tx.comment && <span className={styles.txComment}> — {tx.comment}</span>}
                </div>
                <span className={styles.txAmount}>
                  {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount, language)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

