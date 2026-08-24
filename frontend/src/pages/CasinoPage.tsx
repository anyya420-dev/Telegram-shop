import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language } from '../types';
import styles from './CasinoPage.module.css';

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export default function CasinoPage() {
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [balance, setBalance] = useState<number | null>(null);
  const [bet, setBet] = useState('10');
  const [target, setTarget] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<{ dice: number; win: boolean; payout: number } | null>(null);
  const [animDice, setAnimDice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: number; type: string; amount: number; comment: string | null; createdAt: string }[]>([]);

  useEffect(() => {
    void api.getBalance().then((r) => setBalance(r.balance.amount));
    void api.getCasinoHistory().then((r) => setHistory(r.history));
  }, []);

  async function handleSpin() {
    const betNum = Number(bet);
    if (!betNum || betNum <= 0 || rolling) return;
    setRolling(true);
    setError(null);
    setResult(null);

    // Animate dice rolling
    let count = 0;
    const interval = setInterval(() => {
      setAnimDice(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count > 10) clearInterval(interval);
    }, 80);

    try {
      const r = await api.casinoSpin(betNum, target);
      clearInterval(interval);
      setAnimDice(r.dice);
      setBalance(r.balance.amount);
      setResult({ dice: r.dice, win: r.win, payout: r.payout });
      void api.getCasinoHistory().then((res) => setHistory(res.history));
    } catch (e: unknown) {
      clearInterval(interval);
      setAnimDice(null);
      setError(e instanceof Error ? e.message : t('casino.error'));
    } finally {
      setRolling(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('casino.title')}</h1>

      <div className={styles.balanceRow}>
        <span>{t('casino.balance')}: </span>
        <strong>{formatCurrency(balance ?? 0, language)}</strong>
      </div>

      <div className={styles.diceDisplay}>
        {animDice !== null ? (
          <span className={styles.diceFace}>{DICE_FACES[animDice - 1]}</span>
        ) : (
          <span className={styles.dicePlaceholder}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/></svg></span>
        )}
      </div>

      {result && (
        <div className={`${styles.resultBanner} ${result.win ? styles.win : styles.lose}`}>
          {result.win
            ? t('casino.won', { payout: formatCurrency(result.payout, language) })
            : t('casino.lost', { bet: formatCurrency(Number(bet), language) })}
        </div>
      )}

      <div className={styles.controls}>
        <div className={styles.controlRow}>
          <label className={styles.label}>{t('casino.bet')}</label>
          <input
            className={styles.input}
            type="number"
            min="1"
            max="10000"
            value={bet}
            onChange={(e) => setBet(e.target.value)}
          />
        </div>

        <div className={styles.controlRow}>
          <label className={styles.label}>{t('casino.target')}</label>
          <div className={styles.targetBtns}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                className={`${styles.targetBtn} ${target === n ? styles.targetActive : ''}`}
                onClick={() => setTarget(n)}
              >
                {DICE_FACES[n - 1]}
              </button>
            ))}
          </div>
        </div>

        <p className={styles.hint}>{t('casino.hint')}</p>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.spinBtn} onClick={() => void handleSpin()} disabled={rolling || !bet}>
          {rolling ? t('casino.rolling') : t('casino.spin')}
        </button>
      </div>

      {history.length > 0 && (
        <div className={styles.history}>
          <h3 className={styles.historyTitle}>{t('casino.history')}</h3>
          {history.map((h) => (
            <div key={h.id} className={`${styles.historyRow} ${h.type === 'casino_win' ? styles.win : styles.lose}`}>
              <span>{h.comment}</span>
              <span>{h.amount >= 0 ? '+' : ''}{formatCurrency(h.amount, language)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

