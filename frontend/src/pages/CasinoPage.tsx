import { useEffect, useState } from 'react'
import { Dices, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { getErrorMessage } from '../lib/errors'
import { formatCurrency } from '../lib/format'
import i18n from '../lib/i18n'
import type { Language } from '../types'
import styles from './CasinoPage.module.css'

export default function CasinoPage() {
  const { t } = useTranslation()
  const language = i18n.language as Language
  const [balance, setBalance] = useState<number | null>(null)
  const [bet, setBet] = useState('10')
  const [target, setTarget] = useState(1)
  const [rolling, setRolling] = useState(false)
  const [result, setResult] = useState<{ dice: number; win: boolean; payout: number } | null>(null)
  const [animDice, setAnimDice] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [spinError, setSpinError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ id: number; type: string; amount: number; comment: string | null; createdAt: string }[]>([])
  const [loading, setLoading] = useState(true)

  async function loadCasino() {
    try {
      setLoading(true)
      setLoadError(null)
      const casinoState = await api.getCasinoState()
      setBalance(casinoState.balance.credits)
      setHistory(casinoState.history.map((entry) => ({
        id: entry.id,
        type: entry.isWin ? 'casino_win' : 'casino_loss',
        amount: entry.netChange,
        comment: entry.comment,
        createdAt: entry.createdAt,
      })))
    } catch (error) {
      setLoadError(getErrorMessage(error, t, 'request_failed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCasino()
  }, [])

  async function handleSpin() {
    const betNum = Number(bet)
    if (!betNum || betNum <= 0 || rolling) return
    setRolling(true)
    setSpinError(null)
    setResult(null)

    let count = 0
    const interval = window.setInterval(() => {
      setAnimDice(Math.floor(Math.random() * 6) + 1)
      count += 1
      if (count > 10) {
        window.clearInterval(interval)
      }
    }, 80)

    try {
      const response = await api.casinoSpin(betNum, target)
      window.clearInterval(interval)
      setAnimDice(response.dice)
      setBalance(response.balance.amount)
      setResult({ dice: response.dice, win: response.win, payout: response.payout })
      setHistory((current) => [
        {
          id: response.round.id,
          type: response.round.isWin ? 'casino_win' : 'casino_loss',
          amount: response.round.netChange,
          comment: response.round.comment,
          createdAt: response.round.createdAt,
        },
        ...current.filter((entry) => entry.id !== response.round.id),
      ].slice(0, 20))
    } catch (spinError) {
      window.clearInterval(interval)
      setAnimDice(null)
      setSpinError(getErrorMessage(spinError, t, 'request_failed'))
    } finally {
      setRolling(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{t('casino.title')}</h1>
        <div className={styles.controls}>
          <p className={styles.hint}>{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('casino.title')}</h1>

      <div className={styles.balanceRow}>
        <span>{t('casino.credits', { defaultValue: t('casino.balance') })}: </span>
        <strong>{formatCurrency(balance ?? 0, language)}</strong>
      </div>

      <div className={styles.diceDisplay}>
        {animDice !== null ? (
          <span className={styles.diceFace}>{animDice}</span>
        ) : (
          <span className={styles.dicePlaceholder}><Dices size={72} strokeWidth={1.3} /></span>
        )}
      </div>

      {result ? (
        <div className={`${styles.resultBanner} ${result.win ? styles.win : styles.lose}`}>
          {result.win
            ? t('casino.won', { payout: formatCurrency(result.payout, language) })
            : t('casino.lost', { bet: formatCurrency(Number(bet), language) })}
        </div>
      ) : null}

      <div className={styles.controls}>
        <div className={styles.controlRow}>
          <label className={styles.label}>{t('casino.bet')}</label>
          <input
            className={styles.input}
            type="number"
            min="1"
            max="10000"
            value={bet}
            onChange={(event) => setBet(event.target.value)}
          />
        </div>

        <div className={styles.controlRow}>
          <label className={styles.label}>{t('casino.target')}</label>
          <div className={styles.targetBtns}>
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <button
                key={value}
                className={`${styles.targetBtn} ${target === value ? styles.targetActive : ''}`}
                onClick={() => setTarget(value)}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <p className={styles.hint}>{t('casino.hint')}</p>

        {loadError ? <p className={styles.error}>{loadError}</p> : null}
        {spinError ? <p className={styles.error}>{spinError}</p> : null}

        <button className={styles.spinBtn} onClick={() => void handleSpin()} disabled={rolling || !bet} type="button">
          {rolling ? t('casino.rolling') : t('casino.spin')}
        </button>
        {loadError ? (
          <button className={styles.spinBtn} onClick={() => void loadCasino()} disabled={rolling} type="button">
            <RefreshCw size={16} strokeWidth={1.5} />
            {t('common.retry')}
          </button>
        ) : null}
      </div>

      {history.length > 0 ? (
        <div className={styles.history}>
          <h3 className={styles.historyTitle}>{t('casino.history')}</h3>
          {history.map((entry) => (
            <div key={entry.id} className={`${styles.historyRow} ${entry.type === 'casino_win' ? styles.win : styles.lose}`}>
              <span>{entry.comment}</span>
              <span>{entry.amount >= 0 ? '+' : ''}{formatCurrency(entry.amount, language)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
