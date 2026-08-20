import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { QuantitySelector } from '../components/QuantitySelector'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n'
import { formatCurrency, formatQuantity } from '../lib/format'
import { getLocalizedProductCategoryName, getLocalizedProductDescription, getLocalizedProductName, getLocalizedUnit } from '../lib/localized'
import type { ProductDetail } from '../types'

function translateError(error: unknown, t: (key: string) => string, fallbackKey: string) {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return t(`errors.${error.code}`)
  }

  return t(`errors.${fallbackKey}`)
}

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const { user, products, addToCart } = useApp()
  const { language, t } = useI18n()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cachedProduct = useMemo(() => products.find((item) => item.id === Number(id)) ?? null, [id, products])

  useEffect(() => {
    async function loadProduct() {
      if (!id || !user?.selectedCityId) {
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

        const response = await api.getProduct(Number(id), user.selectedCityId)
        setProduct(response.product)
        setQuantity(response.product.minimumQuantity)
      } catch (productError) {
        setError(translateError(productError, t, 'product_load_failed'))
      } finally {
        setLoading(false)
      }
    }

    void loadProduct()
  }, [cachedProduct, id, t, user?.selectedCityId])

  if (loading) {
    return (
      <section className="placeholder-card">
        <h1>{t('common.loadingProduct')}</h1>
      </section>
    )
  }

  if (!product) {
    return (
      <section className="placeholder-card">
        <h1>{t('product.notFoundTitle')}</h1>
        <p>{t('product.notFoundDescription')}</p>
        <Link className="primary-button" to="/shop">
          {t('product.backToCatalog')}
        </Link>
      </section>
    )
  }

  const unit = getLocalizedUnit(product.unit, language, product.unitTranslations)
  const imageSrc = product.image || '/favicon.svg'

  return (
    <div className="page-stack">
      <Link className="back-link" to="/shop">{t('product.backToCatalog')}</Link>
      <section className="product-hero">
        <img className="product-hero__image" src={imageSrc} alt={getLocalizedProductName(product, language)} />
        <div className="panel-card panel-card--dense">
          <span className="eyebrow">{getLocalizedProductCategoryName(product, language)}</span>
          <h1>{getLocalizedProductName(product, language)}</h1>
          <p>{getLocalizedProductDescription(product, language)}</p>
          <div className="detail-grid">
            <div>
              <span className="field-label">{t('product.price')}</span>
              <strong>{formatCurrency(product.price, language)}</strong>
            </div>
            <div>
              <span className="field-label">{t('product.availability')}</span>
              <strong>{formatQuantity(product.stock, language)} {unit}</strong>
            </div>
            <div>
              <span className="field-label">{t('product.minimum')}</span>
              <strong>{formatQuantity(product.minimumQuantity, language)} {unit}</strong>
            </div>
            <div>
              <span className="field-label">{t('product.step')}</span>
              <strong>{formatQuantity(product.quantityStep, language)} {unit}</strong>
            </div>
          </div>
          <QuantitySelector
            minimum={product.minimumQuantity}
            step={product.quantityStep}
            maximum={product.maximumQuantity}
            unit={product.unit}
            unitTranslations={product.unitTranslations}
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
                setError(translateError(cartError, t, 'cart_update_failed'))
              } finally {
                setSubmitting(false)
              }
            }}
          >
            {t('product.addToCart')}
          </button>
        </div>
      </section>
    </div>
  )
}
