import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CreditCard, Gift, MapPin, User } from 'lucide-react'
import { TonConnectButton, useTonConnectUI, useTonWallet, type SendTransactionResponse } from '@tonconnect/ui-react'
import { useApp } from '../context/AppContext'
import { api } from '../api/client'
import { getErrorMessage } from '../lib/errors'
import styles from './CheckoutPage.module.css'
import { useTranslation } from 'react-i18next'
import { formatCurrency } from '../lib/format'
import { getLocalizedCityName, getLocalizedUnit } from '../lib/localized'
import i18n from '../lib/i18n'
import type { CasinoReward, DeliveryOption, Language, Order, Payment, PaymentMethod } from '../types'

function resolveTonChain(network: string | null | undefined) {
  return typeof network === 'string' && network.toLowerCase().includes('test') ? '-3' : '-239'
}

export default function CheckoutPage() {
  const { cart, user, checkout, openCityPicker } = useApp()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const language = i18n.language as Language
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([])
  const [deliveryLoading, setDeliveryLoading] = useState(true)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<number | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [paymentLoading, setPaymentLoading] = useState(true)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<number | null>(null)
  const [casinoRewards, setCasinoRewards] = useState<CasinoReward[]>([])
  const [selectedRewardId, setSelectedRewardId] = useState<number | null>(null)
  const [casinoCreditsBalance, setCasinoCreditsBalance] = useState(0)
  const [casinoCreditsToUse, setCasinoCreditsToUse] = useState('0')
  const [casinoLoadError, setCasinoLoadError] = useState<string | null>(null)
  const [discountCode, setDiscountCode] = useState('')
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [validatingDiscount, setValidatingDiscount] = useState(false)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [copied, setCopied] = useState(false)
  const [transactionHash, setTransactionHash] = useState('')
  const [senderAddress, setSenderAddress] = useState('')
  const [paymentLoadingAction, setPaymentLoadingAction] = useState(false)
  const wallet = useTonWallet()
  const [tonConnectUI] = useTonConnectUI()

  const loadDelivery = useCallback(async () => {
    try {
      setDeliveryLoading(true)
      setDeliveryError(null)
      const response = await api.getDeliveryOptions()
      setDeliveryOptions(response.options)
      setSelectedDeliveryId((prev) => prev ?? response.options[0]?.id ?? null)
    } catch (err) {
      setDeliveryError(getErrorMessage(err, t, 'request_failed'))
    } finally {
      setDeliveryLoading(false)
    }
  }, [t])

  const loadPaymentMethods = useCallback(async () => {
    try {
      setPaymentLoading(true)
      setPaymentError(null)
      const response = await api.getPaymentMethods()
      setPaymentMethods(response.methods)
      setSelectedPaymentMethodId((prev) => prev ?? response.methods[0]?.id ?? null)
    } catch (err) {
      setPaymentError(getErrorMessage(err, t, 'request_failed'))
    } finally {
      setPaymentLoading(false)
    }
  }, [t])

  const loadCasino = useCallback(async () => {
    try {
      setCasinoLoadError(null)
      const response = await api.getCasinoState()
      setCasinoRewards((response.rewards ?? []).filter((reward) => reward.rewardType === 'shop_discount' && reward.status === 'available'))
      setCasinoCreditsBalance(response.balance.credits)
    } catch (err) {
      setCasinoLoadError(getErrorMessage(err, t, 'request_failed'))
    }
  }, [t])

  useEffect(() => {
    void Promise.all([loadDelivery(), loadPaymentMethods()])
    void loadCasino()
  }, [loadCasino, loadDelivery, loadPaymentMethods])

  const selectedDelivery = useMemo(
    () => deliveryOptions.find((option) => option.id === selectedDeliveryId) ?? null,
    [deliveryOptions, selectedDeliveryId],
  )
  const selectedPaymentMethod = useMemo(
    () => paymentMethods.find((method) => method.id === selectedPaymentMethodId) ?? null,
    [paymentMethods, selectedPaymentMethodId],
  )

  const cityLabel = user?.selectedCity ? getLocalizedCityName(user.selectedCity, language) : t('profile.cityNotSelected')
  const safeSubtotal = cart?.subtotal ?? 0
  const selectedReward = casinoRewards.find((reward) => reward.id === selectedRewardId) ?? null
  const rewardDiscountAmount = selectedReward?.discountPercent ? Math.min(safeSubtotal, (safeSubtotal * selectedReward.discountPercent) / 100) : 0
  const creditEligibleTotal = useMemo(
    () => cart?.items.reduce((sum, item) => sum + (item.productCity.creditsEnabled && item.productCity.creditsPrice ? item.productCity.creditsPrice * item.quantity : 0), 0) ?? 0,
    [cart],
  )
  const requestedCasinoCredits = Math.max(0, Number(casinoCreditsToUse) || 0)
  const appliedCasinoCredits = Math.min(casinoCreditsBalance, requestedCasinoCredits, creditEligibleTotal)
  const discountedSubtotal = Math.max(0, safeSubtotal - (selectedReward ? rewardDiscountAmount : discountAmount))
  const creditDiscountAmount = creditEligibleTotal > 0 ? Math.min(discountedSubtotal, discountedSubtotal * (appliedCasinoCredits / creditEligibleTotal)) : 0
  const total = Math.max(0, discountedSubtotal - creditDiscountAmount + (selectedDelivery?.price ?? 0))

  async function applyDiscount() {
    if (!discountCode.trim() || validatingDiscount || !cart) return
    setValidatingDiscount(true)
    setDiscountError(null)
    try {
      const response = await api.validateDiscount(discountCode.trim().toUpperCase(), cart.subtotal)
      setDiscountAmount(response.discountAmount)
    } catch (err) {
      setDiscountAmount(0)
      setDiscountError(getErrorMessage(err, t, 'request_failed'))
    } finally {
      setValidatingDiscount(false)
    }
  }

  async function submitCheckout() {
    if (!cart || cart.items.length === 0 || !user?.selectedCityId || submitting) return
    if (deliveryOptions.length > 0 && !selectedDeliveryId) {
      setSubmitError(t('checkout.deliveryRequired'))
      return
    }
    if (total > 0 && !selectedPaymentMethodId) {
      setSubmitError(t('checkout.paymentRequired'))
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const createdOrder = await checkout({
        comment: comment.trim() || undefined,
        discountCode: selectedReward ? undefined : discountAmount > 0 ? discountCode.trim().toUpperCase() : undefined,
        deliveryOptionId: selectedDeliveryId ?? undefined,
        paymentMethodId: total > 0 ? selectedPaymentMethodId ?? undefined : undefined,
        rewardId: selectedRewardId ?? undefined,
        casinoCreditsToUse: appliedCasinoCredits > 0 ? appliedCasinoCredits : undefined,
      })
      setOrder(createdOrder)
      if (createdOrder.total > 0) {
        try {
          const paymentResponse = await api.createOrderPayment(createdOrder.id)
          setPayment(paymentResponse.payment)
        } catch (paymentError) {
          setSubmitError(getErrorMessage(paymentError, t, 'request_failed'))
        }
      }
    } catch (err) {
      setSubmitError(getErrorMessage(err, t, 'checkout_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  async function refreshPayment() {
    if (!payment) return
    setPaymentLoadingAction(true)
    setSubmitError(null)
    try {
      const response = await api.getPayment(payment.id)
      setPayment(response.payment)
    } catch (err) {
      setSubmitError(getErrorMessage(err, t, 'request_failed'))
    } finally {
      setPaymentLoadingAction(false)
    }
  }

  async function submitCryptoEvidence() {
    if (!payment || markingPaid) return
    setMarkingPaid(true)
    setSubmitError(null)
    try {
      const response = await api.submitCryptoPayment(payment.id, {
        transactionHash: transactionHash.trim() || undefined,
        senderAddress: senderAddress.trim() || undefined,
      })
      setPayment(response.payment)
    } catch (err) {
      setSubmitError(getErrorMessage(err, t, 'request_failed'))
    } finally {
      setMarkingPaid(false)
    }
  }

  async function sendTonPayment() {
    if (!payment || !selectedPaymentMethod?.walletAddress || !payment.expiresAt) return
    setPaymentLoadingAction(true)
    setSubmitError(null)
    try {
      const amountNano = String(Math.round(payment.amount * 1_000_000_000))
      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(new Date(payment.expiresAt).getTime() / 1000),
        network: resolveTonChain(payment.network ?? selectedPaymentMethod?.network),
        messages: [
          {
            address: selectedPaymentMethod.walletAddress,
            amount: amountNano,
          },
        ],
      })
      const response = await api.submitCryptoPayment(payment.id, {
        senderAddress: wallet?.account.address,
        tonConnectBoc: (result as SendTransactionResponse).boc,
      })
      setPayment(response.payment)
    } catch (err) {
      setSubmitError(getErrorMessage(err, t, 'request_failed'))
    } finally {
      setPaymentLoadingAction(false)
    }
  }

  if (order) {
    const method = payment?.paymentMethod ?? order.paymentMethod
    const isCryptoLike = method?.type === 'crypto'
    const canShowCryptoAddress = Boolean(isCryptoLike && payment?.network && payment?.recipient)
    const isTonPayment = Boolean(isCryptoLike && method?.isTonConnectEnabled && payment?.network?.toUpperCase() === 'TON')
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t('checkout.paymentTitle')}</h1>
        </div>

        <div className={styles.card}>
          <p className={styles.sectionTitle}>{t('checkout.successTitle')}</p>
          <p className={styles.value}>{t('checkout.successText')}</p>
          <div className={styles.sectionDivider} />
          <p className={styles.sectionTitle}>{t('orders.orderTitle', { id: order.id })}</p>
          <div className={styles.infoRow}>
            <MapPin size={14} strokeWidth={1.6} />
            <span>{language === 'en' && order.city.nameEn ? order.city.nameEn : order.city.name}</span>
          </div>
          <div className={styles.infoRow}>
            <User size={14} strokeWidth={1.6} />
            <span>{user?.firstName ?? t('profile.defaultName')}</span>
          </div>
          <div className={styles.line}>
            <span>{t('cart.orderTotal')}</span>
            <span>{formatCurrency(order.total, language)}</span>
          </div>
          <div className={styles.sectionDivider} />
          <p className={styles.sectionTitle}>{t('checkout.items')}</p>
          {order.items.map((item) => (
            <div key={item.id} className={styles.line}>
              <span>{item.productName} × {item.quantity} {getLocalizedUnit(item.unit, language)}</span>
              <span>{formatCurrency(item.lineTotal, language)}</span>
            </div>
          ))}
          <div className={styles.sectionDivider} />
          <div className={styles.line}>
            <span>{t('cart.items', { count: order.items.length })}</span>
            <span>{formatCurrency(order.subtotal, language)}</span>
          </div>
          {order.discountAmount > 0 ? (
            <div className={styles.line}>
              <span>{t('cart.discount')}{order.discount ? ` (${order.discount.code})` : order.reward ? ` (${order.reward.discountPercent}% OFF)` : ''}</span>
              <span>−{formatCurrency(order.discountAmount, language)}</span>
            </div>
          ) : null}
          {(order.casinoCreditsUsed ?? 0) > 0 ? (
            <div className={styles.line}>
              <span>{t('checkout.casinoCredits', { defaultValue: 'Casino Credits' })}</span>
              <span>−{(order.casinoCreditsUsed ?? 0).toFixed(0)}</span>
            </div>
          ) : null}
          <div className={styles.line}>
            <span>{t('cart.delivery')}</span>
            <span>{formatCurrency(order.deliveryFee, language)}</span>
          </div>
          {method && (
            <div className={styles.line}>
              <span>{t('checkout.paymentMethod')}</span>
              <span>{method.title}</span>
            </div>
          )}
          {method?.currency && (
            <div className={styles.line}>
              <span>{t('checkout.currency')}</span>
              <span>{method.currency}</span>
            </div>
          )}
          {payment && <div className={styles.line}><span>{t('checkout.paymentStatus', { defaultValue: 'Payment status' })}</span><span>{payment.status}</span></div>}
          {canShowCryptoAddress && (
            <>
              <div className={styles.line}><span>{t('checkout.asset', { defaultValue: 'Asset' })}</span><span>{payment?.asset ?? payment?.currency ?? '—'}</span></div>
              <div className={styles.line}><span>{t('checkout.network')}</span><span>{payment?.network}</span></div>
              <div className={styles.line}><span>{t('checkout.walletAddress')}</span><span>{payment?.recipient}</span></div>
              <div className={styles.line}><span>{t('checkout.amount', { defaultValue: 'Amount' })}</span><span>{payment?.amount}</span></div>
              <button className={styles.secondaryBtn} type="button" onClick={() => payment?.recipient && void copyAddress(payment.recipient)}>
                {copied ? t('checkout.copiedAddress') : t('checkout.copyAddress')}
              </button>
              {method?.instructions ? <p className={styles.value}>{method.instructions}</p> : null}
              <p className={styles.error}>{t('checkout.cryptoMissingNetwork', { defaultValue: 'Send only on the specified network.' })}</p>
            </>
          )}
          {isCryptoLike && !canShowCryptoAddress && (
            <p className={styles.error}>{t('checkout.cryptoMissingNetwork')}</p>
          )}
          {method?.type === 'card' && payment?.checkoutUrl && (
            <button className={styles.primaryBtn} onClick={() => window.open(payment.checkoutUrl ?? '', '_blank', 'noopener,noreferrer')} type="button">
              {t('checkout.confirm', { defaultValue: 'Pay now' })}
            </button>
          )}
          {isTonPayment && (
            <>
              <TonConnectButton />
              <p className={styles.value}>{wallet ? wallet.account.address : t('checkout.notSelected')}</p>
              <button className={styles.primaryBtn} onClick={() => void sendTonPayment()} disabled={!wallet || paymentLoadingAction} type="button">
                {paymentLoadingAction ? t('common.loading') : t('checkout.confirm', { defaultValue: 'Send TON payment' })}
              </button>
            </>
          )}
          {isCryptoLike && !isTonPayment && payment?.status === 'pending' && (
            <>
              <input className={styles.input} placeholder={t('checkout.transactionHash', { defaultValue: 'Transaction hash' })} value={transactionHash} onChange={(event) => setTransactionHash(event.target.value)} />
              <input className={styles.input} placeholder={t('checkout.senderAddress', { defaultValue: 'Sender address (optional)' })} value={senderAddress} onChange={(event) => setSenderAddress(event.target.value)} />
              <button className={styles.primaryBtn} onClick={() => void submitCryptoEvidence()} disabled={markingPaid} type="button">
                {markingPaid ? t('common.loading') : t('checkout.iPaid')}
              </button>
            </>
          )}
          <p className={styles.value}>
            {order.total <= 0
              ? t('checkout.paymentVerified', { defaultValue: 'Payment verified.' })
              : payment?.status === 'paid'
              ? t('checkout.paymentVerified', { defaultValue: 'Payment verified.' })
              : payment?.status === 'failed'
                ? t('checkout.paymentFailed', { defaultValue: 'Payment failed. Please contact support or try again.' })
                : payment?.status === 'processing'
                  ? t('checkout.paymentPending')
                  : t('checkout.waitingForPayment')}
          </p>
          {submitError && <p className={styles.error}>{submitError}</p>}
          <button className={styles.secondaryBtn} onClick={() => void refreshPayment()} disabled={!payment || paymentLoadingAction} type="button">
            {paymentLoadingAction ? t('common.loading') : t('common.refresh', { defaultValue: 'Refresh payment status' })}
          </button>
          <div className={styles.actionGroup}>
            <button className={styles.secondaryBtn} onClick={() => navigate(`/orders/${order.id}`)} type="button">
              {t('checkout.viewOrder')}
            </button>
            <button className={styles.secondaryBtn} onClick={() => navigate('/orders')} type="button">
              {t('checkout.viewOrders')}
            </button>
            <button className={styles.secondaryBtn} onClick={() => navigate('/profile')} type="button">
              {t('checkout.goToProfile')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className={styles.empty}>
        <h1 className={styles.title}>{t('checkout.title')}</h1>
        <p className={styles.emptyText}>{t('cart.empty')}</p>
        <button className={styles.primaryBtn} onClick={() => navigate('/catalog')} type="button">
          {t('cart.continueShopping')}
        </button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/shop/cart')} type="button">
          <ArrowLeft size={16} strokeWidth={1.8} />
          {t('common.back')}
        </button>
        <h1 className={styles.title}>{t('checkout.title')}</h1>
      </div>

      <div className={styles.card}>
        <p className={styles.label}>{t('profile.city')}</p>
        <div className={styles.infoRow}>
          <MapPin size={14} strokeWidth={1.6} />
          <span>{cityLabel}</span>
        </div>
        {!user?.selectedCityId ? (
          <button className={styles.secondaryBtn} onClick={openCityPicker} type="button">
            {t('checkout.selectCity')}
          </button>
        ) : null}
      </div>

      <div className={styles.card}>
        <p className={styles.label}>{t('checkout.customerInfo')}</p>
        <div className={styles.infoRow}>
          <User size={14} strokeWidth={1.6} />
          <span>{user?.firstName ?? t('profile.defaultName')}</span>
        </div>
        {user?.username ? <p className={styles.value}>@{user.username}</p> : null}
      </div>

      <div className={styles.card}>
        <p className={styles.sectionTitle}>{t('checkout.items')}</p>
        {cart.items.map((item) => (
          <div key={item.id} className={styles.line}>
            <span>{item.productCity.name} × {item.quantity} {getLocalizedUnit(item.productCity.unit, language, item.productCity.unitTranslations)}</span>
            <span>{formatCurrency(item.lineTotal, language)}</span>
          </div>
        ))}
      </div>

      <div className={styles.card}>
        <p className={styles.sectionTitle}>{t('cart.discountCode')}</p>
        <div className={styles.discountRow}>
          <input
            className={styles.input}
            value={discountCode}
            onChange={(event) => {
              setDiscountCode(event.target.value.toUpperCase())
              setDiscountAmount(0)
              setDiscountError(null)
            }}
            placeholder={t('cart.discountCode')}
          />
          <button className={styles.secondaryBtn} onClick={() => void applyDiscount()} disabled={validatingDiscount || !discountCode} type="button">
            {t('cart.applyCode')}
          </button>
        </div>
        {discountError && <p className={styles.error}>{discountError}</p>}
      </div>

      <div className={styles.card}>
        <p className={styles.sectionTitle}>{t('profile.rewards', { defaultValue: 'My rewards' })}</p>
        <div className={styles.infoRow}>
          <Gift size={14} strokeWidth={1.6} />
          <span>{selectedReward ? `${selectedReward.discountPercent}% OFF` : t('checkout.notSelected')}</span>
        </div>
        {casinoRewards.map((reward) => (
          <label key={reward.id} className={styles.option}>
            <input
              type="radio"
              checked={selectedRewardId === reward.id}
              onChange={() => {
                setSelectedRewardId(reward.id)
                setDiscountAmount(0)
                setDiscountError(null)
              }}
              name="reward"
            />
            <span>{reward.discountPercent}% OFF</span>
            <span>{reward.expiresAt ? new Date(reward.expiresAt).toLocaleDateString() : reward.status}</span>
          </label>
        ))}
        {selectedRewardId ? (
          <button className={styles.secondaryBtn} onClick={() => setSelectedRewardId(null)} type="button">
            {t('common.clear', { defaultValue: 'Clear' })}
          </button>
        ) : null}
        {casinoLoadError ? <p className={styles.error}>{casinoLoadError}</p> : null}
      </div>

      <div className={styles.card}>
        <p className={styles.sectionTitle}>{t('checkout.casinoCredits', { defaultValue: 'Casino Credits' })}</p>
        <div className={styles.infoRow}>
          <CreditCard size={14} strokeWidth={1.6} />
          <span>{casinoCreditsBalance.toFixed(0)} {t('checkout.available', { defaultValue: 'available' })}</span>
        </div>
        <input
          className={styles.input}
          type="number"
          min="0"
          max={Math.min(casinoCreditsBalance, creditEligibleTotal)}
          value={casinoCreditsToUse}
          onChange={(event) => setCasinoCreditsToUse(event.target.value)}
          placeholder={t('checkout.casinoCreditsUse', { defaultValue: 'Credits to apply' })}
        />
        {creditEligibleTotal <= 0 ? <p className={styles.value}>{t('checkout.casinoCreditsUnavailable', { defaultValue: 'This cart is not eligible for casino credit purchases.' })}</p> : null}
        {casinoLoadError ? <button className={styles.secondaryBtn} onClick={() => void loadCasino()} type="button">{t('common.retry')}</button> : null}
      </div>

      <div className={styles.card}>
        <p className={styles.sectionTitle}>{t('cart.deliveryOption')}</p>
        {deliveryLoading && <p className={styles.value}>{t('common.loading')}</p>}
        {deliveryError && (
          <div className={styles.errorRow}>
            <p className={styles.error}>{deliveryError}</p>
            <button className={styles.secondaryBtn} onClick={() => void loadDelivery()} type="button">
              {t('common.retry')}
            </button>
          </div>
        )}
        {!deliveryLoading && !deliveryError && deliveryOptions.length === 0 && (
          <p className={styles.value}>{t('checkout.noDeliveryOptions')}</p>
        )}
        {deliveryOptions.map((option) => (
          <label key={option.id} className={styles.option}>
            <input
              type="radio"
              checked={selectedDeliveryId === option.id}
              onChange={() => setSelectedDeliveryId(option.id)}
              name="delivery"
            />
            <span>{language === 'en' && option.nameEn ? option.nameEn : option.name}</span>
            <span>{option.price > 0 ? formatCurrency(option.price, language) : t('cart.free')}</span>
          </label>
        ))}
      </div>

      <div className={styles.card}>
        <p className={styles.sectionTitle}>{t('checkout.paymentMethod')}</p>
        <div className={styles.infoRow}>
          <CreditCard size={14} strokeWidth={1.6} />
          <span>{selectedPaymentMethod?.title ?? t('checkout.notSelected')}</span>
        </div>
        {paymentLoading && <p className={styles.value}>{t('common.loading')}</p>}
        {paymentError && (
          <div className={styles.errorRow}>
            <p className={styles.error}>{paymentError}</p>
            <button className={styles.secondaryBtn} onClick={() => void loadPaymentMethods()} type="button">
              {t('common.retry')}
            </button>
          </div>
        )}
        {!paymentLoading && !paymentError && paymentMethods.length === 0 && (
          <p className={styles.value}>{t('checkout.noPaymentMethods')}</p>
        )}
        {total <= 0 ? <p className={styles.value}>{t('checkout.paymentOptional', { defaultValue: 'External payment is not required when credits cover the order.' })}</p> : null}
        {paymentMethods.map((method) => (
          <label key={method.id} className={styles.option}>
            <input
              type="radio"
              checked={selectedPaymentMethodId === method.id}
              onChange={() => setSelectedPaymentMethodId(method.id)}
              name="payment"
            />
            <span>{method.title}</span>
            <span>{method.type === 'card' ? (method.provider ?? 'CARD') : [method.asset ?? method.currency, method.network].filter(Boolean).join(' • ')}</span>
          </label>
        ))}
      </div>

      <div className={styles.card}>
        <p className={styles.sectionTitle}>{t('checkout.comment')}</p>
        <textarea
          className={styles.textarea}
          placeholder={t('checkout.commentPlaceholder')}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
        />
      </div>

      <div className={styles.card}>
        <div className={styles.line}><span>{t('cart.items', { count: cart.items.length })}</span><span>{formatCurrency(safeSubtotal, language)}</span></div>
        {(selectedReward ? rewardDiscountAmount : discountAmount) > 0 && <div className={styles.line}><span>{t('cart.discount')}</span><span>−{formatCurrency(selectedReward ? rewardDiscountAmount : discountAmount, language)}</span></div>}
        {appliedCasinoCredits > 0 && <div className={styles.line}><span>{t('checkout.casinoCredits', { defaultValue: 'Casino Credits' })}</span><span>−{appliedCasinoCredits.toFixed(0)}</span></div>}
        <div className={styles.line}><span>{t('cart.delivery')}</span><span>{selectedDelivery ? formatCurrency(selectedDelivery.price, language) : t('checkout.notSelected')}</span></div>
        <div className={styles.total}><span>{t('cart.orderTotal')}</span><span>{formatCurrency(total, language)}</span></div>
        {submitError && <p className={styles.error}>{submitError}</p>}
        <button className={styles.primaryBtn} onClick={() => void submitCheckout()} disabled={submitting || (total > 0 && paymentMethods.length === 0)} type="button">
          {submitting ? t('cart.checkingOut') : t('checkout.confirm')}
        </button>
      </div>
    </div>
  )
}
