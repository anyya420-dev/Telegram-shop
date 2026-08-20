import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProductCard } from '../components/ProductCard'
import { useApp } from '../context/AppContext'

export function ShopPage() {
  const { user, categories, products, cart, refreshCatalog, openCityPicker } = useApp()
  const [search, setSearch] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<number | 'all'>('all')

  const cityName = user?.selectedCity?.name ?? 'Не выбран'
  const cartCount = cart?.items.length ?? 0

  const heroMessage = useMemo(() => {
    if (!user?.selectedCity) {
      return 'Выберите город, чтобы увидеть доступные товары.'
    }

    return 'Премиальный каталог с быстрым выбором количества и минималистичным интерфейсом.'
  }, [user?.selectedCity])

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <span className="eyebrow">Telegram Web App</span>
          <h1>Магазин</h1>
          <p>{heroMessage}</p>
        </div>
        <div className="hero-card__actions">
          <button className="secondary-button" type="button" onClick={openCityPicker}>
            📍 {cityName}
          </button>
          <Link className="primary-button" to="/cart">
            Корзина ({cartCount})
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
              placeholder="Поиск по каталогу"
            />
          </label>
          <button className="secondary-button" type="button" onClick={() => refreshCatalog(search, activeCategoryId)}>
            Найти
          </button>
        </div>
        <div className="category-row">
          {categories.map((category) => {
            const categoryValue = category.id === 0 ? 'all' : category.id
            const isActive = activeCategoryId === categoryValue

            return (
              <button
                key={category.id}
                type="button"
                className={`category-pill ${isActive ? 'category-pill--active' : ''}`}
                onClick={() => {
                  setActiveCategoryId(categoryValue)
                  void refreshCatalog(search, categoryValue)
                }}
              >
                {category.name}
              </button>
            )
          })}
        </div>
      </section>

      <section className="section-heading">
        <div>
          <span className="eyebrow">Каталог</span>
          <h2>🟢 Товары в наличии</h2>
        </div>
      </section>

      <section className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.productCityId} product={product} />
        ))}
      </section>

      {products.length === 0 ? (
        <section className="empty-state">
          <h3>Товаров пока нет</h3>
          <p>Попробуйте изменить город, категорию или поисковый запрос.</p>
        </section>
      ) : null}
    </div>
  )
}
