import { AlertCircle, ArrowLeft, Heart, MapPin, Minus, Package, Plus, Star } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError, api } from '../api/client'
import ProductCard from '../components/ProductCard/ProductCard'
import { useApp } from '../context/AppContext'
import { formatCurrency } from '../lib/format'
import { getLocalizedCityName, getLocalizedProductCategoryName, getLocalizedProductDescription, getLocalizedProductName, getLocalizedUnit } from '../lib/localized'
import { clampProductQuantity, getProductQuantityBounds } from '../lib/storefront'
import i18n from '../lib/i18n'
import styles from './ProductPage.module.css'
import type { Language, ProductDetail, Review } from '../types'
import { safeNavigateBack } from '../lib/navigation'

const STARS = [1, 2, 3, 4, 5]

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const language = i18n.language as Language
  const { user, loading: bootstrapLoading, addToCart, cart, products, openCityPicker } = useApp()

  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  const [inWishlist, setInWishlist] = useState(false)
  const [wishlistLoading, setWishlistLoading] = useState(false)
  const [reviews, setReviews] = useState<Review[]>([])
  const [avgRating, setAvgRating] = useState<number | null>(null)
  const [myRating, setMyRating] = useState(0)
  const [myComment, setMyComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)

  useEffect(() => {
    async function loadProduct() {
      if (!id) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setPageError(null)
        const { product: responseProduct } = await api.getProduct(Number(id), user?.selectedCityId ?? undefined)
        setProduct(responseProduct)
        setQuantity(clampProductQuantity(responseProduct, responseProduct.minimumQuantity || 1))

        try {
          // Only call auth-required endpoints once session token is ready
          const [reviewsResponse, wishlistResponse] = await Promise.all([
            api.getReviews(Number(id)),
            bootstrapLoading ? Promise.resolve({ items: [] }) : api.getWishlist(),
          ])
          setReviews(reviewsResponse.reviews)
          setAvgRating(reviewsResponse.avgRating)
          const currentReview = user ? reviewsResponse.reviews.find((review) => review.userId === user.id) : undefined
          if (currentReview) {
            setMyRating(currentReview.rating)
            setMyComment(currentReview.comment ?? '')
          } else {
            setMyRating(0)
            setMyComment('')
          }
          setInWishlist(wishlistResponse.items.some((item) => item.product.productCityId === responseProduct.productCityId))
        } catch {
          setReviews([])
          setAvgRating(null)
          setInWishlist(false)
        }
      } catch (error) {
        setProduct(null)
        setPageError(error instanceof ApiError && error.code ? t(`errors.${error.code}`) : t('errors.product_load_failed'))
      } finally {
        setLoading(false)
      }
    }

    void loadProduct()
  }, [id, t, user?.id, user?.selectedCityId])

  const localizedName = product ? getLocalizedProductName(product, language) : ''
  const localizedDescription = product ? getLocalizedProductDescription(product, language) : ''
  const localizedCategory = product ? getLocalizedProductCategoryName(product, language) : ''
  const localizedUnit = product ? getLocalizedUnit(product.unit, language, product.unitTranslations) : ''
  const quantityBounds = product ? getProductQuantityBounds(product) : null
  const canOrder = Boolean(product?.isAvailable && quantityBounds?.canOrder && user?.selectedCityId)

  const itemInCart = useMemo(
    () => cart?.items.find((item) => item.productCity.productCityId === product?.productCityId) ?? null,
    [cart?.items, product?.productCityId],
  )

  const relatedProducts = useMemo(
    () =>
      product
        ? products.filter((item) => item.categoryId === product.categoryId && item.productCityId !== product.productCityId).slice(0, 4)
        : [],
    [product, products],
  )

  async function toggleWishlist() {
    if (!product || wishlistLoading) {
      return
    }

    try {
      setWishlistLoading(true)
      if (inWishlist) {
        await api.removeFromWishlist(product.productCityId)
        setInWishlist(false)
      } else {
        await api.addToWishlist(product.productCityId)
        setInWishlist(true)
      }
    } finally {
      setWishlistLoading(false)
    }
  }

  async function handleSubmitReview() {
    if (!product || submittingReview || !myRating) {
      return
    }

    try {
      setSubmittingReview(true)
      await api.submitReview(product.id, myRating, myComment || undefined)
      const response = await api.getReviews(product.id)
      setReviews(response.reviews)
      setAvgRating(response.avgRating)
      setShowReviewForm(false)
    } finally {
      setSubmittingReview(false)
    }
  }

  async function handleAddToCart() {
    if (!product || !canOrder) {
      return
    }

    try {
      setAdding(true)
      await addToCart(product.productCityId, quantity)
      setAdded(true)
      window.setTimeout(() => setAdded(false), 2000)
    } finally {
      setAdding(false)
    }
  }

  function handleBack() {
    safeNavigateBack(navigate, `${location.pathname}${location.search}`, '/catalog')
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    )
  }

  if (!product) {
    return (
      <div className={styles.error}>
        <p>{pageError ?? t('product.notFound')}</p>
        <button className={styles.viewCartBtn} onClick={handleBack} type="button">
          {t('common.back')}
        </button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={handleBack} type="button">
        <ArrowLeft size={16} strokeWidth={1.8} style={{ marginRight: 8, verticalAlign: 'middle' }} />
        {t('common.back')}
      </button>

      <div className={styles.imageWrap}>
        {product.image ? (
          <img src={product.image} alt={localizedName} className={styles.image} />
        ) : (
          <div className={styles.noImage}>
            <Package size={48} strokeWidth={1.4} />
          </div>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.categoryTag}>{localizedCategory}</div>
        <h1 className={styles.name}>{localizedName}</h1>

        <div className={styles.priceRow}>
          <span className={styles.price}>{formatCurrency(product.price, language)}</span>
          {localizedUnit ? <span className={styles.unit}>/ {localizedUnit}</span> : null}
        </div>

        {user?.selectedCity ? (
          <div className={styles.stockRow}>
            <MapPin size={14} strokeWidth={1.5} />
            <span className={styles.stockText}>{getLocalizedCityName(user.selectedCity, language)}</span>
          </div>
        ) : null}

        {localizedDescription ? <p className={styles.description}>{localizedDescription}</p> : null}

        {!user?.selectedCityId ? (
          <div className={styles.notInCity}>
            <AlertCircle size={16} strokeWidth={1.5} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            {t('checkout.selectCity')}
            <button className={styles.viewCartBtn} onClick={openCityPicker} type="button">
              <MapPin size={16} strokeWidth={1.5} />
              {t('cityPicker.changeCity')}
            </button>
          </div>
        ) : null}

        <div className={styles.stockRow}>
          <span className={`${styles.stockDot} ${canOrder ? styles.inStock : styles.outOfStock}`} />
          <span className={styles.stockText}>
            {canOrder ? t('product.stockAvailable', { count: product.stock, unit: localizedUnit }) : t('product.outOfStock')}
          </span>
        </div>

        {!canOrder ? (
          <div className={styles.notInCity}>
            <AlertCircle size={16} strokeWidth={1.5} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            {t('errors.product_unavailable')}
          </div>
        ) : null}

        {canOrder && quantityBounds ? (
          <>
            <div className={styles.qtySection}>
              <span className={styles.qtyLabel}>{t('product.quantity')}</span>
              <div className={styles.qtyControl}>
                <button
                  className={styles.qtyBtn}
                  onClick={() => setQuantity((current) => clampProductQuantity(product, current - quantityBounds.step))}
                  disabled={quantity <= quantityBounds.minimum}
                  type="button"
                >
                  <Minus size={16} strokeWidth={1.8} />
                </button>
                <span className={styles.qtyValue}>
                  {quantity} {localizedUnit}
                </span>
                <button
                  className={styles.qtyBtn}
                  onClick={() => setQuantity((current) => clampProductQuantity(product, current + quantityBounds.step))}
                  disabled={quantity >= quantityBounds.maximum}
                  type="button"
                >
                  <Plus size={16} strokeWidth={1.8} />
                </button>
              </div>
            </div>

            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>{t('product.total')}</span>
              <span className={styles.totalPrice}>{formatCurrency(product.price * quantity, language)}</span>
            </div>

            <button
              className={`${styles.addBtn} ${added ? styles.addedBtn : ''}`}
              onClick={() => void handleAddToCart()}
              disabled={adding || added}
              type="button"
            >
              {added ? t('product.added') : adding ? t('product.adding') : itemInCart ? t('product.updateCart') : t('product.addToCart')}
            </button>

            {itemInCart ? (
              <button className={styles.viewCartBtn} onClick={() => navigate('/shop/cart')} type="button">
                {t('product.goToCart')}
              </button>
            ) : null}
          </>
        ) : null}

        <button
          className={`${styles.wishlistBtn} ${inWishlist ? styles.wishlistActive : ''}`}
          onClick={() => void toggleWishlist()}
          disabled={wishlistLoading}
          type="button"
        >
          <Heart size={14} strokeWidth={1.5} fill={inWishlist ? 'currentColor' : 'none'} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {inWishlist ? t('product.inWishlist') : t('product.addToWishlist')}
        </button>
      </div>

      <div className={styles.reviewsSection}>
        <div className={styles.reviewsHeader}>
          <h3 className={styles.reviewsTitle}>{t('product.reviews')}</h3>
          {avgRating !== null ? (
            <span className={styles.avgRating}>
              {Array.from({ length: Math.round(avgRating) }).map((_, index) => (
                <Star key={index} size={12} strokeWidth={1.5} fill="currentColor" />
              ))}{' '}
              {avgRating}/5 ({reviews.length})
            </span>
          ) : null}
        </div>

        {user ? (
          <>
            <button className={styles.writeReviewBtn} onClick={() => setShowReviewForm((current) => !current)} type="button">
              {showReviewForm ? t('product.cancelReview') : t('product.writeReview')}
            </button>
            {showReviewForm ? (
              <div className={styles.reviewForm}>
                <div className={styles.starRow}>
                  {STARS.map((star) => (
                    <button
                      key={star}
                      className={`${styles.star} ${myRating >= star ? styles.starActive : ''}`}
                      onClick={() => setMyRating(star)}
                      type="button"
                    >
                      <Star size={18} strokeWidth={1.5} fill={myRating >= star ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
                <textarea
                  className={styles.reviewTextarea}
                  placeholder={t('product.reviewComment')}
                  value={myComment}
                  onChange={(event) => setMyComment(event.target.value)}
                  rows={3}
                />
                <button
                  className={styles.submitReviewBtn}
                  onClick={() => void handleSubmitReview()}
                  disabled={submittingReview || !myRating}
                  type="button"
                >
                  {submittingReview ? t('product.submitting') : t('product.submitReview')}
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {reviews.length === 0 ? <p className={styles.noReviews}>{t('product.noReviews')}</p> : null}
        {reviews.map((review) => (
          <div key={review.id} className={styles.reviewCard}>
            <div className={styles.reviewTop}>
              <span className={styles.reviewAuthor}>{review.user.firstName}</span>
              <span className={styles.reviewRating}>
                {Array.from({ length: review.rating }).map((_, index) => (
                  <Star key={index} size={12} strokeWidth={1.5} fill="currentColor" />
                ))}
              </span>
            </div>
            {review.comment ? <p className={styles.reviewComment}>{review.comment}</p> : null}
            <span className={styles.reviewDate}>
              {new Date(review.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US')}
            </span>
          </div>
        ))}
      </div>

      {relatedProducts.length > 0 ? (
        <div className={styles.relatedSection}>
          <h3 className={styles.relatedTitle}>{t('product.related')}</h3>
          <div className={styles.relatedGrid}>
            {relatedProducts.map((related) => (
              <ProductCard key={related.productCityId} product={related} onClick={() => navigate(`/shop/product/${related.id}`)} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
