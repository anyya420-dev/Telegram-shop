import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../api/client';
import styles from './ProductPage.module.css';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language, ProductDetail, Review } from '../types';
import ProductCard from '../components/ProductCard/ProductCard';

const STARS = [1, 2, 3, 4, 5];

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, addToCart, cart, products } = useApp();
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  // Wishlist
  const [inWishlist, setInWishlist] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);

  // Reviews
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id || !user?.selectedCityId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { product: data } = await api.getProduct(Number(id), user.selectedCityId);
        setProduct(data);
        setQuantity(data.minimumQuantity || 1);

        // Load reviews and wishlist in parallel
        const [reviewsRes, wishlistRes] = await Promise.all([
          api.getReviews(Number(id)),
          api.getWishlist(),
        ]);
        setReviews(reviewsRes.reviews);
        setAvgRating(reviewsRes.avgRating);
        const myRev = reviewsRes.reviews.find((r) => r.userId === user.id);
        if (myRev) { setMyRating(myRev.rating); setMyComment(myRev.comment ?? ''); }
        setInWishlist(wishlistRes.items.some((item) => item.product.id === Number(id)));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id, user?.selectedCityId]);

  async function toggleWishlist() {
    if (!product || wishlistLoading) return;
    setWishlistLoading(true);
    try {
      if (inWishlist) {
        await api.removeFromWishlist(product.productCityId);
        setInWishlist(false);
      } else {
        await api.addToWishlist(product.productCityId);
        setInWishlist(true);
      }
    } finally {
      setWishlistLoading(false);
    }
  }

  async function handleSubmitReview() {
    if (!product || submittingReview || !myRating) return;
    setSubmittingReview(true);
    try {
      await api.submitReview(product.id, myRating, myComment || undefined);
      const r = await api.getReviews(product.id);
      setReviews(r.reviews);
      setAvgRating(r.avgRating);
      setShowReviewForm(false);
    } finally {
      setSubmittingReview(false);
    }
  }

  function increment() {
    if (!product) return;
    const next = quantity + product.quantityStep;
    if (next <= product.maximumQuantity) setQuantity(next);
  }

  function decrement() {
    if (!product) return;
    const next = quantity - product.quantityStep;
    if (next >= product.minimumQuantity) setQuantity(next);
  }

  async function handleAddToCart() {
    if (!product) return;
    setAdding(true);
    try {
      await addToCart(product.productCityId, quantity);
      setAdded(true);
      window.setTimeout(() => setAdded(false), 2000);
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (!product) {
    return (
      <div className={styles.error}>
        <p>{t('product.notFound')}</p>
        <button onClick={() => navigate(-1)}>{t('product.back')}</button>
      </div>
    );
  }

  const itemInCart = cart?.items.find((i) => i.productCity.productCityId === product.productCityId);
  const relatedProducts = products
    .filter((item) => item.categoryId === product.categoryId && item.id !== product.id)
    .slice(0, 4);

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate(-1)}>
        {t('product.back')}
      </button>

      <div className={styles.imageWrap}>
        {product.image ? (
          <img src={product.image} alt={product.name} className={styles.image} />
        ) : (
          <div className={styles.noImage}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.categoryTag}>{product.categoryName}</div>
        <h1 className={styles.name}>{product.name}</h1>

        <div className={styles.priceRow}>
          <span className={styles.price}>{formatCurrency(product.price, language)}</span>
          {product.unit && <span className={styles.unit}>/ {product.unit}</span>}
        </div>

        {product.description && (
          <p className={styles.description}>{product.description}</p>
        )}

        <div className={styles.stockRow}>
          <span
            className={`${styles.stockDot} ${product.isAvailable ? styles.inStock : styles.outOfStock}`}
          />
          <span className={styles.stockText}>
            {product.isAvailable
              ? t('product.inStock', { count: product.stock, unit: product.unit })
              : t('product.outOfStock')}
          </span>
        </div>

        {product.isAvailable && (
          <>
            <div className={styles.qtySection}>
              <span className={styles.qtyLabel}>{t('product.quantity')}</span>
              <div className={styles.qtyControl}>
                <button
                  className={styles.qtyBtn}
                  onClick={decrement}
                  disabled={quantity <= product.minimumQuantity}
                >
                  −
                </button>
                <span className={styles.qtyValue}>
                  {quantity} {product.unit}
                </span>
                <button
                  className={styles.qtyBtn}
                  onClick={increment}
                  disabled={quantity >= product.maximumQuantity}
                >
                  +
                </button>
              </div>
            </div>

            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>{t('product.total')}</span>
              <span className={styles.totalPrice}>
                {formatCurrency(product.price * quantity, language)}
              </span>
            </div>

            <button
              className={`${styles.addBtn} ${added ? styles.addedBtn : ''}`}
              onClick={handleAddToCart}
              disabled={adding || added}
            >
              {added
                ? t('product.added')
                : adding
                ? t('product.adding')
                : itemInCart
                ? t('product.updateCart')
                : t('product.addToCart')}
            </button>

            {itemInCart && (
              <button
                className={styles.viewCartBtn}
                onClick={() => navigate('/shop/cart')}
              >
                {t('product.goToCart')}
              </button>
            )}

            {/* Wishlist button */}
            <button
              className={`${styles.wishlistBtn} ${inWishlist ? styles.wishlistActive : ''}`}
              onClick={() => void toggleWishlist()}
              disabled={wishlistLoading}
            >
              {inWishlist ? t('product.inWishlist') : t('product.addToWishlist')}
            </button>
          </>
        )}
      </div>

      {/* Reviews section */}
      <div className={styles.reviewsSection}>
        <div className={styles.reviewsHeader}>
          <h3 className={styles.reviewsTitle}>{t('product.reviews')}</h3>
          {avgRating !== null && (
            <span className={styles.avgRating}>{avgRating.toFixed(1)}/5 ({reviews.length})</span>
          )}
        </div>

        {user && (
          <>
            <button className={styles.writeReviewBtn} onClick={() => setShowReviewForm(!showReviewForm)}>
              {showReviewForm ? t('product.cancelReview') : t('product.writeReview')}
            </button>
            {showReviewForm && (
              <div className={styles.reviewForm}>
                <div className={styles.starRow}>
                  {STARS.map((s) => (
                    <button key={s} className={`${styles.star} ${myRating >= s ? styles.starActive : ''}`} onClick={() => setMyRating(s)}>
                      ★
                    </button>
                  ))}
                </div>
                <textarea
                  className={styles.reviewTextarea}
                  placeholder={t('product.reviewComment')}
                  value={myComment}
                  onChange={(e) => setMyComment(e.target.value)}
                  rows={3}
                />
                <button
                  className={styles.submitReviewBtn}
                  onClick={() => void handleSubmitReview()}
                  disabled={submittingReview || !myRating}
                >
                  {submittingReview ? t('product.submitting') : t('product.submitReview')}
                </button>
              </div>
            )}
          </>
        )}

        {reviews.length === 0 && <p className={styles.noReviews}>{t('product.noReviews')}</p>}
        {reviews.map((review) => (
          <div key={review.id} className={styles.reviewCard}>
            <div className={styles.reviewTop}>
              <span className={styles.reviewAuthor}>{review.user.firstName}</span>
              <span className={styles.reviewRating}>{Array.from({ length: review.rating }).map((_, index) => '★').join('')}</span>
            </div>
            {review.comment && <p className={styles.reviewComment}>{review.comment}</p>}
            <span className={styles.reviewDate}>{new Date(review.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US')}</span>
          </div>
        ))}
      </div>

      {relatedProducts.length > 0 && (
        <div className={styles.relatedSection}>
          <h3 className={styles.relatedTitle}>{t('product.related')}</h3>
          <div className={styles.relatedGrid}>
            {relatedProducts.map((related) => (
              <ProductCard
                key={related.productCityId}
                product={related}
                onClick={() => navigate(`/shop/product/${related.id}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
