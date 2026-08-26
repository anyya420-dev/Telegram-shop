import { useCallback, useEffect, useState } from 'react'
import { MapPin, Package, RefreshCw, Search, ShoppingBag } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApp } from '../context/AppContext'
import ProductCard from '../components/ProductCard/ProductCard'
import { getErrorMessage } from '../lib/errors'
import styles from './ShopPage.module.css'
import { getLocalizedCategoryName, getLocalizedCityName } from '../lib/localized'
import i18n from '../lib/i18n'
import type { Language } from '../types'

export default function ShopPage() {
  const { user, categories, products, cart, refreshCatalog, openCityPicker } = useApp()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const language = i18n.language as Language
  const [activeCategoryId, setActiveCategoryId] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  const loadProducts = useCallback(async (nextSearch = search, nextCategoryId = activeCategoryId) => {
    try {
      setLoading(true)
      setPageError(null)
      await refreshCatalog(nextSearch, nextCategoryId)
    } catch (error) {
      setPageError(getErrorMessage(error, t, 'catalog_refresh_failed'))
    } finally {
      setLoading(false)
    }
  }, [activeCategoryId, refreshCatalog, search, t])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  const cartCount = cart?.items.length ?? 0

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{t('shop.title')}</h1>
          <button className={styles.city} onClick={openCityPicker} type="button">
            <MapPin size={14} strokeWidth={1.5} /> {user?.selectedCity ? getLocalizedCityName(user.selectedCity, language) : t('checkout.selectCity')}
          </button>
        </div>
        <button
          className={styles.cartBtn}
          onClick={() => navigate('/shop/cart')}
          aria-label={t('nav.cart')}
          type="button"
        >
          <ShoppingBag size={20} strokeWidth={1.75} />
          {cartCount > 0 ? <span className={styles.cartBadge}>{cartCount}</span> : null}
        </button>
      </div>

      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          type="text"
          placeholder={t('shop.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void loadProducts()}
        />
      </div>

      <>
        {!user?.selectedCityId ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <MapPin size={28} strokeWidth={1.5} />
            </div>
            <p>{t('city.subtitle')}</p>
          </div>
        ) : null}
          <div className={styles.categories}>
            <button
              className={`${styles.catBtn} ${activeCategoryId === 'all' ? styles.catActive : ''}`}
              onClick={() => {
                setActiveCategoryId('all')
                void loadProducts(search, 'all')
              }}
              type="button"
            >
              {t('shop.allCategories')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`${styles.catBtn} ${activeCategoryId === cat.id ? styles.catActive : ''}`}
                onClick={() => {
                  setActiveCategoryId(cat.id)
                  void loadProducts(search, cat.id)
                }}
                type="button"
              >
                {getLocalizedCategoryName(cat, language)}
              </button>
            ))}
          </div>

          {pageError ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <RefreshCw size={28} strokeWidth={1.5} />
              </div>
              <p>{pageError}</p>
              <button className={styles.catBtn} onClick={() => void loadProducts()} type="button">
                {t('common.retry')}
              </button>
            </div>
          ) : loading ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <RefreshCw size={28} strokeWidth={1.5} />
              </div>
              <p>{t('shop.loading')}</p>
            </div>
          ) : products.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                {search.trim() ? <Search size={28} strokeWidth={1.5} /> : <Package size={28} strokeWidth={1.5} />}
              </div>
              <p>{search.trim() ? t('catalog.nothingFound') : t('shop.empty')}</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {products.map((product) => (
                <ProductCard
                  key={product.productCityId}
                  product={product}
                  onClick={() => navigate(`/shop/product/${product.id}`)}
                />
              ))}
            </div>
          )}
      </>
    </div>
  )
}
