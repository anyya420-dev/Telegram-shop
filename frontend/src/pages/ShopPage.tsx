import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProductCard } from '../components/ProductCard'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n'
import { getLocalizedCategoryName, getLocalizedCityName } from '../lib/localized'

export default function ShopPage() {
  const { user, categories, products, cart, refreshCatalog, openCityPicker } = useApp()
  const [search, setSearch] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<number | 'all'>('all')
  const { language, t } = useI18n()

  const cityName = user?.selectedCity ? getLocalizedCityName(user.selectedCity, language) : t('common.notSelected')
  const cartCount = cart?.items.length ?? 0

  const heroMessage = useMemo(() => {
    if (!user?.selectedCity) {
      return t('shop.heroMessageNoCity')
    }

    return t('shop.heroMessageDefault')
  }, [t, user?.selectedCity])

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <span className="eyebrow">{t('shop.heroBadge')}</span>
          <h1>{t('shop.heroTitle')}</h1>
          <p>{heroMessage}</p>
        </div>
        <div className="hero-card__actions">
          <button className="secondary-button" type="button" onClick={openCityPicker}>
            📍 {cityName}
          </button>
          <Link className="primary-button" to="/shop/cart">
            {t('shop.cartButton', { count: cartCount })}
          </Link>
        </div>
      </section>

      <section className="panel-card">
        <div className="search-row">
          <label className="search-field">
            <span>🔍</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('shop.searchPlaceholder')}
            />
          </label>
          <button className="secondary-button" type="button" onClick={() => refreshCatalog(search, activeCategoryId)}>
            {t('shop.searchButton')}
          </button>
        </div>
        <div className="category-row">
          <button
            type="button"
            className={`category-pill ${activeCategoryId === 'all' ? 'category-pill--active' : ''}`}
            onClick={() => {
              setActiveCategoryId('all')
              void refreshCatalog(search, 'all')
            }}
          >
            {t('shop.allCategories')}
          </button>
          {categories.map((category) => {
            const isActive = activeCategoryId === category.id

            return (
              <button
                key={category.id}
                type="button"
                className={`category-pill ${isActive ? 'category-pill--active' : ''}`}
                onClick={() => {
                  setActiveCategoryId(category.id)
                  void refreshCatalog(search, category.id)
                }}
              >
                {getLocalizedCategoryName(category, language)}
              </button>
            )
          })}
        </div>
      </section>

      <section className="section-heading">
        <div>
          <span className="eyebrow">{t('shop.catalogBadge')}</span>
          <h2>{t('shop.catalogTitle')}</h2>
        </div>
      </section>

      <section className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.productCityId} product={product} />
        ))}
      </section>

      {products.length === 0 ? (
        <section className="empty-state">
          <h3>{t('shop.emptyTitle')}</h3>
          <p>{t('shop.emptyDescription')}</p>
        </section>
      ) : null}
    </div>
  )
}
