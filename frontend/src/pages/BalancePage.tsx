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

export default function BalancePage() {
  const { t } = useTranslation()
  const language = i18n.language as Language
  const [balance, setBalance] = useState<Balance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        <h3 className={styles.sectionTitle}>{t('balance.shopOnly', { defaultValue: 'Shop balance only' })}</h3>
        <p className={styles.txComment}>{t('balance.notice', { defaultValue: 'This balance is reserved for shop-side adjustments such as refunds. It cannot be topped up, withdrawn, or converted into casino credits.' })}</p>
        {error ? <p className={styles.error}>{error}</p> : null}
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
