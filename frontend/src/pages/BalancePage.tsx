import { useEffect, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { getErrorMessage } from '../lib/errors'
import type { Balance } from '../types'
import { formatCurrency } from '../lib/format'
import i18n from '../lib/i18n'
import type { Language } from '../types'
import styles from './BalancePage.module.css'

const TOPUP_AMOUNTS = [100, 250, 500, 1000, 2500, 5000]

export default function BalancePage() {
  const { t } = useTranslation()
  const language = i18n.language as Language
  const [balance, setBalance] = useState<Balance | null>(null)
  const [loading, setLoading] = useState(true)
  const [topping, setTopping] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function loadBalance() {
    try {
      setLoading(true)
      setError(null)
      const response = await api.getBalance()
      setBalance(response.balance)
    } catch (loadError) {
      setError(getErrorMessage(loadError, t, 'request_failed'))
      setBalance(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBalance()
  }, [])

  async function handleTopup(amount: number) {
    if (topping || amount <= 0) return
    setTopping(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await api.topupBalance(amount)
      setBalance(response.balance)
      setSuccess(t('balance.topupSuccess', { amount: formatCurrency(amount, language) }))
      setCustomAmount('')
    } catch (topupError) {
      setError(getErrorMessage(topupError, t, 'request_failed'))
    } finally {
      setTopping(false)
    }
  }

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>

  if (!balance) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{t('balance.title')}</h1>
        <div className={styles.section}>
          <p className={styles.errorRow}>
            <AlertCircle size={16} strokeWidth={1.8} />
            <span>{error ?? t('balance.topupError')}</span>
          </p>
          <button className={styles.customBtn} onClick={() => void loadBalance()} type="button">
            <RefreshCw size={16} strokeWidth={1.5} />
            {t('common.retry')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('balance.title')}</h1>

      <div className={styles.card}>
        <span className={styles.cardLabel}>{t('balance.current')}</span>
        <span className={styles.amount}>{formatCurrency(balance.amount, language)}</span>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('balance.topup')}</h3>
        <div className={styles.amounts}>
          {TOPUP_AMOUNTS.map((amount) => (
            <button key={amount} className={styles.amountBtn} onClick={() => void handleTopup(amount)} disabled={topping} type="button">
              +{formatCurrency(amount, language)}
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
            onChange={(event) => setCustomAmount(event.target.value)}
          />
          <button
            className={styles.customBtn}
            disabled={topping || !customAmount}
            onClick={() => void handleTopup(Number(customAmount))}
            type="button"
          >
            {t('balance.topupBtn')}
          </button>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        {success ? <p className={styles.success}>{success}</p> : null}
      </div>

      {balance.transactions.length > 0 ? (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('balance.history')}</h3>
          <div className={styles.txList}>
            {balance.transactions.map((tx) => (
              <div key={tx.id} className={`${styles.tx} ${tx.amount >= 0 ? styles.txIn : styles.txOut}`}>
                <div>
                  <span className={styles.txType}>{t(`balance.txType.${tx.type}`, { defaultValue: tx.type })}</span>
                  {tx.comment ? <span className={styles.txComment}> — {tx.comment}</span> : null}
                </div>
                <span className={styles.txAmount}>
                  {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount, language)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
