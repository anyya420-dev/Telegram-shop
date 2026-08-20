import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { roundToStep } from '../lib/utils';
import { Product, ProductCity } from '../types/product';
import styles from './ProductPage.module.css';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedCity, addToCart, cart } = useApp();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const params = selectedCity ? `?cityId=${selectedCity.id}` : '';
        const data = await api.get<Product>(`/products/${id}${params}`);
        setProduct(data);
        const pc = data.productCities[0];
        if (pc) setQuantity(pc.minimumQuantity);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id, selectedCity]);

  const pc = product?.productCities[0];

  function increment() {
    if (!pc) return;
    const next = roundToStep(quantity + pc.quantityStep, pc.quantityStep);
    if (next <= pc.maximumQuantity) setQuantity(next);
  }

  function decrement() {
    if (!pc) return;
    const next = roundToStep(quantity - pc.quantityStep, pc.quantityStep);
    if (next >= pc.minimumQuantity) setQuantity(next);
  }

  async function handleAddToCart() {
    if (!product || !pc) return;
    setAdding(true);
    try {
      await addToCart(product.id, quantity);
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
        <p>Товар не найден</p>
        <button onClick={() => navigate(-1)}>← Назад</button>
      </div>
    );
  }

  const itemInCart = cart.items.find((i) => i.productId === product.id);

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate(-1)}>
        ← Назад
      </button>

      <div className={styles.imageWrap}>
        {product.image ? (
          <img src={product.image} alt={product.name} className={styles.image} />
        ) : (
          <div className={styles.noImage}>📦</div>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.categoryTag}>{product.category.name}</div>
        <h1 className={styles.name}>{product.name}</h1>

        <div className={styles.priceRow}>
          <span className={styles.price}>${product.price}</span>
          {pc && <span className={styles.unit}>/ {pc.unit}</span>}
        </div>

        {product.description && (
          <p className={styles.description}>{product.description}</p>
        )}

        {pc ? (
          <>
            <div className={styles.stockRow}>
              <span
                className={`${styles.stockDot} ${pc.isAvailable ? styles.inStock : styles.outOfStock}`}
              />
              <span className={styles.stockText}>
                {pc.isAvailable
                  ? `В наличии: ${pc.stock} ${pc.unit}`
                  : 'Нет в наличии'}
              </span>
            </div>

            {pc.isAvailable && (
              <>
                <div className={styles.qtySection}>
                  <span className={styles.qtyLabel}>Количество</span>
                  <div className={styles.qtyControl}>
                    <button
                      className={styles.qtyBtn}
                      onClick={decrement}
                      disabled={quantity <= pc.minimumQuantity}
                    >
                      −
                    </button>
                    <span className={styles.qtyValue}>
                      {quantity} {pc.unit}
                    </span>
                    <button
                      className={styles.qtyBtn}
                      onClick={increment}
                      disabled={quantity >= pc.maximumQuantity}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className={styles.totalRow}>
                  <span className={styles.totalLabel}>Итого</span>
                  <span className={styles.totalPrice}>
                    ${(product.price * quantity).toFixed(2)}
                  </span>
                </div>

                <button
                  className={`${styles.addBtn} ${added ? styles.addedBtn : ''}`}
                  onClick={handleAddToCart}
                  disabled={adding || added}
                >
                  {added
                    ? '✓ Добавлено'
                    : adding
                    ? 'Добавляем...'
                    : itemInCart
                    ? '🛒 Обновить корзину'
                    : '🛒 Добавить в корзину'}
                </button>

                {itemInCart && (
                  <button
                    className={styles.viewCartBtn}
                    onClick={() => navigate('/shop/cart')}
                  >
                    Перейти в корзину →
                  </button>
                )}
              </>
            )}
          </>
        ) : (
          <div className={styles.notInCity}>
            Товар недоступен в выбранном городе
          </div>
        )}
      </div>
    </div>
  );
}
