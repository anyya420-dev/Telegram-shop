import { useEffect, useState } from 'react'
import { Gift, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { getErrorMessage } from '../lib/errors'
import type { CasinoReward } from '../types'
import styles from './RewardsPage.module.css'

function rewardLabel(reward: CasinoReward) {
  if (reward.rewardType === 'shop_discount' && reward.discountPercent) {
    return `${reward.discountPercent}% OFF`
  }
  if (reward.rewardType === 'casino_credits' && reward.creditAmount) {
    return `${reward.creditAmount} Credits`
  }
  return reward.rewardType
}

export default function RewardsPage() {
  const { t } = useTranslation()
  const [rewards, setRewards] = useState<CasinoReward[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadRewards() {
    try {
      setLoading(true)
      setError(null)
      const response = await api.getCasinoState()
      setRewards(response.rewards ?? [])
    } catch (loadError) {
      setError(getErrorMessage(loadError, t, 'request_failed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRewards()
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Gift size={18} strokeWidth={1.7} />
        <h1>{t('profile.rewards', { defaultValue: 'My rewards' })}</h1>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {error ? (
        <button className={styles.retry} onClick={() => void loadRewards()} type="button">
          <RefreshCw size={16} strokeWidth={1.7} />
          {t('common.retry')}
        </button>
      ) : null}
      {loading ? <div className={styles.empty}>{t('common.loading')}</div> : null}
      {!loading && rewards.length === 0 ? <div className={styles.empty}>{t('profile.noRewards', { defaultValue: 'No rewards yet.' })}</div> : null}
      <div className={styles.list}>
        {rewards.map((reward) => (
          <article key={reward.id} className={styles.card}>
            <div>
              <p className={styles.game}>{reward.game}</p>
              <strong className={styles.reward}>{rewardLabel(reward)}</strong>
            </div>
            <div className={styles.meta}>
              <span className={styles.status}>{reward.status}</span>
              <span>{new Date(reward.createdAt).toLocaleString()}</span>
              {reward.expiresAt ? <span>{t('profile.expires', { defaultValue: 'Expires' })}: {new Date(reward.expiresAt).toLocaleString()}</span> : null}
              {reward.orderId ? <span>{t('profile.usedOrder', { defaultValue: 'Order' })} #{reward.orderId}</span> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
