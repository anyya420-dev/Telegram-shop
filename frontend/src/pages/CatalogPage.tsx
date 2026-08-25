import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, MapPin, RefreshCw, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import ProductCard from '../components/ProductCard/ProductCard'
import { useApp } from '../context/AppContext'
import { getLocalizedCategoryName, getLocalizedCityName } from '../lib/localized'
import styles from './CatalogPage.module.css'
import type { Language } from '../types'

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'popular'

function isSortOption(value: string | null): value is SortOption {
  return value === 'newest' || value === 'price_asc' || value === 'price_desc' || value === 'popular'
}

export default function CatalogPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language as Language
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, categories, products, refreshCatalog, openCityPicker } = useApp()

  const [activeCategoryId, setActiveCategoryId] = useState<number | 'all'>(() => {
    const categoryId = searchParams.get('categoryId')
    return categoryId ? Number(categoryId) : 'all'
  })
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [sort, setSort] = useState<SortOption>(isSortOption(searchParams.get('sort')) ? (searchParams.get('sort') as SortOption) : 'newest')
  const [showSort, setShowSort] = useState(false)
  const [loading, setLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  async function runRefresh(nextSearch = search.trim(), nextCategoryId = activeCategoryId, nextSort = sort) {
    try {
      setLoading(true)
      setCatalogError(null)
      await refreshCatalog(nextSearch, nextCategoryId, nextSort)
    } catch (error) {
      setCatalogError(error instanceof ApiError && error.code ? t(`errors.${error.code}`) : t('errors.catalog_refresh_failed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const nextParams = new URLSearchParams()
    if (activeCategoryId !== 'all') nextParams.set('categoryId', String(activeCategoryId))
    if (search.trim()) nextParams.set('search', search.trim())
    if (sort !== 'newest') nextParams.set('sort', sort)
    setSearchParams(nextParams, { replace: true })
  }, [activeCategoryId, search, sort, setSearchParams])

  useEffect(() => {
    if (!user?.selectedCityId) {
      return
    }

    const handle = window.setTimeout(() => {
      void runRefresh()
    }, 250)

    return () => window.clearTimeout(handle)
  }, [activeCategoryId, refreshCatalog, search, sort, t, user?.selectedCityId])

  const sortLabels: Record<SortOption, string> = useMemo(
    () => ({
      newest: t('catalog.sortNewest'),
      price_asc: t('catalog.sortPriceAsc'),
      price_desc: t('catalog.sortPriceDesc'),
      popular: t('catalog.sortPopular'),
    }),
    [t],
  )

  if (!user?.selectedCityId) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <MapPin size={28} strokeWidth={1.5} />
        </div>
        <p>{t('city.subtitle')}</p>
        <button className={styles.retryBtn} onClick={openCityPicker} type="button">
          <MapPin size={16} strokeWidth={1.5} />
          {t('cityPicker.changeCity')}
        </button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('catalog.title')}</h1>
          {user.selectedCity ? (
            <button className={styles.cityButton} onClick={openCityPicker} type="button">
              <MapPin size={14} strokeWidth={1.5} />
              {getLocalizedCityName(user.selectedCity, language)}
            </button>
          ) : null}
        </div>
        <button className={styles.sortBtn} onClick={() => setShowSort(true)} type="button">
          <ArrowUpDown size={14} strokeWidth={1.5} />
          {sortLabels[sort]}
        </button>
      </div>

      <div className={styles.searchWrap}>
        <div className={styles.searchInputWrap}>
          <Search size={16} strokeWidth={1.5} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="text"
            placeholder={t('catalog.searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search.length > 0 ? (
            <button
              className={styles.clearSearch}
              onClick={() => setSearch('')}
              aria-label={t('catalog.clearSearch')}
              type="button"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.catScroll}>
        <button
          className={`${styles.catBtn} ${activeCategoryId === 'all' ? styles.catActive : ''}`}
          onClick={() => setActiveCategoryId('all')}
          type="button"
        >
          {t('catalog.allCategories')}
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            className={`${styles.catBtn} ${activeCategoryId === category.id ? styles.catActive : ''}`}
            onClick={() => setActiveCategoryId(category.id)}
            type="button"
          >
            {getLocalizedCategoryName(category, language)}
          </button>
        ))}
      </div>

      <div className={styles.actionsRow}>
        <button
          className={styles.resetBtn}
          onClick={() => {
            setSearch('')
            setSort('newest')
            setActiveCategoryId('all')
          }}
          type="button"
        >
          {t('catalog.resetFilters')}
        </button>
      </div>

      {catalogError ? (
        <div className={styles.errorState}>
          <p>{catalogError}</p>
          <button className={styles.retryBtn} onClick={() => void runRefresh()} type="button">
            <RefreshCw size={14} strokeWidth={1.5} />
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className={styles.skeletonCard}>
              <div className={styles.skeletonImage} />
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLineShort} />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <Search size={28} strokeWidth={1.5} />
          </div>
          <p>{search.trim() ? t('catalog.nothingFound') : t('catalog.empty')}</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {products.map((product) => (
            <ProductCard key={product.productCityId} product={product} onClick={() => navigate(`/shop/product/${product.id}`)} />
          ))}
        </div>
      )}

      {showSort ? (
        <div className={styles.overlay} onClick={() => setShowSort(false)}>
          <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
            <p className={styles.sheetTitle}>{t('catalog.sort')}</p>
            {(Object.keys(sortLabels) as SortOption[]).map((sortValue) => (
              <button
                key={sortValue}
                className={`${styles.sortOption} ${sort === sortValue ? styles.sortActive : ''}`}
                onClick={() => {
                  setSort(sortValue)
                  setShowSort(false)
                }}
                type="button"
              >
                {sortLabels[sortValue]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
