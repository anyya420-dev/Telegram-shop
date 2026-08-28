import { useEffect, useState } from 'react'
import { AlertCircle, ArrowLeft, Heart, Package, RefreshCw } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { getErrorMessage } from '../lib/errors'
import type { WishlistItem } from '../types'
import { formatCurrency } from '../lib/format'
import i18n from '../lib/i18n'
import type { Language } from '../types'
import styles from './WishlistPage.module.css'
import { safeNavigateBack } from '../lib/navigation'

export default function WishlistPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const language = i18n.language as Language
  const [items, setItems] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<number | null>(null)

  async function loadWishlist() {
    try {
      setLoading(true)
      setError(null)
      const response = await api.getWishlist()
      setItems(response.items)
    } catch (loadError) {
      setError(getErrorMessage(loadError, t, 'request_failed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadWishlist()
  }, [])

  async function handleRemove(productCityId: number) {
    if (removingId) {
      return
    }

    try {
      setRemovingId(productCityId)
      setError(null)
      await api.removeFromWishlist(productCityId)
      setItems((prev) => prev.filter((item) => item.product.productCityId !== productCityId))
    } catch (removeError) {
      setError(getErrorMessage(removeError, t, 'request_failed'))
    } finally {
      setRemovingId(null)
    }
  }

  function handleBack() {
    safeNavigateBack(navigate, `${location.pathname}${location.search}`, '/profile')
  }

  if (loading) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={handleBack} type="button">
          <ArrowLeft size={16} strokeWidth={1.8} />
          {t('common.back')}
        </button>
        <h1 className={styles.title}>{t('wishlist.title')}</h1>
      </div>

      {error ? (
        <div className={styles.empty}>
          <p className={styles.emptyIcon}><AlertCircle size={32} strokeWidth={1.5} /></p>
          <p>{error}</p>
          <button className={styles.shopBtn} onClick={() => void loadWishlist()} type="button">
            <RefreshCw size={16} strokeWidth={1.5} />
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyIcon}><Heart size={32} strokeWidth={1.5} /></p>
          <p>{t('wishlist.empty')}</p>
          <button className={styles.shopBtn} onClick={() => navigate('/shop')} type="button">{t('wishlist.goToShop')}</button>
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => {
            const product = item.product
            const removing = removingId === product.productCityId

            return (
              <div key={item.id} className={styles.card} onClick={() => navigate(`/shop/product/${product.id}`)}>
                <div className={styles.img}>
                  {product.image ? <img src={product.image} alt={product.name} /> : <Package size={24} strokeWidth={1.5} />}
                </div>
                <div className={styles.info}>
                  <p className={styles.name}>{product.name}</p>
                  <p className={styles.price}>{formatCurrency(product.price, language)}</p>
                </div>
                <button
                  className={styles.removeBtn}
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleRemove(product.productCityId)
                  }}
                  disabled={removingId !== null}
                  type="button"
                >
                  {removing ? <RefreshCw size={18} strokeWidth={1.5} /> : <Heart size={18} strokeWidth={1.5} fill="currentColor" />}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
