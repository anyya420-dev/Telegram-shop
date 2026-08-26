import { useEffect, useMemo, useState } from 'react'
import { Coins, Disc3, RotateCcw, Shield, Sparkles, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { getErrorMessage } from '../lib/errors'
import type { CasinoReward, CasinoRound, CasinoState } from '../types'
import styles from './CasinoPage.module.css'

const WHEEL_SEGMENTS = ['credits_50', 'credits_120', 'discount_2', 'discount_5', 'discount_7', 'discount_10', 'discount_15', 'discount_20', 'discount_25', 'discount_30']
const SLOT_SYMBOLS = ['cherry', 'lemon', 'orange', 'watermelon', 'grape', 'bell', 'bar', 'golden7']
const ROULETTE_BETS = ['red', 'black', 'odd', 'even', 'low', 'high']

function rewardLabel(reward: CasinoReward | { rewardType: string; discountPercent: number | null; creditAmount: number | null; title?: string } | null) {
  if (!reward) return 'No reward'
  if (reward.rewardType === 'shop_discount' && reward.discountPercent) return `${reward.discountPercent}% OFF`
  if (reward.rewardType === 'casino_credits' && reward.creditAmount) return `${reward.creditAmount} Credits`
  return ('title' in reward ? reward.title : undefined) ?? reward.rewardType
}

function historyReward(entry: CasinoRound) {
  return entry.reward ? rewardLabel(entry.reward) : entry.isWin ? `${entry.payoutAmount} Credits` : 'No reward'
}

export default function CasinoPage() {
  const { t } = useTranslation()
  const [state, setState] = useState<CasinoState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [bet, setBet] = useState('10')
  const [result, setResult] = useState<{ game: string; reward: string; outcome: string | null } | null>(null)
  const [wheelIndex, setWheelIndex] = useState(0)
  const [slotSymbols, setSlotSymbols] = useState(['cherry', 'lemon', 'orange'])
  const [rouletteBet, setRouletteBet] = useState('red')
  const [rouletteNumber, setRouletteNumber] = useState('7')

  async function loadCasino() {
    try {
      setLoading(true)
      setError(null)
      const response = await api.getCasinoState()
      setState(response)
    } catch (loadError) {
      setError(getErrorMessage(loadError, t, 'request_failed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCasino()
  }, [])

  const rewards = state?.rewards ?? []
  const history = state?.history ?? []
  const credits = state?.balance.credits ?? 0

  async function play(game: 'wheel' | 'slots' | 'roulette' | 'chest', selection: Record<string, unknown> = {}) {
    const betAmount = Number(bet)
    if (!betAmount || betAmount <= 0 || playing) return
    setPlaying(game)
    setError(null)
    setResult(null)

    let wheelTimer: number | undefined
    let slotsTimer: number | undefined
    if (game === 'wheel') {
      wheelTimer = window.setInterval(() => setWheelIndex((current) => (current + 1) % WHEEL_SEGMENTS.length), 90)
    }
    if (game === 'slots') {
      slotsTimer = window.setInterval(() => {
        setSlotSymbols([
          SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
          SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
          SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
        ])
      }, 90)
    }

    try {
      const response = await api.playCasinoGame(game, {
        bet: betAmount,
        requestId: `${game}-${Date.now()}`,
        ...selection,
      })
      if (wheelTimer) {
        window.clearInterval(wheelTimer)
        const finalIndex = Math.max(0, WHEEL_SEGMENTS.indexOf(response.round.outcomeValue ?? ''))
        setWheelIndex(finalIndex === -1 ? 0 : finalIndex)
      }
      if (slotsTimer) {
        window.clearInterval(slotsTimer)
        const symbols = (response.round.outcomeValue ?? '').split('|').filter(Boolean)
        if (symbols.length === 3) setSlotSymbols(symbols)
      }
      setState((current) =>
        current
          ? {
              ...current,
              balance: { ...current.balance, ...response.balance },
              history: [response.round, ...current.history.filter((entry) => entry.id !== response.round.id)].slice(0, 20),
              rewards: response.round.reward ? [response.round.reward, ...(current.rewards?.filter((entry) => entry.id !== response.round.reward?.id) ?? [])] : current.rewards,
            }
          : current,
      )
      setResult({ game, reward: rewardLabel(response.reward), outcome: response.round.outcomeValue })
    } catch (playError) {
      setError(getErrorMessage(playError, t, 'request_failed'))
    } finally {
      if (wheelTimer) window.clearInterval(wheelTimer)
      if (slotsTimer) window.clearInterval(slotsTimer)
      setPlaying(null)
    }
  }

  const rouletteHistory = useMemo(() => history.filter((entry) => entry.game === 'roulette').slice(0, 8), [history])

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>CASINO</p>
          <h1>{t('casino.title')}</h1>
          <p className={styles.subtitle}>{t('casino.subtitle', { defaultValue: 'Play server-authoritative games, win credits, and unlock real shop discounts.' })}</p>
        </div>
        <div className={styles.balance}>
          <Coins size={18} strokeWidth={1.7} />
          <strong>{credits.toFixed(0)}</strong>
          <span>{t('casino.credits', { defaultValue: 'credits' })}</span>
        </div>
      </section>

      <div className={styles.controlBar}>
        <label>
          <span>{t('casino.bet')}</span>
          <input type="number" min="10" value={bet} onChange={(event) => setBet(event.target.value)} />
        </label>
        <button type="button" className={styles.secondaryButton} onClick={() => void loadCasino()}>
          <RotateCcw size={16} strokeWidth={1.7} />
          {t('common.refresh', { defaultValue: 'Refresh' })}
        </button>
      </div>

      {error ? <div className={styles.notice}>{error}</div> : null}
      {result ? <div className={styles.result}>{result.game.toUpperCase()}: {result.reward}</div> : null}
      {loading ? <div className={styles.notice}>{t('common.loading')}</div> : null}

      <section className={styles.primaryCard}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>MAIN GAME</p>
            <h2>Wheel of Fortune</h2>
          </div>
          <button className={styles.primaryButton} disabled={playing !== null} onClick={() => void play('wheel')} type="button">
            <Sparkles size={16} strokeWidth={1.7} />
            {playing === 'wheel' ? t('common.loading') : t('casino.spin', { defaultValue: 'Spin' })}
          </button>
        </div>
        <div className={styles.wheel}>
          {WHEEL_SEGMENTS.map((segment, index) => (
            <div key={segment} className={`${styles.segment} ${index === wheelIndex ? styles.segmentActive : ''}`}>{segment.replace('discount_', '').replace('credits_', '')}</div>
          ))}
        </div>
      </section>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <h3>Fruit Slots</h3>
            <button className={styles.primaryButton} disabled={playing !== null} onClick={() => void play('slots')} type="button">
              {playing === 'slots' ? t('common.loading') : t('casino.spin', { defaultValue: 'Spin' })}
            </button>
          </div>
          <div className={styles.slots}>
            {slotSymbols.map((symbol, index) => <div key={`${symbol}-${index}`} className={styles.slot}>{symbol}</div>)}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <h3>Roulette</h3>
            <button
              className={styles.primaryButton}
              disabled={playing !== null}
              onClick={() =>
                void play('roulette', rouletteBet === 'number' ? { betType: rouletteBet, value: rouletteNumber } : { betType: rouletteBet })
              }
              type="button"
            >
              {playing === 'roulette' ? t('common.loading') : t('casino.spin', { defaultValue: 'Spin' })}
            </button>
          </div>
          <div className={styles.betGrid}>
            {ROULETTE_BETS.map((value) => (
              <button key={value} className={`${styles.betChip} ${rouletteBet === value ? styles.betChipActive : ''}`} onClick={() => setRouletteBet(value)} type="button">
                {value}
              </button>
            ))}
            <button className={`${styles.betChip} ${rouletteBet === 'number' ? styles.betChipActive : ''}`} onClick={() => setRouletteBet('number')} type="button">
              number
            </button>
            {rouletteBet === 'number' ? <input className={styles.numberInput} type="number" min="0" max="36" value={rouletteNumber} onChange={(event) => setRouletteNumber(event.target.value)} /> : null}
          </div>
          <div className={styles.historyRow}>
            {rouletteHistory.map((entry) => <span key={entry.id} className={styles.historyChip}>{entry.outcomeValue}</span>)}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <h3>Lucky Chest</h3>
            <Shield size={16} strokeWidth={1.7} />
          </div>
          <div className={styles.chests}>
            {Array.from({ length: 6 }).map((_, index) => (
              <button key={index} className={styles.chest} disabled={playing !== null} onClick={() => void play('chest', { chestIndex: index })} type="button">
                CHEST {index + 1}
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <h3>{t('profile.rewards', { defaultValue: 'My rewards' })}</h3>
          <Trophy size={16} strokeWidth={1.7} />
        </div>
        <div className={styles.rewardList}>
          {rewards.length === 0 ? <span className={styles.emptyInline}>{t('profile.noRewards', { defaultValue: 'No rewards yet.' })}</span> : null}
          {rewards.slice(0, 6).map((reward) => (
            <div key={reward.id} className={styles.rewardCard}>
              <strong>{rewardLabel(reward)}</strong>
              <span>{reward.game}</span>
              <span>{reward.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <h3>{t('casino.history')}</h3>
          <Disc3 size={16} strokeWidth={1.7} />
        </div>
        <div className={styles.historyList}>
          {history.map((entry) => (
            <div key={entry.id} className={styles.historyItem}>
              <div>
                <strong>{entry.game}</strong>
                <span>{new Date(entry.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <span>{historyReward(entry)}</span>
                <strong>{entry.netChange >= 0 ? '+' : ''}{entry.netChange}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
