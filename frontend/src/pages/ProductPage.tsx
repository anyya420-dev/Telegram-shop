import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { QuantitySelector } from '../components/QuantitySelector'
import { useApp } from '../context/AppContext'
import { formatCurrency, formatQuantity } from '../lib/format'
import type { ProductDetail } from '../types'

export function ProductPage() {
  const { productId } = useParams()
  const { user, products, addToCart } = useApp()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cachedProduct = useMemo(() => products.find((item) => item.id === Number(productId)) ?? null, [productId, products])

  useEffect(() => {
    async function loadProduct() {
      if (!productId || !user?.selectedCityId) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        if (cachedProduct) {
          setProduct(cachedProduct)
          setQuantity(cachedProduct.minimumQuantity)
          return
        }

        const response = await api.getProduct(Number(productId), user.selectedCityId)
        setProduct(response.product)
        setQuantity(response.product.minimumQuantity)
      } catch (productError) {
        setError(productError instanceof Error ? productError.message : 'Не удалось загрузить товар')
      } finally {
        setLoading(false)
      }
    }

    void loadProduct()
  }, [cachedProduct, productId, user?.selectedCityId])

  if (loading) {
    return (
      <section className="placeholder-card">
        <h1>Загрузка товара…</h1>
      </section>
    )
  }

  if (!product) {
    return (
      <section className="placeholder-card">
        <h1>Товар не найден</h1>
        <p>Вернитесь в каталог и выберите другой товар.</p>
        <Link className="primary-button" to="/">
          К каталогу
        </Link>
      </section>
    )
  }

  return (
    <div className="page-stack">
      <Link className="back-link" to="/">← Назад в каталог</Link>
      <section className="product-hero">
        <img className="product-hero__image" src={product.image} alt={product.name} />
        <div className="panel-card panel-card--dense">
          <span className="eyebrow">{product.categoryName}</span>
          <h1>{product.name}</h1>
          <p>{product.description}</p>
          <div className="detail-grid">
            <div>
              <span className="field-label">Цена</span>
              <strong>{formatCurrency(product.price)}</strong>
            </div>
            <div>
              <span className="field-label">Наличие</span>
              <strong>{formatQuantity(product.stock)} {product.unit}</strong>
            </div>
            <div>
              <span className="field-label">Минимум</span>
              <strong>{formatQuantity(product.minimumQuantity)} {product.unit}</strong>
            </div>
            <div>
              <span className="field-label">Шаг</span>
              <strong>{formatQuantity(product.quantityStep)} {product.unit}</strong>
            </div>
          </div>
          <QuantitySelector
            minimum={product.minimumQuantity}
            step={product.quantityStep}
            maximum={product.maximumQuantity}
            unit={product.unit}
            value={quantity}
            onChange={setQuantity}
          />
          {error ? <p className="error-text">{error}</p> : null}
          <button
            className="primary-button"
            type="button"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true)
              setError(null)
              try {
                await addToCart(product.productCityId, quantity)
              } catch (cartError) {
                setError(cartError instanceof Error ? cartError.message : 'Не удалось обновить корзину')
              } finally {
                setSubmitting(false)
              }
            }}
          >
            Добавить в корзину
          </button>
        </div>
      </section>
    </div>
  )
}
