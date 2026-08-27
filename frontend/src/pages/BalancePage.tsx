import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, Copy, RefreshCw, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { getErrorMessage } from '../lib/errors'
import type { Balance, DepositRequest, DepositWallet } from '../types'
import { formatCurrency } from '../lib/format'
import i18n from '../lib/i18n'
import type { Language } from '../types'
import styles from './BalancePage.module.css'

type TopupStep = 'amount' | 'network' | 'address' | 'txhash' | 'submitted'

const PRESET_AMOUNTS = [5, 10, 25, 50, 100]

function statusIcon(status: DepositRequest['status']) {
  if (status === 'confirmed') return <CheckCircle2 size={14} strokeWidth={1.8} style={{ color: '#38a169', flexShrink: 0 }} />
  if (status === 'rejected') return <XCircle size={14} strokeWidth={1.8} style={{ color: '#e53e3e', flexShrink: 0 }} />
  return <Clock size={14} strokeWidth={1.8} style={{ color: '#d97706', flexShrink: 0 }} />
}

export default function BalancePage() {
  const { t } = useTranslation()
  const language = i18n.language as Language
  const [balance, setBalance] = useState<Balance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Topup flow
  const [topupOpen, setTopupOpen] = useState(false)
  const [topupStep, setTopupStep] = useState<TopupStep>('amount')
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [wallets, setWallets] = useState<DepositWallet[]>([])
  const [commissionPct, setCommissionPct] = useState(0)
  const [walletsLoading, setWalletsLoading] = useState(false)
  const [walletsError, setWalletsError] = useState<string | null>(null)
  const [selectedWallet, setSelectedWallet] = useState<DepositWallet | null>(null)
  const [currentDeposit, setCurrentDeposit] = useState<DepositRequest | null>(null)
  const [txHash, setTxHash] = useState('')
  const [txSubmitting, setTxSubmitting] = useState(false)
  const [txError, setTxError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [deposits, setDeposits] = useState<DepositRequest[]>([])

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function loadBalance() {
    try {
      setLoading(true)
      setError(null)
      const [balanceResponse, depositsResponse] = await Promise.all([
        api.getBalance(),
        api.getMyDeposits().catch(() => ({ deposits: [], commissionPct: 0 })),
      ])
      setBalance(balanceResponse.balance)
      setDeposits(depositsResponse.deposits)
      setCommissionPct(depositsResponse.commissionPct)
    } catch (loadError) {
      setError(getErrorMessage(loadError, t, 'request_failed'))
      setBalance(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBalance()
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  function effectiveAmount() {
    const raw = selectedAmount ?? (customAmount ? Number(customAmount) : 0)
    return Number.isFinite(raw) && raw > 0 ? raw : null
  }

  function creditedAmount(usdt: number) {
    return Number((usdt * (1 - commissionPct / 100)).toFixed(2))
  }

  async function openTopup() {
    setTopupOpen(true)
    setTopupStep('amount')
    setSelectedAmount(null)
    setCustomAmount('')
    setSelectedWallet(null)
    setCurrentDeposit(null)
    setTxHash('')
    setTxError(null)

    if (wallets.length === 0) {
      try {
        setWalletsLoading(true)
        setWalletsError(null)
        const response = await api.getDepositWallets()
        setWallets(response.wallets)
        setCommissionPct(response.commissionPct)
      } catch (walletError) {
        setWalletsError(getErrorMessage(walletError, t, 'request_failed'))
      } finally {
        setWalletsLoading(false)
      }
    }
  }

  function closeTopup() {
    setTopupOpen(false)
  }

  async function onSelectNetwork(wallet: DepositWallet) {
    const amount = effectiveAmount()
    if (!amount) return
    setSelectedWallet(wallet)

    try {
      setWalletsError(null)
      const response = await api.createDepositRequest(wallet.id, amount)
      setCurrentDeposit(response.deposit)
      setTopupStep('address')
    } catch (createError) {
      setWalletsError(getErrorMessage(createError, t, 'request_failed'))
    }
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: ignore
    }
  }

  async function submitTxHash() {
    if (!currentDeposit || !txHash.trim()) return
    try {
      setTxSubmitting(true)
      setTxError(null)
      const response = await api.submitDepositTxHash(currentDeposit.id, txHash.trim())
      setCurrentDeposit(response.deposit)
      setDeposits((prev) => [response.deposit, ...prev.filter((d) => d.id !== response.deposit.id)])
      setTopupStep('submitted')
    } catch (submitError) {
      setTxError(getErrorMessage(submitError, t, 'request_failed'))
    } finally {
      setTxSubmitting(false)
    }
  }

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>

  if (!balance) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{t('balance.title', { defaultValue: 'Balance' })}</h1>
        <div className={styles.section}>
          <p className={styles.errorRow}>
            <AlertCircle size={16} strokeWidth={1.8} />
            <span>{error ?? t('errors.request_failed')}</span>
          </p>
          <button className={styles.customBtn} onClick={() => void loadBalance()} type="button">
            <RefreshCw size={16} strokeWidth={1.5} />
            {t('common.retry', { defaultValue: 'Retry' })}
          </button>
        </div>
      </div>
    )
  }

  // Topup multi-step view
  if (topupOpen) {
    const amount = effectiveAmount()

    return (
      <div className={styles.page}>
        <div className={styles.topupHeader}>
          <button className={styles.backBtn} onClick={topupStep === 'amount' ? closeTopup : () => setTopupStep(topupStep === 'network' ? 'amount' : topupStep === 'address' ? 'network' : 'amount')} type="button">
            <ArrowLeft size={20} strokeWidth={1.8} />
          </button>
          <h1 className={styles.title} style={{ margin: 0 }}>
            {topupStep === 'amount' && t('balance.topupTitle', { defaultValue: 'Top up balance' })}
            {topupStep === 'network' && t('balance.selectNetwork', { defaultValue: 'Select network' })}
            {topupStep === 'address' && t('balance.sendUsdt', { defaultValue: 'Send USDT' })}
            {topupStep === 'txhash' && t('balance.confirmPayment', { defaultValue: 'Confirm payment' })}
            {topupStep === 'submitted' && t('balance.requestSent', { defaultValue: 'Request sent' })}
          </h1>
        </div>

        {/* STEP 1: Amount */}
        {topupStep === 'amount' && (
          <div className={styles.section}>
            <p className={styles.txComment}>{t('balance.selectAmount', { defaultValue: 'Select the amount in USDT you want to deposit' })}</p>
            <div className={styles.amounts}>
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  className={`${styles.amountBtn} ${selectedAmount === preset ? styles.amountBtnActive : ''}`}
                  onClick={() => { setSelectedAmount(preset); setCustomAmount('') }}
                  type="button"
                >
                  ${preset}
                </button>
              ))}
            </div>
            <div className={styles.customRow}>
              <input
                className={styles.customInput}
                type="number"
                min="1"
                step="1"
                placeholder={t('balance.customAmount', { defaultValue: 'Custom amount' })}
                value={customAmount}
                onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null) }}
              />
            </div>

            {amount && commissionPct > 0 && (
              <div className={styles.feeBox}>
                <div className={styles.feeRow}>
                  <span>{t('balance.amountToSend', { defaultValue: 'You send' })}</span>
                  <span>${amount} USDT</span>
                </div>
                <div className={styles.feeRow}>
                  <span>{t('balance.commission', { defaultValue: 'Commission' })} ({commissionPct}%)</span>
                  <span>−${(amount * commissionPct / 100).toFixed(2)}</span>
                </div>
                <div className={`${styles.feeRow} ${styles.feeTotal}`}>
                  <span>{t('balance.youReceive', { defaultValue: 'You receive' })}</span>
                  <span>${creditedAmount(amount)}</span>
                </div>
              </div>
            )}

            {walletsLoading ? (
              <div className={styles.loading} style={{ padding: '16px 0' }}><div className={styles.spinner} /></div>
            ) : (
              <button
                className={styles.primaryBtn}
                disabled={!amount || amount < 1}
                onClick={() => setTopupStep('network')}
                type="button"
              >
                {t('common.next', { defaultValue: 'Next' })}
              </button>
            )}
          </div>
        )}

        {/* STEP 2: Network */}
        {topupStep === 'network' && (
          <div className={styles.section}>
            {walletsError && (
              <p className={styles.errorRow}><AlertCircle size={14} /><span>{walletsError}</span></p>
            )}
            {wallets.length === 0 && !walletsLoading ? (
              <p className={styles.txComment}>{t('balance.noWallets', { defaultValue: 'No deposit wallets configured. Please contact support.' })}</p>
            ) : (
              <div className={styles.walletList}>
                {wallets.map((wallet) => (
                  <button
                    key={wallet.id}
                    className={styles.walletCard}
                    onClick={() => void onSelectNetwork(wallet)}
                    type="button"
                  >
                    <div className={styles.walletName}>{wallet.displayName ?? wallet.title}</div>
                    <div className={styles.walletNetwork}>{wallet.asset} · {wallet.network}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Address */}
        {topupStep === 'address' && currentDeposit && selectedWallet && (
          <div className={styles.section}>
            <div className={styles.warningBox}>
              <AlertCircle size={16} strokeWidth={1.8} style={{ flexShrink: 0 }} />
              <span>{t('balance.networkWarning', { network: selectedWallet.network ?? selectedWallet.asset ?? '', defaultValue: 'Send only {{network}} to this address. Sending other assets will result in permanent loss.' })}</span>
            </div>

            <div className={styles.addressBox}>
              <span className={styles.addressLabel}>{t('balance.walletAddress', { defaultValue: 'Deposit address' })}</span>
              <span className={styles.addressValue}>{currentDeposit.walletAddress}</span>
              <button
                className={styles.copyBtn}
                onClick={() => void copyAddress(currentDeposit.walletAddress)}
                type="button"
              >
                <Copy size={14} strokeWidth={1.8} />
                {copied ? t('common.copied', { defaultValue: 'Copied!' }) : t('common.copy', { defaultValue: 'Copy' })}
              </button>
            </div>

            {selectedWallet.instructions && (
              <p className={styles.txComment}>{selectedWallet.instructions}</p>
            )}

            <div className={styles.feeBox}>
              <div className={styles.feeRow}>
                <span>{t('balance.amountToSend', { defaultValue: 'You send' })}</span>
                <span>${currentDeposit.amountUsdt} USDT</span>
              </div>
              {currentDeposit.commissionPct != null && currentDeposit.commissionPct > 0 && (
                <div className={styles.feeRow}>
                  <span>{t('balance.commission', { defaultValue: 'Commission' })} ({currentDeposit.commissionPct}%)</span>
                  <span>−${(currentDeposit.amountUsdt * currentDeposit.commissionPct / 100).toFixed(2)}</span>
                </div>
              )}
              <div className={`${styles.feeRow} ${styles.feeTotal}`}>
                <span>{t('balance.youReceive', { defaultValue: 'You receive' })}</span>
                <span>${currentDeposit.creditedAmount ?? currentDeposit.amountUsdt}</span>
              </div>
            </div>

            <button className={styles.primaryBtn} onClick={() => setTopupStep('txhash')} type="button">
              {t('balance.iSent', { defaultValue: 'I sent the payment' })}
            </button>
          </div>
        )}

        {/* STEP 4: TX Hash */}
        {topupStep === 'txhash' && currentDeposit && (
          <div className={styles.section}>
            <p className={styles.txComment}>
              {t('balance.txHashInfo', { defaultValue: 'Enter the transaction hash from your wallet to confirm the payment.' })}
            </p>
            <input
              className={styles.customInput}
              type="text"
              placeholder={t('balance.txHashPlaceholder', { defaultValue: 'Transaction hash (TX ID)' })}
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
            />
            {txError && <p className={styles.error}>{txError}</p>}
            <button
              className={styles.primaryBtn}
              disabled={!txHash.trim() || txSubmitting}
              onClick={() => void submitTxHash()}
              type="button"
            >
              {txSubmitting ? t('common.loading', { defaultValue: 'Loading…' }) : t('balance.submitTx', { defaultValue: 'Submit' })}
            </button>
          </div>
        )}

        {/* SUBMITTED */}
        {topupStep === 'submitted' && (
          <div className={styles.section} style={{ textAlign: 'center' }}>
            <Clock size={48} strokeWidth={1.2} style={{ color: '#d97706', margin: '0 auto 16px' }} />
            <h3 className={styles.sectionTitle}>{t('balance.pendingTitle', { defaultValue: 'Under review' })}</h3>
            <p className={styles.txComment}>
              {t('balance.pendingInfo', { defaultValue: 'Your deposit is under review. Balance will be credited after confirmation.' })}
            </p>
            <button className={styles.primaryBtn} onClick={() => { closeTopup(); void loadBalance() }} type="button">
              {t('common.done', { defaultValue: 'Done' })}
            </button>
          </div>
        )}
      </div>
    )
  }

  // Main balance view
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('balance.title', { defaultValue: 'Balance' })}</h1>

      <div className={styles.card}>
        <span className={styles.cardLabel}>{t('balance.current', { defaultValue: 'Virtual balance' })}</span>
        <span className={styles.amount}>{formatCurrency(balance.amount, language)}</span>
        <button className={styles.topupBtn} onClick={() => void openTopup()} type="button">
          {t('balance.topup', { defaultValue: 'Top up' })}
        </button>
      </div>

      <div className={styles.section}>
        <p className={styles.txComment}>
          {t('balance.shopOnlyNotice', { defaultValue: 'This is a virtual balance for use within the shop only. It cannot be withdrawn, transferred, or exchanged for real money.' })}
        </p>
      </div>

      {deposits.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('balance.myDeposits', { defaultValue: 'My deposits' })}</h3>
          <div className={styles.txList}>
            {deposits.map((dep) => (
              <div key={dep.id} className={styles.depositRow}>
                <div className={styles.depositLeft}>
                  {statusIcon(dep.status)}
                  <div>
                    <span className={styles.txType}>{dep.network} · ${dep.amountUsdt} USDT</span>
                    {dep.txHash && <span className={styles.txComment}> · {dep.txHash.slice(0, 12)}…</span>}
                  </div>
                </div>
                <span className={`${styles.txAmount} ${dep.status === 'confirmed' ? styles.txIn : dep.status === 'rejected' ? styles.txOut : ''}`}>
                  {dep.status === 'confirmed' ? `+$${dep.creditedAmount ?? dep.amountUsdt}` :
                   dep.status === 'rejected' ? t('balance.rejected', { defaultValue: 'Rejected' }) :
                   t('balance.pending', { defaultValue: 'Pending' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {balance.transactions.length > 0 ? (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('balance.history', { defaultValue: 'Transaction history' })}</h3>
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
