import { useEffect, useMemo, useState } from 'react';
import { Check, MapPin, Settings, Star, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { AdminCasinoConfig, AdminCategory, AdminCity, AdminDeliveryOption, Administrator, AdminOrder, AdminPaymentRecord, AdminProduct, AdminStats, Discount, Language, PaymentMethod, SupportTicket, UserProfile } from '../types';
import styles from './AdminPage.module.css';

type Tab = 'stats' | 'orders' | 'products' | 'users' | 'cities' | 'categories' | 'discounts' | 'delivery' | 'support' | 'audit' | 'payments' | 'casino';

type ProductCityDraft = {
  cityId: string;
  stock: string;
  isAvailable: boolean;
  minimumQuantity: string;
  quantityStep: string;
  maximumQuantity: string;
  unit: string;
};

type ProductEditDraft = Partial<{
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  price: string;
  creditsEnabled: boolean;
  creditsPrice: string;
  minCreditsRequired: string;
  image: string;
  categoryId: string;
  isActive: boolean;
  isRecommended: boolean;
}>;

type ProductCityEditDraft = Partial<{
  stock: string;
  isAvailable: boolean;
  minimumQuantity: string;
  quantityStep: string;
  maximumQuantity: string;
  unit: string;
}>;

type CategoryEditDraft = Partial<{
  name: string;
  nameEn: string;
  isActive: boolean;
  sortOrder: string;
}>;

type CityEditDraft = Partial<{
  name: string;
  nameEn: string;
  isActive: boolean;
  sortOrder: string;
}>;

type DiscountEditDraft = Partial<{
  isActive: boolean;
  usageLimit: string;
  expiresAt: string;
}>;

type DeliveryEditDraft = Partial<{
  name: string;
  nameEn: string;
  type: string;
  price: string;
  isActive: boolean;
  sortOrder: string;
}>;

type PaymentEditDraft = Partial<{
  title: string;
  currency: string;
  provider: string;
  providerMode: string;
  providerKey: string;
  providerConfig: string;
  asset: string;
  network: string;
  walletAddress: string;
  displayName: string;
  instructions: string;
  sortOrder: string;
  isTonConnectEnabled: boolean;
}>;

const ORDER_STATUSES = ['pending', 'payment_pending', 'confirmed', 'processing', 'ready', 'delivered', 'cancelled'];

function createDefaultProductCityDraft(cityId = ''): ProductCityDraft {
  return {
    cityId,
    stock: '0',
    isAvailable: true,
    minimumQuantity: '1',
    quantityStep: '1',
    maximumQuantity: '1',
    unit: 'шт.',
  };
}

function getAdminErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function parseNonNegativeNumber(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(label);
  }
  return parsed;
}

function parsePositiveInteger(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(label);
  }
  return parsed;
}

function buildProductCityPayload(draft: ProductCityDraft) {
  const cityId = Number(draft.cityId);
  if (!Number.isInteger(cityId) || cityId <= 0) {
    throw new Error('Choose a valid city');
  }

  const stock = parseNonNegativeNumber(draft.stock, 'Stock must be zero or greater');
  const minimumQuantity = parsePositiveInteger(draft.minimumQuantity, 'Minimum quantity must be a positive integer');
  const quantityStep = parsePositiveInteger(draft.quantityStep, 'Quantity step must be a positive integer');
  const maximumQuantity = parsePositiveInteger(draft.maximumQuantity, 'Maximum quantity must be a positive integer');
  const unit = draft.unit.trim();

  if (!unit) {
    throw new Error('Unit is required');
  }
  if (maximumQuantity < minimumQuantity) {
    throw new Error('Maximum quantity must be greater than or equal to minimum quantity');
  }
  if ((maximumQuantity - minimumQuantity) % quantityStep !== 0) {
    throw new Error('Quantity step must match the minimum and maximum quantity range');
  }
  if (stock > 0 && minimumQuantity > stock) {
    throw new Error('Minimum quantity cannot exceed stock');
  }
  if (stock > 0 && maximumQuantity > stock) {
    throw new Error('Maximum quantity cannot exceed stock');
  }

  return {
    cityId,
    stock,
    isAvailable: draft.isAvailable,
    minimumQuantity,
    quantityStep,
    maximumQuantity,
    unit,
  };
}

export default function AdminPage({ panelMode = 'admin' }: { panelMode?: 'admin' | 'owner' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const language = i18n.language as Language;
  const panelTitle = panelMode === 'owner' ? 'Owner Panel' : 'Admin Panel';
  const loginTitle = panelMode === 'owner'
    ? t('admin.ownerLogin', { defaultValue: 'Owner login' })
    : t('admin.login', { defaultValue: 'Admin login' });
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [adminRole, setAdminRole] = useState<string>('admin');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderFilter, setOrderFilter] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [cities, setCities] = useState<AdminCity[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [auditLogs, setAuditLogs] = useState<{ id: number; action: string; entity: string | null; entityId: number | null; meta: string | null; createdAt: string }[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<AdminPaymentRecord[]>([]);
  const [casinoConfig, setCasinoConfig] = useState<AdminCasinoConfig>({ games: [], rewardConfigs: [] });
  const [casinoAdjustmentUserId, setCasinoAdjustmentUserId] = useState('');
  const [casinoAdjustmentAmount, setCasinoAdjustmentAmount] = useState('');
  const [casinoAdjustmentReason, setCasinoAdjustmentReason] = useState('');
  const [newCasinoRewardGame, setNewCasinoRewardGame] = useState('wheel');
  const [newCasinoRewardType, setNewCasinoRewardType] = useState('shop_discount');
  const [newCasinoRewardTitle, setNewCasinoRewardTitle] = useState('');
  const [newCasinoRewardWeight, setNewCasinoRewardWeight] = useState('1');
  const [newCasinoRewardDiscount, setNewCasinoRewardDiscount] = useState('');
  const [newCasinoRewardCredits, setNewCasinoRewardCredits] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState('percent');
  const [newValue, setNewValue] = useState('');
  const [newMin, setNewMin] = useState('');
  const [creatingDiscount, setCreatingDiscount] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<number | null>(null);
  const [discountEdits, setDiscountEdits] = useState<Record<number, DiscountEditDraft>>({});

  const [deliveryOptions, setDeliveryOptions] = useState<AdminDeliveryOption[]>([]);
  const [newDeliveryName, setNewDeliveryName] = useState('');
  const [newDeliveryNameEn, setNewDeliveryNameEn] = useState('');
  const [newDeliveryType, setNewDeliveryType] = useState('delivery');
  const [newDeliveryPrice, setNewDeliveryPrice] = useState('0');
  const [newDeliverySortOrder, setNewDeliverySortOrder] = useState('0');
  const [newDeliveryIsActive, setNewDeliveryIsActive] = useState(true);
  const [creatingDelivery, setCreatingDelivery] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<number | null>(null);
  const [deliveryEdits, setDeliveryEdits] = useState<Record<number, DeliveryEditDraft>>({});

  const [newPaymentType, setNewPaymentType] = useState<PaymentMethod['type']>('card');
  const [newPaymentTitle, setNewPaymentTitle] = useState('');
  const [newPaymentCurrency, setNewPaymentCurrency] = useState('');
  const [newPaymentProvider, setNewPaymentProvider] = useState('');
  const [newPaymentProviderMode, setNewPaymentProviderMode] = useState('test');
  const [newPaymentProviderKey, setNewPaymentProviderKey] = useState('');
  const [newPaymentProviderConfig, setNewPaymentProviderConfig] = useState('');
  const [newPaymentAsset, setNewPaymentAsset] = useState('');
  const [newPaymentNetwork, setNewPaymentNetwork] = useState('');
  const [newPaymentWalletAddress, setNewPaymentWalletAddress] = useState('');
  const [newPaymentDisplayName, setNewPaymentDisplayName] = useState('');
  const [newPaymentInstructions, setNewPaymentInstructions] = useState('');
  const [newPaymentSortOrder, setNewPaymentSortOrder] = useState('0');
  const [newPaymentTonConnectEnabled, setNewPaymentTonConnectEnabled] = useState(false);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<number | null>(null);
  const [paymentMethodEdits, setPaymentMethodEdits] = useState<Record<number, PaymentEditDraft>>({});
  const [paymentStatusReason, setPaymentStatusReason] = useState<Record<number, string>>({});

  const [newCityName, setNewCityName] = useState('');
  const [newCityNameEn, setNewCityNameEn] = useState('');
  const [newCitySortOrder, setNewCitySortOrder] = useState('0');
  const [newCityIsActive, setNewCityIsActive] = useState(true);
  const [creatingCity, setCreatingCity] = useState(false);
  const [editingCity, setEditingCity] = useState<number | null>(null);
  const [cityEdits, setCityEdits] = useState<Record<number, CityEditDraft>>({});

  const [newCatName, setNewCatName] = useState('');
  const [newCatNameEn, setNewCatNameEn] = useState('');
  const [newCatOrder, setNewCatOrder] = useState('0');
  const [creatingCat, setCreatingCat] = useState(false);
  const [editingCat, setEditingCat] = useState<number | null>(null);
  const [catEdits, setCatEdits] = useState<Record<number, CategoryEditDraft>>({});

  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdNameEn, setNewProdNameEn] = useState('');
  const [newProdDescription, setNewProdDescription] = useState('');
  const [newProdDescriptionEn, setNewProdDescriptionEn] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdCategoryId, setNewProdCategoryId] = useState('');
  const [newProdImage, setNewProdImage] = useState('');
  const [newProdCreditsEnabled, setNewProdCreditsEnabled] = useState(false);
  const [newProdCreditsPrice, setNewProdCreditsPrice] = useState('');
  const [newProdMinCreditsRequired, setNewProdMinCreditsRequired] = useState('');
  const [newProdIsActive, setNewProdIsActive] = useState(true);
  const [newProdIsRecommended, setNewProdIsRecommended] = useState(false);
  const [newProdCities, setNewProdCities] = useState<Record<number, ProductCityDraft>>({});
  const [creatingProd, setCreatingProd] = useState(false);
  const [editingProduct, setEditingProduct] = useState<number | null>(null);
  const [productEdits, setProductEdits] = useState<Record<number, ProductEditDraft>>({});
  const [editingProductCity, setEditingProductCity] = useState<number | null>(null);
  const [productCityEdits, setProductCityEdits] = useState<Record<number, ProductCityEditDraft>>({});
  const [newProductCityDrafts, setNewProductCityDrafts] = useState<Record<number, ProductCityDraft>>({});

  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [updatingOrder, setUpdatingOrder] = useState<number | null>(null);
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [generatedAdminPassword, setGeneratedAdminPassword] = useState<string | null>(null);
  const [shopName, setShopName] = useState('NARCOS');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const tabs = useMemo(
    () => ['stats', 'orders', 'products', 'users', 'cities', 'categories', 'discounts', 'delivery', 'support', 'audit', 'payments', 'casino'] as Tab[],
    [],
  );

  async function refreshCities() {
    const response = await api.getAdminCities();
    setCities(response.cities);
    return response.cities;
  }

  async function refreshCategories() {
    const response = await api.getAdminCategories();
    setCategories(response.categories);
    return response.categories;
  }

  async function refreshProducts() {
    const response = await api.getAdminProducts();
    setProducts(response.products);
    return response.products;
  }

  async function refreshDeliveryOptions() {
    const response = await api.getAdminDeliveryOptions();
    setDeliveryOptions(response.options);
    return response.options;
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const status = await api.adminStatus();
        if (mounted) {
          setAuthenticated(true);
          setAdminRole(status.role);
        }
      } catch {
        if (mounted) {
          setAuthenticated(false);
          setAdminRole('admin');
        }
      } finally {
        if (mounted) {
          setAuthChecked(true);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    void loadTab(tab);
  }, [authenticated, tab]);

  useEffect(() => {
    if (!authenticated) return;
    void (async () => {
      try {
        await Promise.all([refreshCities(), refreshCategories()]);
      } catch {
        // data will be loaded again per-tab
      }
    })();
  }, [authenticated]);

  async function loadTab(tabName: Tab) {
    setError(null);
    if (tabName === 'orders') {
      setOrdersLoading(true);
    }

    try {
      if (tabName === 'stats') {
        setStats(await api.getAdminStats());
      } else if (tabName === 'orders') {
        const response = await api.getAdminOrders(1, orderFilter || undefined);
        setOrders(response.orders);
      } else if (tabName === 'products') {
        await Promise.all([refreshProducts(), categories.length === 0 ? refreshCategories() : Promise.resolve(categories), cities.length === 0 ? refreshCities() : Promise.resolve(cities)]);
      } else if (tabName === 'users') {
        const response = await api.getAdminUsers(1);
        setUsers(response.users);
      } else if (tabName === 'cities') {
        await refreshCities();
      } else if (tabName === 'categories') {
        await refreshCategories();
      } else if (tabName === 'discounts') {
        const response = await api.getAdminDiscounts();
        setDiscounts(response.discounts);
      } else if (tabName === 'delivery') {
        const response = await api.getAdminDeliveryOptions();
        setDeliveryOptions(response.options);
      } else if (tabName === 'support') {
        const response = await api.getAdminSupportTickets();
        setTickets(response.tickets);
      } else if (tabName === 'audit') {
        const response = await api.getAuditLogs();
        setAuditLogs(response.logs);
      } else if (tabName === 'payments') {
        const [methodsResponse, paymentsResponse] = await Promise.all([api.getAdminPaymentSettings(), api.getAdminPayments()]);
        setPaymentMethods(methodsResponse.methods);
        setPaymentRecords(paymentsResponse.payments);
      } else if (tabName === 'casino') {
        setCasinoConfig(await api.getAdminCasinoConfig());
      }

      const status = await api.adminStatus();
      setAdminRole(status.role);
      if (status.role === 'owner') {
        const [adminsResponse, settingsResponse] = await Promise.all([
          api.getAdminAdministrators(),
          api.getAdminSettings(),
        ]);
        setAdministrators(adminsResponse.administrators);
        setShopName(settingsResponse.shopName);
      }
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to load admin data'));
    } finally {
      if (tabName === 'orders') {
        setOrdersLoading(false);
      }
    }
  }

  async function handleStatusChange(orderId: number, status: string) {
    setUpdatingOrder(orderId);
    setError(null);
    try {
      const response = await api.updateAdminOrderStatus(orderId, status);
      setOrders((current) => current.map((order) => (order.id === orderId ? response.order : order)));
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to update status'));
    } finally {
      setUpdatingOrder(null);
    }
  }

  async function handleConfirmPendingPayment(orderId: number) {
    setError(null);
    try {
      const response = await api.confirmAdminOrderPayment(orderId);
      setOrders((current) => current.map((order) => (order.id === orderId ? response.order : order)));
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to confirm payment'));
    }
  }

  async function handleRejectPendingPayment(orderId: number) {
    setError(null);
    try {
      const response = await api.rejectAdminOrderPayment(orderId);
      setOrders((current) => current.map((order) => (order.id === orderId ? response.order : order)));
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to reject payment'));
    }
  }

  async function handleSaveCasinoGame(game: string, data: Record<string, unknown>) {
    setError(null);
    try {
      await api.updateAdminCasinoGame(game, data);
      setCasinoConfig(await api.getAdminCasinoConfig());
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to update casino game'));
    }
  }

  async function handleCreateCasinoReward() {
    setError(null);
    try {
      await api.createAdminCasinoRewardConfig({
        game: newCasinoRewardGame,
        rewardType: newCasinoRewardType,
        title: newCasinoRewardTitle.trim(),
        weight: Number(newCasinoRewardWeight) || 1,
        discountPercent: newCasinoRewardDiscount ? Number(newCasinoRewardDiscount) : null,
        creditAmount: newCasinoRewardCredits ? Number(newCasinoRewardCredits) : null,
      });
      setNewCasinoRewardTitle('');
      setNewCasinoRewardWeight('1');
      setNewCasinoRewardDiscount('');
      setNewCasinoRewardCredits('');
      setCasinoConfig(await api.getAdminCasinoConfig());
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to create casino reward'));
    }
  }

  async function handleToggleCasinoReward(id: number, isActive: boolean) {
    setError(null);
    try {
      await api.updateAdminCasinoRewardConfig(id, { isActive: !isActive });
      setCasinoConfig(await api.getAdminCasinoConfig());
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to update casino reward'));
    }
  }

  async function handleAdjustCasinoCredits() {
    setError(null);
    try {
      await api.adjustAdminCasinoCredits({
        userId: Number(casinoAdjustmentUserId),
        amount: Number(casinoAdjustmentAmount),
        reason: casinoAdjustmentReason.trim(),
      });
      setCasinoAdjustmentAmount('');
      setCasinoAdjustmentReason('');
      setCasinoAdjustmentUserId('');
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to adjust casino credits'));
    }
  }

  async function handleCreateCity() {
    if (creatingCity || !newCityName.trim()) return;
    setCreatingCity(true);
    setError(null);

    try {
      const response = await api.createAdminCity({
        name: newCityName.trim(),
        nameEn: newCityNameEn.trim() || undefined,
        sortOrder: Number(newCitySortOrder) || 0,
        isActive: newCityIsActive,
      });
      setCities((current) => [...current, response.city as AdminCity].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));
      setNewCityName('');
      setNewCityNameEn('');
      setNewCitySortOrder('0');
      setNewCityIsActive(true);
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to create city'));
    } finally {
      setCreatingCity(false);
    }
  }

  async function handleSaveCity(cityId: number) {
    const edits = cityEdits[cityId];
    if (!edits) return;
    setError(null);

    try {
      const payload: Parameters<typeof api.updateAdminCity>[1] = {};
      if (typeof edits.name === 'string') payload.name = edits.name;
      if (typeof edits.nameEn === 'string') payload.nameEn = edits.nameEn;
      if (typeof edits.isActive === 'boolean') payload.isActive = edits.isActive;
      if (typeof edits.sortOrder === 'string') payload.sortOrder = Number(edits.sortOrder);
      const response = await api.updateAdminCity(cityId, payload);
      setCities((current) => current.map((city) => (city.id === cityId ? response.city as AdminCity : city)).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));
      setEditingCity(null);
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to update city'));
    }
  }

  async function handleCreateCategory() {
    if (creatingCat || !newCatName.trim()) return;
    setCreatingCat(true);
    setError(null);

    try {
      const response = await api.createAdminCategory({
        name: newCatName.trim(),
        nameEn: newCatNameEn.trim() || undefined,
        sortOrder: Number(newCatOrder) || 0,
      });
      setCategories((current) => [...current, response.category].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));
      setNewCatName('');
      setNewCatNameEn('');
      setNewCatOrder('0');
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to create category'));
    } finally {
      setCreatingCat(false);
    }
  }

  async function handleSaveCategory(categoryId: number) {
    const edits = catEdits[categoryId];
    if (!edits) return;
    setError(null);

    try {
      const payload: Parameters<typeof api.updateAdminCategory>[1] = {};
      if (typeof edits.name === 'string') payload.name = edits.name;
      if (typeof edits.nameEn === 'string') payload.nameEn = edits.nameEn;
      if (typeof edits.isActive === 'boolean') payload.isActive = edits.isActive;
      if (typeof edits.sortOrder === 'string') payload.sortOrder = Number(edits.sortOrder);
      const response = await api.updateAdminCategory(categoryId, payload);
      setCategories((current) => current.map((category) => (category.id === categoryId ? response.category : category)).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));
      setEditingCat(null);
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to update category'));
    }
  }

  async function handleCreateProduct() {
    if (creatingProd || !newProdName.trim() || !newProdPrice || !newProdCategoryId) return;
    setCreatingProd(true);
    setError(null);

    try {
      const price = parseNonNegativeNumber(newProdPrice, 'Price must be a positive number');
      if (price <= 0) {
        throw new Error('Price must be a positive number');
      }

      const cityPayload = Object.values(newProdCities).map((draft) => buildProductCityPayload(draft));
      await api.createAdminProduct({
        name: newProdName.trim(),
        nameEn: newProdNameEn.trim() || undefined,
        description: newProdDescription.trim() || undefined,
        descriptionEn: newProdDescriptionEn.trim() || undefined,
        price,
        categoryId: Number(newProdCategoryId),
        image: newProdImage.trim() || undefined,
        creditsEnabled: newProdCreditsEnabled,
        creditsPrice: newProdCreditsEnabled && newProdCreditsPrice ? Number(newProdCreditsPrice) : null,
        minCreditsRequired: newProdCreditsEnabled && newProdMinCreditsRequired ? Number(newProdMinCreditsRequired) : null,
        isActive: newProdIsActive,
        isRecommended: newProdIsRecommended,
        cities: cityPayload,
      });

      setNewProdName('');
      setNewProdNameEn('');
      setNewProdDescription('');
      setNewProdDescriptionEn('');
      setNewProdPrice('');
      setNewProdCategoryId('');
      setNewProdImage('');
      setNewProdCreditsEnabled(false);
      setNewProdCreditsPrice('');
      setNewProdMinCreditsRequired('');
      setNewProdIsActive(true);
      setNewProdIsRecommended(false);
      setNewProdCities({});
      setShowNewProduct(false);
      await refreshProducts();
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to create product'));
    } finally {
      setCreatingProd(false);
    }
  }

  async function handleSaveProduct(productId: number) {
    const edits = productEdits[productId];
    if (!edits) return;
    setError(null);

    try {
      const payload: Parameters<typeof api.updateAdminProduct>[1] = {};
      if (typeof edits.name === 'string') payload.name = edits.name;
      if (typeof edits.nameEn === 'string') payload.nameEn = edits.nameEn.trim() || null;
      if (typeof edits.description === 'string') payload.description = edits.description;
      if (typeof edits.descriptionEn === 'string') payload.descriptionEn = edits.descriptionEn.trim() || null;
      if (typeof edits.image === 'string') payload.image = edits.image.trim() || null;
      if (typeof edits.categoryId === 'string' && edits.categoryId) payload.categoryId = Number(edits.categoryId);
      if (typeof edits.price === 'string' && edits.price) payload.price = Number(edits.price);
      if (typeof edits.creditsEnabled === 'boolean') payload.creditsEnabled = edits.creditsEnabled;
      if (typeof edits.creditsPrice === 'string') payload.creditsPrice = edits.creditsPrice ? Number(edits.creditsPrice) : null;
      if (typeof edits.minCreditsRequired === 'string') payload.minCreditsRequired = edits.minCreditsRequired ? Number(edits.minCreditsRequired) : null;
      if (typeof edits.isActive === 'boolean') payload.isActive = edits.isActive;
      if (typeof edits.isRecommended === 'boolean') payload.isRecommended = edits.isRecommended;
      await api.updateAdminProduct(productId, payload);
      setEditingProduct(null);
      await refreshProducts();
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to update product'));
    }
  }

  async function handleSaveProductCity(productCityId: number) {
    const edits = productCityEdits[productCityId];
    if (!edits) return;
    setError(null);

    try {
      const payload: Parameters<typeof api.updateProductCity>[1] = {};
      if (typeof edits.stock === 'string' && edits.stock !== '') payload.stock = parseNonNegativeNumber(edits.stock, 'Stock must be zero or greater');
      if (typeof edits.isAvailable === 'boolean') payload.isAvailable = edits.isAvailable;
      if (typeof edits.minimumQuantity === 'string' && edits.minimumQuantity !== '') payload.minimumQuantity = parsePositiveInteger(edits.minimumQuantity, 'Minimum quantity must be a positive integer');
      if (typeof edits.quantityStep === 'string' && edits.quantityStep !== '') payload.quantityStep = parsePositiveInteger(edits.quantityStep, 'Quantity step must be a positive integer');
      if (typeof edits.maximumQuantity === 'string' && edits.maximumQuantity !== '') payload.maximumQuantity = parsePositiveInteger(edits.maximumQuantity, 'Maximum quantity must be a positive integer');
      if (typeof edits.unit === 'string') payload.unit = edits.unit;
      await api.updateProductCity(productCityId, payload);
      setEditingProductCity(null);
      await refreshProducts();
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to update city availability'));
    }
  }

  async function handleAddProductCity(productId: number) {
    const draft = newProductCityDrafts[productId];
    if (!draft) return;
    setError(null);

    try {
      const payload = buildProductCityPayload(draft);
      await api.createAdminProductCity({ productId, ...payload });
      setNewProductCityDrafts((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
      await refreshProducts();
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to add city availability'));
    }
  }

  async function handleCreateDiscount() {
    if (creatingDiscount || !newCode || !newValue) return;
    setCreatingDiscount(true);
    setError(null);

    try {
      const response = await api.createAdminDiscount({
        code: newCode,
        type: newType,
        value: Number(newValue),
        minOrderAmount: newMin ? Number(newMin) : 0,
      });
      setDiscounts((current) => [response.discount, ...current]);
      setNewCode('');
      setNewValue('');
      setNewMin('');
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to create discount'));
    } finally {
      setCreatingDiscount(false);
    }
  }

  async function handleSaveDiscount(discountId: number) {
    const edits = discountEdits[discountId];
    if (!edits) return;
    setError(null);

    try {
      const payload: Parameters<typeof api.updateAdminDiscount>[1] = {};
      if (typeof edits.isActive === 'boolean') payload.isActive = edits.isActive;
      if (typeof edits.usageLimit === 'string') payload.usageLimit = edits.usageLimit.trim() ? Number(edits.usageLimit) : null;
      if (typeof edits.expiresAt === 'string') payload.expiresAt = edits.expiresAt.trim() || null;
      const response = await api.updateAdminDiscount(discountId, payload);
      setDiscounts((current) => current.map((discount) => (discount.id === discountId ? response.discount : discount)));
      setEditingDiscount(null);
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to update discount'));
    }
  }

  async function handleCreateDeliveryOption() {
    if (creatingDelivery || !newDeliveryName.trim()) return;
    setError(null);
    setCreatingDelivery(true);

    try {
      const response = await api.createAdminDeliveryOption({
        name: newDeliveryName.trim(),
        nameEn: newDeliveryNameEn.trim() || undefined,
        type: newDeliveryType,
        price: parseNonNegativeNumber(newDeliveryPrice, 'Delivery price must be zero or greater'),
        sortOrder: Number(newDeliverySortOrder) || 0,
        isActive: newDeliveryIsActive,
      });
      setDeliveryOptions((current) => [...current, response.option].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id));
      setNewDeliveryName('');
      setNewDeliveryNameEn('');
      setNewDeliveryType('delivery');
      setNewDeliveryPrice('0');
      setNewDeliverySortOrder('0');
      setNewDeliveryIsActive(true);
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to create delivery option'));
    } finally {
      setCreatingDelivery(false);
    }
  }

  async function handleSaveDeliveryOption(optionId: number) {
    const edits = deliveryEdits[optionId];
    if (!edits) return;
    setError(null);

    try {
      const payload: Parameters<typeof api.updateAdminDeliveryOption>[1] = {};
      if (typeof edits.name === 'string') payload.name = edits.name;
      if (typeof edits.nameEn === 'string') payload.nameEn = edits.nameEn.trim() || null;
      if (typeof edits.type === 'string') payload.type = edits.type;
      if (typeof edits.price === 'string' && edits.price !== '') payload.price = parseNonNegativeNumber(edits.price, 'Delivery price must be zero or greater');
      if (typeof edits.isActive === 'boolean') payload.isActive = edits.isActive;
      if (typeof edits.sortOrder === 'string') payload.sortOrder = Number(edits.sortOrder);
      const response = await api.updateAdminDeliveryOption(optionId, payload);
      setDeliveryOptions((current) => current.map((option) => (option.id === optionId ? response.option : option)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id));
      setEditingDelivery(null);
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to update delivery option'));
    }
  }

  async function handleCreatePaymentMethod() {
    if (!newPaymentTitle.trim()) return;
    setError(null);

    try {
      const response = await api.createAdminPaymentSetting({
        type: newPaymentType,
        title: newPaymentTitle.trim(),
        currency: newPaymentCurrency.trim() || undefined,
        provider: newPaymentProvider.trim() || undefined,
        providerMode: newPaymentProviderMode,
        providerKey: newPaymentProviderKey.trim() || undefined,
        providerConfig: newPaymentProviderConfig.trim() || undefined,
        asset: newPaymentAsset.trim() || undefined,
        network: newPaymentNetwork.trim() || undefined,
        walletAddress: newPaymentWalletAddress.trim() || undefined,
        displayName: newPaymentDisplayName.trim() || undefined,
        instructions: newPaymentInstructions.trim() || undefined,
        sortOrder: Number(newPaymentSortOrder) || 0,
        isTonConnectEnabled: newPaymentTonConnectEnabled,
      });
      setPaymentMethods((current) => [...current, response.method].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id));
      setNewPaymentTitle('');
      setNewPaymentCurrency('');
      setNewPaymentProvider('');
      setNewPaymentProviderMode('test');
      setNewPaymentProviderKey('');
      setNewPaymentProviderConfig('');
      setNewPaymentAsset('');
      setNewPaymentNetwork('');
      setNewPaymentWalletAddress('');
      setNewPaymentDisplayName('');
      setNewPaymentInstructions('');
      setNewPaymentSortOrder('0');
      setNewPaymentTonConnectEnabled(false);
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to create payment method'));
    }
  }

  async function handleSavePaymentMethod(id: number) {
    const edits = paymentMethodEdits[id]
    if (!edits) return
    setError(null)
    try {
      const response = await api.updateAdminPaymentSetting(id, {
        title: edits.title,
        currency: edits.currency,
        provider: edits.provider,
        providerMode: edits.providerMode,
        providerKey: edits.providerKey,
        providerConfig: edits.providerConfig,
        asset: edits.asset,
        network: edits.network,
        walletAddress: edits.walletAddress,
        displayName: edits.displayName,
        instructions: edits.instructions,
        sortOrder: typeof edits.sortOrder === 'string' ? Number(edits.sortOrder) : undefined,
        isTonConnectEnabled: edits.isTonConnectEnabled,
      })
      setPaymentMethods((current) => current.map((method) => (method.id === id ? response.method : method)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id))
      setEditingPaymentMethod(null)
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to update payment method'))
    }
  }

  async function handleTogglePaymentMethod(id: number) {
    setError(null);
    try {
      const response = await api.toggleAdminPaymentSetting(id);
      setPaymentMethods((current) => current.map((method) => (method.id === id ? response.method : method)));
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to toggle payment method'));
    }
  }

  async function handleDeletePaymentMethod(id: number) {
    setError(null);
    try {
      await api.deleteAdminPaymentSetting(id);
      setPaymentMethods((current) => current.filter((method) => method.id !== id));
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to delete payment method'));
    }
  }

  async function handlePaymentStatusChange(paymentId: number, status: string) {
    const reason = paymentStatusReason[paymentId]?.trim()
    if (!reason) {
      setError('Reason is required')
      return
    }
    setError(null)
    try {
      const response = await api.updateAdminPaymentStatus(paymentId, { status, reason })
      setPaymentRecords((current) => current.map((payment) => (payment.id === paymentId ? { ...payment, ...response.payment } : payment)))
      setPaymentStatusReason((current) => ({ ...current, [paymentId]: '' }))
      await loadTab('orders')
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to update payment status'))
    }
  }

  async function handleAdminReply(ticketId: number) {
    const message = replyText[ticketId]?.trim();
    if (!message) return;
    setError(null);

    try {
      const response = await api.adminReplySupportTicket(ticketId, message);
      setTickets((current) => current.map((ticket) => (ticket.id === ticketId ? response.ticket : ticket)));
      setReplyText((current) => ({ ...current, [ticketId]: '' }));
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Failed to send reply'));
    }
  }

  async function handleLogin() {
    if (!password || authLoading) return;
    setError(null);
    setAuthLoading(true);

    try {
      const response = await api.adminLogin({ password, mode: panelMode });
      setAuthenticated(true);
      setAdminRole(response.role ?? 'admin');
      setPassword('');
      await loadTab(tab);
    } catch (e: unknown) {
      setError(getAdminErrorMessage(e, 'Login failed'));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    setError(null);
    try {
      await api.adminLogout();
    } finally {
      setAuthenticated(false);
      setAdminRole('admin');
    }

    async function handleCreateAdministrator() {
      if (adminRole !== 'owner') return;
      setError(null);
      try {
        const response = await api.createAdministrator({ username: newAdminUsername.trim() || undefined });
        setGeneratedAdminPassword(response.generatedPassword);
        setNewAdminUsername('');
        const refreshed = await api.getAdminAdministrators();
        setAdministrators(refreshed.administrators);
      } catch (e: unknown) {
        setError(getAdminErrorMessage(e, 'Failed to create administrator'));
      }
    }

    async function handleToggleAdministrator(adminId: number, isActive: boolean) {
      if (adminRole !== 'owner') return;
      setError(null);
      try {
        const response = await api.updateAdministrator(adminId, { isActive });
        setAdministrators((current) => current.map((item) => (item.id === adminId ? response.administrator : item)));
      } catch (e: unknown) {
        setError(getAdminErrorMessage(e, 'Failed to update administrator'));
      }
    }

    async function handleDeleteAdministrator(adminId: number) {
      if (adminRole !== 'owner') return;
      setError(null);
      try {
        await api.deleteAdministrator(adminId);
        setAdministrators((current) => current.filter((item) => item.id !== adminId));
      } catch (e: unknown) {
        setError(getAdminErrorMessage(e, 'Failed to delete administrator'));
      }
    }

    async function handleResetAdministratorPassword(adminId: number) {
      if (adminRole !== 'owner') return;
      setError(null);
      try {
        const response = await api.resetAdministratorPassword(adminId);
        setGeneratedAdminPassword(response.generatedPassword);
      } catch (e: unknown) {
        setError(getAdminErrorMessage(e, 'Failed to reset administrator password'));
      }
    }

    async function handleSaveShopName() {
      if (adminRole !== 'owner') return;
      setError(null);
      try {
        const response = await api.updateAdminSettings({ shopName: shopName.trim() });
        setShopName(response.shopName);
      } catch (e: unknown) {
        setError(getAdminErrorMessage(e, 'Failed to update shop name'));
      }
    }

    async function handleChangePassword(target: 'self' | 'owner') {
      if (!currentPassword.trim() || !newPassword.trim()) return;
      setError(null);
      try {
        await api.adminChangePassword({
          currentPassword: currentPassword.trim(),
          newPassword: newPassword.trim(),
          target,
        });
        setCurrentPassword('');
        setNewPassword('');
        setAuthenticated(false);
      } catch (e: unknown) {
        setError(getAdminErrorMessage(e, 'Failed to change password'));
      }
    }
  }

  if (!authChecked) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}><Settings size={18} strokeWidth={1.5} style={{ verticalAlign: 'middle', marginRight: 8 }} />{panelTitle}</h1>
        <p className={styles.loading}>{t('common.loading', { defaultValue: 'Loading...' })}</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}><Settings size={18} strokeWidth={1.5} style={{ verticalAlign: 'middle', marginRight: 8 }} />{panelTitle}</h1>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.form}>
          <h3 className={styles.formTitle}>{loginTitle}</h3>
          <input
            className={styles.input}
            type="password"
            placeholder={t('admin.password', { defaultValue: 'Password' })}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void handleLogin()}
          />
          <button className={styles.createBtn} onClick={() => void handleLogin()} disabled={authLoading || !password}>
            {authLoading ? t('common.loading', { defaultValue: 'Loading...' }) : t('common.login', { defaultValue: 'Login' })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}><Settings size={18} strokeWidth={1.5} style={{ verticalAlign: 'middle', marginRight: 8 }} />{panelTitle}</h1>
      <div className={styles.filterRow}>
        <button className={styles.filterBtn} onClick={() => navigate('/shop')} type="button">
          Вернуться в магазин
        </button>
        <button className={styles.filterBtn} onClick={() => void handleLogout()}>
          {t('common.logout', { defaultValue: 'Logout' })}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tabs}>
        {tabs.map((tabName) => (
          <button
            key={tabName}
            className={`${styles.tab} ${tab === tabName ? styles.tabActive : ''}`}
            onClick={() => setTab(tabName)}
          >
            {t(`admin.tab_${tabName}`, { defaultValue: tabName })}
          </button>
        ))}
      </div>

      {tab === 'stats' && stats && (
        <div className={styles.stats}>
          <div className={styles.statCard}><span className={styles.statValue}>{stats.totalOrders}</span><span>{t('admin.totalOrders', { defaultValue: 'Total Orders' })}</span></div>
          <div className={styles.statCard}><span className={styles.statValue}>{stats.pendingOrders}</span><span>{t('admin.pendingOrders', { defaultValue: 'Pending' })}</span></div>
          <div className={styles.statCard}><span className={styles.statValue}>{stats.totalUsers}</span><span>{t('admin.totalUsers', { defaultValue: 'Users' })}</span></div>
          <div className={styles.statCard}><span className={styles.statValue}>{formatCurrency(stats.totalRevenue, language)}</span><span>{t('admin.revenue', { defaultValue: 'Revenue' })}</span></div>
        </div>
      )}

      {tab === 'orders' && (
        <div>
          <div className={styles.filterRow}>
            <select className={styles.filterSelect} value={orderFilter} onChange={(event) => setOrderFilter(event.target.value)}>
              <option value="">{t('admin.allStatuses', { defaultValue: 'All statuses' })}</option>
              {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <button className={styles.filterBtn} onClick={() => void loadTab('orders')}>
              {t('admin.filter', { defaultValue: 'Filter' })}
            </button>
          </div>
          {ordersLoading ? <p className={styles.loading}>{t('common.loading', { defaultValue: 'Loading...' })}</p> : (
            <div className={styles.orderList}>
              {orders.map((order) => (
                <div key={order.id} className={styles.orderCard}>
                  <div className={styles.orderHeader}>
                    <span className={styles.orderId}>#{order.id}</span>
                    <span className={styles.orderTotal}>{formatCurrency(order.total, language)}</span>
                  </div>
                  <p className={styles.orderMeta}>
                    {new Date(order.createdAt).toLocaleString()} • {order.city?.name ?? ''}
                  </p>
                  {order.user && (
                    <p className={styles.orderMeta}>
                      {order.user.firstName}{order.user.username ? ` @${order.user.username}` : ''} • TG: {order.user.telegramId}
                    </p>
                  )}
                  {order.paymentMethod && (
                    <p className={styles.orderMeta}>
                      {t('checkout.paymentMethod', { defaultValue: 'Payment method' })}: {order.paymentMethod.title}
                      {order.paymentStatus ? ` • ${order.paymentStatus}` : ''}
                    </p>
                  )}
                  <div className={styles.statusRow}>
                    <select
                      className={styles.statusSelect}
                      value={order.status}
                      onChange={(event) => void handleStatusChange(order.id, event.target.value)}
                      disabled={updatingOrder === order.id}
                    >
                      {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                    {order.refundStatus && (
                      <span className={styles.refundTag}>Refund: {order.refundStatus}</span>
                    )}
                  </div>
                  {order.status === 'payment_pending' && ['pending', 'processing'].includes(order.paymentStatus ?? '') && (
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => void handleConfirmPendingPayment(order.id)}>
                        {t('admin.confirmPayment', { defaultValue: 'Confirm payment' })}
                      </button>
                      <button className={styles.replyBtn} onClick={() => void handleRejectPendingPayment(order.id)}>
                        {t('admin.rejectPayment', { defaultValue: 'Reject payment' })}
                      </button>
                    </div>
                  )}
                  {order.items.length > 0 && (
                    <div>
                      <button
                        className={styles.replyBtn}
                        style={{ marginTop: 6, fontSize: 11 }}
                        onClick={() => setExpandedOrder((current) => (current === order.id ? null : order.id))}
                      >
                        {expandedOrder === order.id ? 'Hide items' : `${order.items.length} items`}
                      </button>
                      {expandedOrder === order.id && (
                        <div className={styles.cityStockList}>
                          {order.items.map((item) => (
                            <div key={item.id} className={styles.cityStockRow}>
                              <span className={styles.cityName}>{item.productName}</span>
                              <span>×{item.quantity}</span>
                              <span>{formatCurrency(item.price, language)}</span>
                              <span>{formatCurrency(item.lineTotal, language)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'products' && (
        <div>
          <div className={styles.filterRow}>
            <button className={styles.filterBtn} onClick={() => void refreshProducts()}>
              {t('admin.refresh', { defaultValue: 'Refresh' })}
            </button>
            <button className={styles.createBtn} onClick={() => setShowNewProduct((current) => !current)}>
              {showNewProduct ? <><X size={14} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 4 }} />{t('common.cancel', { defaultValue: 'Cancel' })}</> : t('admin.newProduct', { defaultValue: 'New product' })}
            </button>
          </div>

          {showNewProduct && (
            <div className={styles.form}>
              <p className={styles.formTitle}>{t('admin.newProduct', { defaultValue: 'New product' })}</p>
              <div className={styles.formRow}>
                <input className={styles.input} placeholder="Name *" value={newProdName} onChange={(event) => setNewProdName(event.target.value)} />
                <input className={styles.input} placeholder="Name EN" value={newProdNameEn} onChange={(event) => setNewProdNameEn(event.target.value)} />
              </div>
              <div className={styles.formRow}>
                <input className={styles.input} placeholder="Description" value={newProdDescription} onChange={(event) => setNewProdDescription(event.target.value)} />
                <input className={styles.input} placeholder="Description EN" value={newProdDescriptionEn} onChange={(event) => setNewProdDescriptionEn(event.target.value)} />
              </div>
              <div className={styles.formRow}>
                <input className={styles.input} type="number" placeholder="Price *" value={newProdPrice} onChange={(event) => setNewProdPrice(event.target.value)} />
                <select className={styles.select} value={newProdCategoryId} onChange={(event) => setNewProdCategoryId(event.target.value)}>
                  <option value="">{t('admin.category', { defaultValue: 'Category' })} *</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>
              <div className={styles.formRow}>
                <label className={styles.checkLabel}><input type="checkbox" checked={newProdCreditsEnabled} onChange={(event) => setNewProdCreditsEnabled(event.target.checked)} /> Casino Credits</label>
                <input className={styles.input} type="number" placeholder="Credits price" value={newProdCreditsPrice} onChange={(event) => setNewProdCreditsPrice(event.target.value)} />
                <input className={styles.input} type="number" placeholder="Min credits" value={newProdMinCreditsRequired} onChange={(event) => setNewProdMinCreditsRequired(event.target.value)} />
              </div>
              <div className={styles.formRow}>
                <input className={styles.input} placeholder="Image URL" value={newProdImage} onChange={(event) => setNewProdImage(event.target.value)} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.checkLabel}><input type="checkbox" checked={newProdIsActive} onChange={(event) => setNewProdIsActive(event.target.checked)} /> {t('admin.active', { defaultValue: 'Active' })}</label>
                <label className={styles.checkLabel}><input type="checkbox" checked={newProdIsRecommended} onChange={(event) => setNewProdIsRecommended(event.target.checked)} /> {t('admin.recommended', { defaultValue: 'Recommended' })}</label>
              </div>
              {cities.length > 0 && (
                <div>
                  <p className={styles.formTitle} style={{ fontSize: 12 }}>{t('admin.cityAvailability', { defaultValue: 'City availability' })}</p>
                  {cities.map((city) => {
                    const entry = newProdCities[city.id];
                    return (
                      <div key={city.id} className={styles.cityStockRow}>
                        <label className={styles.checkLabel}>
                          <input
                            type="checkbox"
                            checked={Boolean(entry)}
                            onChange={(event) => {
                              setNewProdCities((current) => {
                                const next = { ...current };
                                if (event.target.checked) {
                                  next[city.id] = createDefaultProductCityDraft(String(city.id));
                                } else {
                                  delete next[city.id];
                                }
                                return next;
                              });
                            }}
                          />
                          <span className={styles.cityName}>{city.name}</span>
                        </label>
                        {entry && (
                          <>
                            <input className={styles.inputSmall} type="number" placeholder="Stock" value={entry.stock} onChange={(event) => setNewProdCities((current) => ({ ...current, [city.id]: { ...current[city.id], stock: event.target.value } }))} />
                            <input className={styles.inputSmall} type="number" placeholder="Min" value={entry.minimumQuantity} onChange={(event) => setNewProdCities((current) => ({ ...current, [city.id]: { ...current[city.id], minimumQuantity: event.target.value } }))} />
                            <input className={styles.inputSmall} type="number" placeholder="Step" value={entry.quantityStep} onChange={(event) => setNewProdCities((current) => ({ ...current, [city.id]: { ...current[city.id], quantityStep: event.target.value } }))} />
                            <input className={styles.inputSmall} type="number" placeholder="Max" value={entry.maximumQuantity} onChange={(event) => setNewProdCities((current) => ({ ...current, [city.id]: { ...current[city.id], maximumQuantity: event.target.value } }))} />
                            <input className={styles.inputSmall} placeholder="Unit" value={entry.unit} onChange={(event) => setNewProdCities((current) => ({ ...current, [city.id]: { ...current[city.id], unit: event.target.value } }))} />
                            <label className={styles.checkLabel}>
                              <input type="checkbox" checked={entry.isAvailable} onChange={(event) => setNewProdCities((current) => ({ ...current, [city.id]: { ...current[city.id], isAvailable: event.target.checked } }))} />
                              {t('admin.available', { defaultValue: 'Available' })}
                            </label>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <button className={styles.createBtn} onClick={() => void handleCreateProduct()} disabled={creatingProd || !newProdName.trim() || !newProdPrice || !newProdCategoryId}>
                {creatingProd ? t('common.loading', { defaultValue: 'Loading...' }) : t('admin.createProduct', { defaultValue: 'Create product' })}
              </button>
            </div>
          )}

          <div className={styles.orderList}>
            {products.map((product) => {
              const availableCities = cities.filter((city) => !product.productCities.some((productCity) => productCity.cityId === city.id));
              const addCityDraft = newProductCityDrafts[product.id] ?? createDefaultProductCityDraft(availableCities[0] ? String(availableCities[0].id) : '');
              return (
                <div key={product.id} className={styles.orderCard}>
                  <div className={styles.orderHeader}>
                    <span className={styles.orderId}>#{product.id} {product.name}</span>
                    <span className={`${styles.refundTag} ${product.isActive ? styles.tagActive : styles.tagInactive}`}>
                      {product.isActive ? t('admin.active', { defaultValue: 'Active' }) : t('admin.inactive', { defaultValue: 'Inactive' })}
                    </span>
                  </div>
                  <p className={styles.orderMeta}>
                    {product.category.name} • {formatCurrency(product.price, language)}
                    {product.isRecommended ? <Star size={12} strokeWidth={1.5} fill="currentColor" style={{ verticalAlign: 'middle', marginLeft: 4 }} /> : null}
                  </p>
                  {product.image && <p className={styles.orderMeta}>{product.image}</p>}
                  {product.description && <p className={styles.orderMeta}>{product.description}</p>}

                  {editingProduct === product.id ? (
                    <div className={styles.form}>
                      <div className={styles.formRow}>
                        <input className={styles.input} placeholder="Name" value={productEdits[product.id]?.name ?? product.name} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], name: event.target.value } }))} />
                        <input className={styles.input} placeholder="Name EN" value={productEdits[product.id]?.nameEn ?? (product.nameEn ?? '')} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], nameEn: event.target.value } }))} />
                      </div>
                      <div className={styles.formRow}>
                        <input className={styles.input} placeholder="Description" value={productEdits[product.id]?.description ?? product.description} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], description: event.target.value } }))} />
                        <input className={styles.input} placeholder="Description EN" value={productEdits[product.id]?.descriptionEn ?? (product.descriptionEn ?? '')} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], descriptionEn: event.target.value } }))} />
                      </div>
                      <div className={styles.formRow}>
                        <input className={styles.input} type="number" placeholder="Price" value={productEdits[product.id]?.price ?? String(product.price)} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], price: event.target.value } }))} />
                        <select className={styles.select} value={productEdits[product.id]?.categoryId ?? String(product.categoryId)} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], categoryId: event.target.value } }))}>
                          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </select>
                      </div>
                      <div className={styles.formRow}>
                        <label className={styles.checkLabel}>
                          <input type="checkbox" checked={productEdits[product.id]?.creditsEnabled ?? Boolean(product.creditsEnabled)} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], creditsEnabled: event.target.checked } }))} />
                          Casino Credits
                        </label>
                        <input className={styles.input} type="number" placeholder="Credits price" value={productEdits[product.id]?.creditsPrice ?? String(product.creditsPrice ?? '')} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], creditsPrice: event.target.value } }))} />
                        <input className={styles.input} type="number" placeholder="Min credits" value={productEdits[product.id]?.minCreditsRequired ?? String(product.minCreditsRequired ?? '')} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], minCreditsRequired: event.target.value } }))} />
                      </div>
                      <div className={styles.formRow}>
                        <input className={styles.input} placeholder="Image URL" value={productEdits[product.id]?.image ?? (product.image ?? '')} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], image: event.target.value } }))} />
                      </div>
                      <div className={styles.formRow}>
                        <label className={styles.checkLabel}>
                          <input type="checkbox" checked={productEdits[product.id]?.isActive ?? product.isActive} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], isActive: event.target.checked } }))} />
                          {t('admin.active', { defaultValue: 'Active' })}
                        </label>
                        <label className={styles.checkLabel}>
                          <input type="checkbox" checked={productEdits[product.id]?.isRecommended ?? product.isRecommended} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], isRecommended: event.target.checked } }))} />
                          {t('admin.recommended', { defaultValue: 'Recommended' })}
                        </label>
                      </div>
                      <div className={styles.replyRow}>
                        <button className={styles.replyBtn} onClick={() => void handleSaveProduct(product.id)}>{t('common.save', { defaultValue: 'Save' })}</button>
                        <button className={styles.replyBtn} onClick={() => setEditingProduct(null)}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => { setEditingProduct(product.id); setProductEdits((current) => ({ ...current, [product.id]: {} })); }}>
                        {t('admin.editProduct', { defaultValue: 'Edit' })}
                      </button>
                    </div>
                  )}

                  {product.productCities.length > 0 && (
                    <div className={styles.cityStockList}>
                      {product.productCities.map((productCity) => (
                        <div key={productCity.id} className={styles.cityStockRow}>
                          <span className={styles.cityName}>{productCity.city.name}</span>
                          {editingProductCity === productCity.id ? (
                            <>
                              <input className={styles.inputSmall} type="number" placeholder="Stock" value={productCityEdits[productCity.id]?.stock ?? String(productCity.stock)} onChange={(event) => setProductCityEdits((current) => ({ ...current, [productCity.id]: { ...current[productCity.id], stock: event.target.value } }))} />
                              <input className={styles.inputSmall} type="number" placeholder="Min" value={productCityEdits[productCity.id]?.minimumQuantity ?? String(productCity.minimumQuantity)} onChange={(event) => setProductCityEdits((current) => ({ ...current, [productCity.id]: { ...current[productCity.id], minimumQuantity: event.target.value } }))} />
                              <input className={styles.inputSmall} type="number" placeholder="Step" value={productCityEdits[productCity.id]?.quantityStep ?? String(productCity.quantityStep)} onChange={(event) => setProductCityEdits((current) => ({ ...current, [productCity.id]: { ...current[productCity.id], quantityStep: event.target.value } }))} />
                              <input className={styles.inputSmall} type="number" placeholder="Max" value={productCityEdits[productCity.id]?.maximumQuantity ?? String(productCity.maximumQuantity)} onChange={(event) => setProductCityEdits((current) => ({ ...current, [productCity.id]: { ...current[productCity.id], maximumQuantity: event.target.value } }))} />
                              <input className={styles.inputSmall} placeholder="Unit" value={productCityEdits[productCity.id]?.unit ?? productCity.unit} onChange={(event) => setProductCityEdits((current) => ({ ...current, [productCity.id]: { ...current[productCity.id], unit: event.target.value } }))} />
                              <label className={styles.checkLabel}>
                                <input type="checkbox" checked={productCityEdits[productCity.id]?.isAvailable ?? productCity.isAvailable} onChange={(event) => setProductCityEdits((current) => ({ ...current, [productCity.id]: { ...current[productCity.id], isAvailable: event.target.checked } }))} />
                                {t('admin.available', { defaultValue: 'Available' })}
                              </label>
                              <button className={styles.replyBtn} onClick={() => void handleSaveProductCity(productCity.id)}>{t('common.save', { defaultValue: 'Save' })}</button>
                              <button className={styles.replyBtn} onClick={() => setEditingProductCity(null)}><X size={14} strokeWidth={2} /></button>
                            </>
                          ) : (
                            <>
                              <span>Stock: {productCity.stock}</span>
                              <span>Min: {productCity.minimumQuantity}</span>
                              <span>Step: {productCity.quantityStep}</span>
                              <span>Max: {productCity.maximumQuantity}</span>
                              <span>Unit: {productCity.unit}</span>
                              <span>{productCity.isAvailable ? <><Check size={12} strokeWidth={2} style={{ verticalAlign: 'middle' }} /> {t('admin.available', { defaultValue: 'Available' })}</> : <><X size={12} strokeWidth={2} style={{ verticalAlign: 'middle' }} /> {t('admin.unavailable', { defaultValue: 'Unavailable' })}</>}</span>
                              <button className={styles.replyBtn} onClick={() => { setEditingProductCity(productCity.id); setProductCityEdits((current) => ({ ...current, [productCity.id]: {} })); }}>{t('admin.editStock', { defaultValue: 'Edit city' })}</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {availableCities.length > 0 && (
                    <div className={styles.form}>
                      <p className={styles.formTitle}>{t('admin.addCityAssignment', { defaultValue: 'Add city availability' })}</p>
                      <div className={styles.formRow}>
                        <select
                          className={styles.select}
                          value={addCityDraft.cityId}
                          onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, cityId: event.target.value } }))}
                        >
                          {availableCities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
                        </select>
                        <input className={styles.inputSmall} type="number" placeholder="Stock" value={addCityDraft.stock} onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, stock: event.target.value } }))} />
                        <input className={styles.inputSmall} type="number" placeholder="Min" value={addCityDraft.minimumQuantity} onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, minimumQuantity: event.target.value } }))} />
                        <input className={styles.inputSmall} type="number" placeholder="Step" value={addCityDraft.quantityStep} onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, quantityStep: event.target.value } }))} />
                        <input className={styles.inputSmall} type="number" placeholder="Max" value={addCityDraft.maximumQuantity} onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, maximumQuantity: event.target.value } }))} />
                        <input className={styles.inputSmall} placeholder="Unit" value={addCityDraft.unit} onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, unit: event.target.value } }))} />
                      </div>
                      <div className={styles.replyRow}>
                        <label className={styles.checkLabel}>
                          <input type="checkbox" checked={addCityDraft.isAvailable} onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, isAvailable: event.target.checked } }))} />
                          {t('admin.available', { defaultValue: 'Available' })}
                        </label>
                        <button className={styles.replyBtn} onClick={() => void handleAddProductCity(product.id)}>
                          {t('admin.addCityAssignment', { defaultValue: 'Add city availability' })}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {products.length === 0 && <p className={styles.loading}>{t('admin.noProducts', { defaultValue: 'No products found.' })}</p>}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div>
          <div className={styles.filterRow}>
            <button className={styles.filterBtn} onClick={() => void loadTab('users')}>
              {t('admin.refresh', { defaultValue: 'Refresh' })}
            </button>
          </div>
          <div className={styles.orderList}>
            {users.map((user) => (
              <div key={user.id} className={styles.orderCard}>
                <div className={styles.orderHeader}>
                  <span className={styles.orderId}>
                    {user.firstName}{user.lastName ? ` ${user.lastName}` : ''}{user.username ? ` @${user.username}` : ''}
                  </span>
                  {user.language && <span className={styles.orderMeta}>{user.language.toUpperCase()}</span>}
                </div>
                <p className={styles.orderMeta}>TG: {user.telegramId}{user.selectedCity ? <> • <MapPin size={12} strokeWidth={1.5} style={{ verticalAlign: 'middle' }} /> {user.selectedCity.name}</> : ''}</p>
                {user.balance != null && <p className={styles.orderMeta}>Balance: {formatCurrency(user.balance, language)}</p>}
                <p className={styles.orderMeta}>{t('orders.title', { defaultValue: 'Orders' })}: {user.orderCount ?? 0}</p>
              </div>
            ))}
            {users.length === 0 && <p className={styles.loading}>{t('admin.noUsers', { defaultValue: 'No users found.' })}</p>}
          </div>

          {adminRole === 'owner' && (
            <>
              <div className={styles.form}>
                <h3 className={styles.formTitle}>Owner Settings</h3>
                <div className={styles.formRow}>
                  <input
                    className={styles.input}
                    placeholder="Shop name"
                    value={shopName}
                    onChange={(event) => setShopName(event.target.value)}
                  />
                  <button className={styles.createBtn} onClick={() => void handleSaveShopName()} disabled={!shopName.trim()}>
                    Save shop name
                  </button>
                </div>
              </div>

              <div className={styles.form}>
                <h3 className={styles.formTitle}>Change password</h3>
                <div className={styles.formRow}>
                  <input className={styles.input} type="password" placeholder="Current password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                  <input className={styles.input} type="password" placeholder="New password (min 10 chars)" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                </div>
                <div className={styles.replyRow}>
                  <button className={styles.replyBtn} onClick={() => void handleChangePassword('self')}>Change my password</button>
                  <button className={styles.replyBtn} onClick={() => void handleChangePassword('owner')}>Change OWNER password</button>
                </div>
              </div>

              <div className={styles.form}>
                <h3 className={styles.formTitle}>Administrators</h3>
                <div className={styles.formRow}>
                  <input className={styles.input} placeholder="Username (optional)" value={newAdminUsername} onChange={(event) => setNewAdminUsername(event.target.value)} />
                  <button className={styles.createBtn} onClick={() => void handleCreateAdministrator()}>Create administrator</button>
                </div>
                {generatedAdminPassword ? <p className={styles.orderMeta}>Generated password: <strong>{generatedAdminPassword}</strong></p> : null}
              </div>

              <div className={styles.discountList}>
                {administrators.map((administrator) => (
                  <div key={administrator.id} className={styles.discountCard}>
                    <div>
                      <span className={styles.discountCode}>{administrator.username}</span>
                      <span className={styles.orderMeta}> • {administrator.role}</span>
                      <span className={`${styles.refundTag} ${administrator.isActive ? styles.tagActive : styles.tagInactive}`}>
                        {administrator.isActive ? 'active' : 'inactive'}
                      </span>
                    </div>
                    {administrator.role !== 'owner' ? (
                      <div className={styles.replyRow}>
                        <button className={styles.replyBtn} onClick={() => void handleToggleAdministrator(administrator.id, !administrator.isActive)}>
                          {administrator.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className={styles.replyBtn} onClick={() => void handleResetAdministratorPassword(administrator.id)}>
                          Reset password
                        </button>
                        <button className={styles.replyBtn} onClick={() => void handleDeleteAdministrator(administrator.id)}>
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'cities' && (
        <div>
          <div className={styles.form}>
            <h3 className={styles.formTitle}>{t('admin.createCity', { defaultValue: 'Create city' })}</h3>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder="Name" value={newCityName} onChange={(event) => setNewCityName(event.target.value)} />
              <input className={styles.input} placeholder="Name EN" value={newCityNameEn} onChange={(event) => setNewCityNameEn(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} type="number" placeholder="Sort order" value={newCitySortOrder} onChange={(event) => setNewCitySortOrder(event.target.value)} />
              <label className={styles.checkLabel}><input type="checkbox" checked={newCityIsActive} onChange={(event) => setNewCityIsActive(event.target.checked)} /> {t('admin.active', { defaultValue: 'Active' })}</label>
            </div>
            <button className={styles.createBtn} onClick={() => void handleCreateCity()} disabled={creatingCity || !newCityName.trim()}>
              {creatingCity ? t('common.loading', { defaultValue: 'Loading...' }) : t('admin.createCity', { defaultValue: 'Create city' })}
            </button>
          </div>

          <div className={styles.discountList}>
            {cities.map((city) => (
              <div key={city.id} className={styles.discountCard}>
                {editingCity === city.id ? (
                  <div className={styles.form} style={{ marginBottom: 0, width: '100%' }}>
                    <div className={styles.formRow}>
                      <input className={styles.input} placeholder="Name" value={cityEdits[city.id]?.name ?? city.name} onChange={(event) => setCityEdits((current) => ({ ...current, [city.id]: { ...current[city.id], name: event.target.value } }))} />
                      <input className={styles.input} placeholder="Name EN" value={cityEdits[city.id]?.nameEn ?? (city.nameEn ?? '')} onChange={(event) => setCityEdits((current) => ({ ...current, [city.id]: { ...current[city.id], nameEn: event.target.value } }))} />
                    </div>
                    <div className={styles.formRow}>
                      <input className={styles.input} type="number" placeholder="Sort order" value={cityEdits[city.id]?.sortOrder ?? String(city.sortOrder)} onChange={(event) => setCityEdits((current) => ({ ...current, [city.id]: { ...current[city.id], sortOrder: event.target.value } }))} />
                      <label className={styles.checkLabel}><input type="checkbox" checked={cityEdits[city.id]?.isActive ?? city.isActive} onChange={(event) => setCityEdits((current) => ({ ...current, [city.id]: { ...current[city.id], isActive: event.target.checked } }))} /> {t('admin.active', { defaultValue: 'Active' })}</label>
                    </div>
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => void handleSaveCity(city.id)}>{t('common.save', { defaultValue: 'Save' })}</button>
                      <button className={styles.replyBtn} onClick={() => setEditingCity(null)}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className={styles.discountCode}>{city.name}</span>
                      {city.nameEn ? <span> / {city.nameEn}</span> : null}
                      <span className={`${styles.refundTag} ${city.isActive ? styles.tagActive : styles.tagInactive}`}>
                        {city.isActive ? t('admin.active', { defaultValue: 'Active' }) : t('admin.inactive', { defaultValue: 'Inactive' })}
                      </span>
                      <span className={styles.orderMeta}> • {t('admin.sortOrder', { defaultValue: 'Sort' })}: {city.sortOrder}</span>
                      {city._count ? <span className={styles.orderMeta}> • {city._count.users} users • {city._count.productCities} product cities • {city._count.orders} orders</span> : null}
                    </div>
                    <button className={styles.replyBtn} onClick={() => { setEditingCity(city.id); setCityEdits((current) => ({ ...current, [city.id]: {} })); }}>{t('common.edit', { defaultValue: 'Edit' })}</button>
                  </>
                )}
              </div>
            ))}
            {cities.length === 0 && <p className={styles.loading}>{t('admin.noCities', { defaultValue: 'No cities found.' })}</p>}
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div>
          <div className={styles.form}>
            <h3 className={styles.formTitle}>{t('admin.createCategory', { defaultValue: 'Create category' })}</h3>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder="Name (RU)" value={newCatName} onChange={(event) => setNewCatName(event.target.value)} />
              <input className={styles.input} placeholder="Name (EN)" value={newCatNameEn} onChange={(event) => setNewCatNameEn(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} type="number" placeholder="Sort order" value={newCatOrder} onChange={(event) => setNewCatOrder(event.target.value)} />
            </div>
            <button className={styles.createBtn} onClick={() => void handleCreateCategory()} disabled={creatingCat || !newCatName.trim()}>
              {creatingCat ? t('common.loading', { defaultValue: 'Loading...' }) : t('admin.createCategory', { defaultValue: 'Create' })}
            </button>
          </div>

          <div className={styles.discountList}>
            {categories.map((category) => (
              <div key={category.id} className={styles.discountCard}>
                {editingCat === category.id ? (
                  <div className={styles.form}>
                    <div className={styles.formRow}>
                      <input className={styles.input} placeholder="Name (RU)" value={catEdits[category.id]?.name ?? category.name} onChange={(event) => setCatEdits((current) => ({ ...current, [category.id]: { ...current[category.id], name: event.target.value } }))} />
                      <input className={styles.input} placeholder="Name (EN)" value={catEdits[category.id]?.nameEn ?? (category.nameEn ?? '')} onChange={(event) => setCatEdits((current) => ({ ...current, [category.id]: { ...current[category.id], nameEn: event.target.value } }))} />
                    </div>
                    <div className={styles.formRow}>
                      <input className={styles.input} type="number" placeholder="Sort order" value={catEdits[category.id]?.sortOrder ?? String(category.sortOrder ?? 0)} onChange={(event) => setCatEdits((current) => ({ ...current, [category.id]: { ...current[category.id], sortOrder: event.target.value } }))} />
                      <label className={styles.checkLabel}>
                        <input type="checkbox" checked={catEdits[category.id]?.isActive ?? category.isActive} onChange={(event) => setCatEdits((current) => ({ ...current, [category.id]: { ...current[category.id], isActive: event.target.checked } }))} />
                        {t('admin.active', { defaultValue: 'Active' })}
                      </label>
                    </div>
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => void handleSaveCategory(category.id)}>{t('common.save', { defaultValue: 'Save' })}</button>
                      <button className={styles.replyBtn} onClick={() => setEditingCat(null)}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className={styles.discountCode}>{category.name}</span>
                      {category.nameEn ? <span> / {category.nameEn}</span> : null}
                      <span className={`${styles.refundTag} ${category.isActive ? styles.tagActive : styles.tagInactive}`}>
                        {category.isActive ? t('admin.active', { defaultValue: 'Active' }) : t('admin.inactive', { defaultValue: 'Inactive' })}
                      </span>
                      <span className={styles.orderMeta}> • {category._count.products} products</span>
                    </div>
                    <button className={styles.replyBtn} onClick={() => { setEditingCat(category.id); setCatEdits((current) => ({ ...current, [category.id]: {} })); }}>{t('common.edit', { defaultValue: 'Edit' })}</button>
                  </>
                )}
              </div>
            ))}
            {categories.length === 0 && <p className={styles.loading}>{t('admin.noCategories', { defaultValue: 'No categories found.' })}</p>}
          </div>
        </div>
      )}

      {tab === 'discounts' && (
        <div>
          <div className={styles.form}>
            <h3 className={styles.formTitle}>{t('admin.createDiscount', { defaultValue: 'Create discount code' })}</h3>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder="Code" value={newCode} onChange={(event) => setNewCode(event.target.value.toUpperCase())} />
              <select className={styles.select} value={newType} onChange={(event) => setNewType(event.target.value)}>
                <option value="percent">%</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} type="number" placeholder="Value" value={newValue} onChange={(event) => setNewValue(event.target.value)} />
              <input className={styles.input} type="number" placeholder="Min order" value={newMin} onChange={(event) => setNewMin(event.target.value)} />
            </div>
            <button className={styles.createBtn} onClick={() => void handleCreateDiscount()} disabled={creatingDiscount || !newCode || !newValue}>
              {creatingDiscount ? t('common.loading', { defaultValue: 'Loading...' }) : t('admin.createDiscount', { defaultValue: 'Create' })}
            </button>
          </div>
          <div className={styles.discountList}>
            {discounts.map((discount) => (
              <div key={discount.id} className={styles.discountCard}>
                {editingDiscount === discount.id ? (
                  <div className={styles.form} style={{ marginBottom: 0, width: '100%' }}>
                    <div className={styles.formRow}>
                      <input
                        className={styles.input}
                        type="number"
                        placeholder="Usage limit"
                        value={discountEdits[discount.id]?.usageLimit ?? String(discount.usageLimit ?? '')}
                        onChange={(event) => setDiscountEdits((current) => ({ ...current, [discount.id]: { ...current[discount.id], usageLimit: event.target.value } }))}
                      />
                      <input
                        className={styles.input}
                        type="datetime-local"
                        value={discountEdits[discount.id]?.expiresAt ?? (discount.expiresAt ? discount.expiresAt.slice(0, 16) : '')}
                        onChange={(event) => setDiscountEdits((current) => ({ ...current, [discount.id]: { ...current[discount.id], expiresAt: event.target.value } }))}
                      />
                    </div>
                    <div className={styles.formRow}>
                      <label className={styles.checkLabel}>
                        <input
                          type="checkbox"
                          checked={discountEdits[discount.id]?.isActive ?? Boolean(discount.isActive ?? true)}
                          onChange={(event) => setDiscountEdits((current) => ({ ...current, [discount.id]: { ...current[discount.id], isActive: event.target.checked } }))}
                        />
                        {t('admin.active', { defaultValue: 'Active' })}
                      </label>
                    </div>
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => void handleSaveDiscount(discount.id)}>{t('common.save', { defaultValue: 'Save' })}</button>
                      <button className={styles.replyBtn} onClick={() => setEditingDiscount(null)}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className={styles.discountCode}>{discount.code}</span>
                    <span>{discount.value}{discount.type === 'percent' ? '%' : ' fixed'}</span>
                    <span>{t('admin.minOrder', { defaultValue: 'Min' })}: {discount.minOrderAmount}</span>
                    <span>{t('admin.usageLimit', { defaultValue: 'Limit' })}: {discount.usageLimit ?? '∞'}</span>
                    <span className={`${styles.refundTag} ${discount.isActive ?? true ? styles.tagActive : styles.tagInactive}`}>
                      {discount.isActive ?? true ? t('admin.active', { defaultValue: 'Active' }) : t('admin.inactive', { defaultValue: 'Inactive' })}
                    </span>
                    <button className={styles.replyBtn} onClick={() => { setEditingDiscount(discount.id); setDiscountEdits((current) => ({ ...current, [discount.id]: {} })); }}>
                      {t('common.edit', { defaultValue: 'Edit' })}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'delivery' && (
        <div>
          <div className={styles.form}>
            <h3 className={styles.formTitle}>{t('admin.deliveryOptions', { defaultValue: 'Delivery options' })}</h3>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder="Name" value={newDeliveryName} onChange={(event) => setNewDeliveryName(event.target.value)} />
              <input className={styles.input} placeholder="Name EN" value={newDeliveryNameEn} onChange={(event) => setNewDeliveryNameEn(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <select className={styles.select} value={newDeliveryType} onChange={(event) => setNewDeliveryType(event.target.value)}>
                <option value="delivery">Delivery</option>
                <option value="pickup">Pickup</option>
              </select>
              <input className={styles.input} type="number" placeholder="Price" value={newDeliveryPrice} onChange={(event) => setNewDeliveryPrice(event.target.value)} />
              <input className={styles.input} type="number" placeholder="Sort order" value={newDeliverySortOrder} onChange={(event) => setNewDeliverySortOrder(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <label className={styles.checkLabel}><input type="checkbox" checked={newDeliveryIsActive} onChange={(event) => setNewDeliveryIsActive(event.target.checked)} /> {t('admin.active', { defaultValue: 'Active' })}</label>
            </div>
            <button className={styles.createBtn} onClick={() => void handleCreateDeliveryOption()} disabled={creatingDelivery || !newDeliveryName.trim()}>
              {creatingDelivery ? t('common.loading', { defaultValue: 'Loading...' }) : t('common.save', { defaultValue: 'Save' })}
            </button>
          </div>

          <div className={styles.discountList}>
            {deliveryOptions.map((option) => (
              <div key={option.id} className={styles.discountCard}>
                {editingDelivery === option.id ? (
                  <div className={styles.form} style={{ marginBottom: 0, width: '100%' }}>
                    <div className={styles.formRow}>
                      <input className={styles.input} placeholder="Name" value={deliveryEdits[option.id]?.name ?? option.name} onChange={(event) => setDeliveryEdits((current) => ({ ...current, [option.id]: { ...current[option.id], name: event.target.value } }))} />
                      <input className={styles.input} placeholder="Name EN" value={deliveryEdits[option.id]?.nameEn ?? (option.nameEn ?? '')} onChange={(event) => setDeliveryEdits((current) => ({ ...current, [option.id]: { ...current[option.id], nameEn: event.target.value } }))} />
                    </div>
                    <div className={styles.formRow}>
                      <select className={styles.select} value={deliveryEdits[option.id]?.type ?? option.type} onChange={(event) => setDeliveryEdits((current) => ({ ...current, [option.id]: { ...current[option.id], type: event.target.value } }))}>
                        <option value="delivery">Delivery</option>
                        <option value="pickup">Pickup</option>
                      </select>
                      <input className={styles.input} type="number" placeholder="Price" value={deliveryEdits[option.id]?.price ?? String(option.price)} onChange={(event) => setDeliveryEdits((current) => ({ ...current, [option.id]: { ...current[option.id], price: event.target.value } }))} />
                      <input className={styles.input} type="number" placeholder="Sort order" value={deliveryEdits[option.id]?.sortOrder ?? String(option.sortOrder ?? 0)} onChange={(event) => setDeliveryEdits((current) => ({ ...current, [option.id]: { ...current[option.id], sortOrder: event.target.value } }))} />
                    </div>
                    <div className={styles.formRow}>
                      <label className={styles.checkLabel}>
                        <input type="checkbox" checked={deliveryEdits[option.id]?.isActive ?? Boolean(option.isActive ?? true)} onChange={(event) => setDeliveryEdits((current) => ({ ...current, [option.id]: { ...current[option.id], isActive: event.target.checked } }))} />
                        {t('admin.active', { defaultValue: 'Active' })}
                      </label>
                    </div>
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => void handleSaveDeliveryOption(option.id)}>{t('common.save', { defaultValue: 'Save' })}</button>
                      <button className={styles.replyBtn} onClick={() => setEditingDelivery(null)}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className={styles.discountCode}>{option.name}</span>
                      {option.nameEn ? <span> / {option.nameEn}</span> : null}
                      <span className={`${styles.refundTag} ${option.isActive ?? true ? styles.tagActive : styles.tagInactive}`}>
                        {option.isActive ?? true ? t('admin.active', { defaultValue: 'Active' }) : t('admin.inactive', { defaultValue: 'Inactive' })}
                      </span>
                      <span className={styles.orderMeta}> • {option.type} • {formatCurrency(option.price, language)}</span>
                    </div>
                    <button className={styles.replyBtn} onClick={() => { setEditingDelivery(option.id); setDeliveryEdits((current) => ({ ...current, [option.id]: {} })); }}>
                      {t('common.edit', { defaultValue: 'Edit' })}
                    </button>
                  </>
                )}
              </div>
            ))}
            {deliveryOptions.length === 0 && <p className={styles.loading}>{t('checkout.noDeliveryOptions', { defaultValue: 'No delivery options.' })}</p>}
          </div>
        </div>
      )}

      {tab === 'support' && (
        <div className={styles.ticketList}>
          {tickets.map((ticket) => (
            <div key={ticket.id} className={styles.ticketCard}>
              <div className={styles.ticketHeader}>
                <span className={styles.ticketSubject}>{ticket.subject}</span>
                <span className={styles.ticketStatus}>{ticket.status}</span>
              </div>
              <p className={styles.ticketMsg}>{ticket.message}</p>
              {ticket.replies.map((reply) => (
                <div key={reply.id} className={`${styles.reply} ${reply.isAdmin ? styles.replyAdmin : styles.replyUser}`}>
                  <strong>{reply.isAdmin ? 'Admin' : 'User'}</strong>: {reply.message}
                </div>
              ))}
              <div className={styles.replyRow}>
                <input className={styles.input} placeholder="Reply..." value={replyText[ticket.id] ?? ''} onChange={(event) => setReplyText((current) => ({ ...current, [ticket.id]: event.target.value }))} />
                <button className={styles.replyBtn} onClick={() => void handleAdminReply(ticket.id)}>
                  {t('common.send', { defaultValue: 'Send' })}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'audit' && (
        <div className={styles.auditList}>
          {auditLogs.map((log) => (
            <div key={log.id} className={styles.auditRow}>
              <span className={styles.auditAction}>{log.action}</span>
              {log.entity && <span className={styles.auditEntity}>{log.entity}#{log.entityId}</span>}
              {log.meta && <span className={styles.auditMeta}>{log.meta}</span>}
              <span className={styles.auditDate}>{new Date(log.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'payments' && (
        <div>
          <div className={styles.form}>
            <h3 className={styles.formTitle}>{t('admin.paymentSettings', { defaultValue: 'Payment settings' })}</h3>
            <div className={styles.formRow}>
              <select className={styles.select} value={newPaymentType} onChange={(event) => setNewPaymentType(event.target.value as PaymentMethod['type'])}>
                <option value="card">Card</option>
                <option value="crypto">Crypto</option>
              </select>
              <input className={styles.input} placeholder={t('admin.methodTitle', { defaultValue: 'Title' })} value={newPaymentTitle} onChange={(event) => setNewPaymentTitle(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder={t('checkout.currency', { defaultValue: 'Currency' })} value={newPaymentCurrency} onChange={(event) => setNewPaymentCurrency(event.target.value)} />
              <input className={styles.input} placeholder={t('checkout.asset', { defaultValue: 'Asset' })} value={newPaymentAsset} onChange={(event) => setNewPaymentAsset(event.target.value)} />
              <input className={styles.input} placeholder={t('checkout.network', { defaultValue: 'Network' })} value={newPaymentNetwork} onChange={(event) => setNewPaymentNetwork(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder={t('admin.provider', { defaultValue: 'Provider' })} value={newPaymentProvider} onChange={(event) => setNewPaymentProvider(event.target.value)} />
              <select className={styles.select} value={newPaymentProviderMode} onChange={(event) => setNewPaymentProviderMode(event.target.value)}>
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
              <input className={styles.input} placeholder={t('admin.providerKey', { defaultValue: 'Provider key / public id' })} value={newPaymentProviderKey} onChange={(event) => setNewPaymentProviderKey(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder={t('admin.displayName', { defaultValue: 'Display name' })} value={newPaymentDisplayName} onChange={(event) => setNewPaymentDisplayName(event.target.value)} />
              <input className={styles.input} placeholder={t('checkout.walletAddress', { defaultValue: 'Wallet address' })} value={newPaymentWalletAddress} onChange={(event) => setNewPaymentWalletAddress(event.target.value)} />
              <input className={styles.input} type="number" placeholder={t('admin.sortOrder', { defaultValue: 'Sort order' })} value={newPaymentSortOrder} onChange={(event) => setNewPaymentSortOrder(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder={t('admin.providerConfig', { defaultValue: 'Provider config / identifier' })} value={newPaymentProviderConfig} onChange={(event) => setNewPaymentProviderConfig(event.target.value)} />
              <input className={styles.input} placeholder={t('admin.instructions', { defaultValue: 'Payment instructions' })} value={newPaymentInstructions} onChange={(event) => setNewPaymentInstructions(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <label className={styles.checkLabel}><input type="checkbox" checked={newPaymentTonConnectEnabled} onChange={(event) => setNewPaymentTonConnectEnabled(event.target.checked)} /> TON Connect</label>
            </div>
            <button className={styles.createBtn} onClick={() => void handleCreatePaymentMethod()} disabled={!newPaymentTitle.trim()}>
              {t('common.save', { defaultValue: 'Save' })}
            </button>
          </div>

          <div className={styles.discountList}>
            {paymentMethods.map((method) => (
              <div key={method.id} className={styles.discountCard}>
                {editingPaymentMethod === method.id ? (
                  <div className={styles.form}>
                    <div className={styles.formRow}>
                      <input className={styles.input} value={paymentMethodEdits[method.id]?.title ?? method.title} onChange={(event) => setPaymentMethodEdits((current) => ({ ...current, [method.id]: { ...current[method.id], title: event.target.value } }))} />
                      <input className={styles.input} value={paymentMethodEdits[method.id]?.currency ?? (method.currency ?? '')} onChange={(event) => setPaymentMethodEdits((current) => ({ ...current, [method.id]: { ...current[method.id], currency: event.target.value } }))} />
                      <input className={styles.input} value={paymentMethodEdits[method.id]?.asset ?? (method.asset ?? '')} onChange={(event) => setPaymentMethodEdits((current) => ({ ...current, [method.id]: { ...current[method.id], asset: event.target.value } }))} />
                    </div>
                    <div className={styles.formRow}>
                      <input className={styles.input} value={paymentMethodEdits[method.id]?.provider ?? (method.provider ?? '')} onChange={(event) => setPaymentMethodEdits((current) => ({ ...current, [method.id]: { ...current[method.id], provider: event.target.value } }))} />
                      <select className={styles.select} value={paymentMethodEdits[method.id]?.providerMode ?? (method.providerMode ?? 'test')} onChange={(event) => setPaymentMethodEdits((current) => ({ ...current, [method.id]: { ...current[method.id], providerMode: event.target.value } }))}>
                        <option value="test">Test</option>
                        <option value="live">Live</option>
                      </select>
                      <input className={styles.input} value={paymentMethodEdits[method.id]?.providerKey ?? (method.providerKey ?? '')} onChange={(event) => setPaymentMethodEdits((current) => ({ ...current, [method.id]: { ...current[method.id], providerKey: event.target.value } }))} />
                    </div>
                    <div className={styles.formRow}>
                      <input className={styles.input} value={paymentMethodEdits[method.id]?.network ?? (method.network ?? '')} onChange={(event) => setPaymentMethodEdits((current) => ({ ...current, [method.id]: { ...current[method.id], network: event.target.value } }))} />
                      <input className={styles.input} value={paymentMethodEdits[method.id]?.walletAddress ?? (method.walletAddress ?? '')} onChange={(event) => setPaymentMethodEdits((current) => ({ ...current, [method.id]: { ...current[method.id], walletAddress: event.target.value } }))} />
                      <input className={styles.input} type="number" value={paymentMethodEdits[method.id]?.sortOrder ?? String(method.sortOrder ?? 0)} onChange={(event) => setPaymentMethodEdits((current) => ({ ...current, [method.id]: { ...current[method.id], sortOrder: event.target.value } }))} />
                    </div>
                    <div className={styles.formRow}>
                      <input className={styles.input} value={paymentMethodEdits[method.id]?.displayName ?? (method.displayName ?? '')} onChange={(event) => setPaymentMethodEdits((current) => ({ ...current, [method.id]: { ...current[method.id], displayName: event.target.value } }))} />
                      <input className={styles.input} value={paymentMethodEdits[method.id]?.providerConfig ?? (method.providerConfig ?? '')} onChange={(event) => setPaymentMethodEdits((current) => ({ ...current, [method.id]: { ...current[method.id], providerConfig: event.target.value } }))} />
                    </div>
                    <div className={styles.formRow}>
                      <input className={styles.input} value={paymentMethodEdits[method.id]?.instructions ?? (method.instructions ?? '')} onChange={(event) => setPaymentMethodEdits((current) => ({ ...current, [method.id]: { ...current[method.id], instructions: event.target.value } }))} />
                      <label className={styles.checkLabel}><input type="checkbox" checked={paymentMethodEdits[method.id]?.isTonConnectEnabled ?? Boolean(method.isTonConnectEnabled)} onChange={(event) => setPaymentMethodEdits((current) => ({ ...current, [method.id]: { ...current[method.id], isTonConnectEnabled: event.target.checked } }))} /> TON Connect</label>
                    </div>
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => void handleSavePaymentMethod(method.id)}>{t('common.save', { defaultValue: 'Save' })}</button>
                      <button className={styles.replyBtn} onClick={() => setEditingPaymentMethod(null)}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className={styles.discountCode}>{method.title}</div>
                      <div>
                        {method.type.toUpperCase()}
                        {method.provider ? ` • ${method.provider}` : ''}
                        {method.asset ? ` • ${method.asset}` : ''}
                        {method.network ? ` • ${method.network}` : ''}
                        {method.walletAddress ? ` • ${method.walletAddress}` : ''}
                      </div>
                    </div>
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => setEditingPaymentMethod(method.id)}>
                        {t('common.edit', { defaultValue: 'Edit' })}
                      </button>
                      <button className={styles.replyBtn} onClick={() => void handleTogglePaymentMethod(method.id)}>
                        {method.isEnabled ? t('admin.disable', { defaultValue: 'Disable' }) : t('admin.enable', { defaultValue: 'Enable' })}
                      </button>
                      <button className={styles.replyBtn} onClick={() => void handleDeletePaymentMethod(method.id)}>
                        {t('common.delete', { defaultValue: 'Delete' })}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className={styles.form} style={{ marginTop: 16 }}>
            <h3 className={styles.formTitle}>{t('admin.paymentRecords', { defaultValue: 'Payment records' })}</h3>
            <div className={styles.orderList}>
              {paymentRecords.map((payment) => (
                <div key={payment.id} className={styles.orderCard}>
                  <div className={styles.orderHeader}>
                    <span className={styles.orderId}>Payment #{payment.id}</span>
                    <span className={styles.orderTotal}>{formatCurrency(payment.amount, language)}</span>
                  </div>
                  <p className={styles.orderMeta}>
                    Order #{payment.orderId} • {payment.paymentMethod?.title ?? 'Unknown method'} • {payment.status}
                  </p>
                  <p className={styles.orderMeta}>
                    {payment.asset ?? payment.currency ?? '—'} {payment.network ? `• ${payment.network}` : ''} {payment.providerPaymentId ? `• ${payment.providerPaymentId}` : ''} {payment.transactionHash ? `• ${payment.transactionHash}` : ''}
                  </p>
                  {payment.order?.user && (
                    <p className={styles.orderMeta}>
                      {payment.order.user.firstName}{payment.order.user.username ? ` @${payment.order.user.username}` : ''} • TG: {payment.order.user.telegramId}
                    </p>
                  )}
                  <p className={styles.orderMeta}>
                    {new Date(payment.createdAt).toLocaleString()} {payment.paidAt ? `• Paid ${new Date(payment.paidAt).toLocaleString()}` : ''}
                  </p>
                  <div className={styles.formRow}>
                    <input
                      className={styles.input}
                      placeholder={t('admin.reason', { defaultValue: 'Reason' })}
                      value={paymentStatusReason[payment.id] ?? ''}
                      onChange={(event) => setPaymentStatusReason((current) => ({ ...current, [payment.id]: event.target.value }))}
                    />
                  </div>
                  <div className={styles.replyRow}>
                    {payment.status !== 'paid' && <button className={styles.replyBtn} onClick={() => void handlePaymentStatusChange(payment.id, 'paid')}>Mark paid</button>}
                    {payment.status !== 'processing' && <button className={styles.replyBtn} onClick={() => void handlePaymentStatusChange(payment.id, 'processing')}>Processing</button>}
                    {payment.status !== 'failed' && <button className={styles.replyBtn} onClick={() => void handlePaymentStatusChange(payment.id, 'failed')}>Fail</button>}
                    {payment.status !== 'cancelled' && <button className={styles.replyBtn} onClick={() => void handlePaymentStatusChange(payment.id, 'cancelled')}>Cancel</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'casino' && (
        <div>
          <div className={styles.form}>
            <h3 className={styles.formTitle}>Casino games</h3>
            <div className={styles.orderList}>
              {casinoConfig.games.map((game) => (
                <div key={game.id} className={styles.orderCard}>
                  <div className={styles.orderHeader}>
                    <span className={styles.orderId}>{game.game.toUpperCase()}</span>
                    <span className={styles.orderTotal}>{game.isEnabled ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className={styles.formRow}>
                    <input className={styles.input} type="number" defaultValue={String(game.minBet)} onBlur={(event) => void handleSaveCasinoGame(game.game, { minBet: Number(event.target.value) || game.minBet })} />
                    <input className={styles.input} type="number" defaultValue={String(game.maxBet)} onBlur={(event) => void handleSaveCasinoGame(game.game, { maxBet: Number(event.target.value) || game.maxBet })} />
                    <input className={styles.input} type="number" defaultValue={String(game.spinLimit)} onBlur={(event) => void handleSaveCasinoGame(game.game, { spinLimit: Number(event.target.value) || game.spinLimit })} />
                  </div>
                  <button className={styles.replyBtn} onClick={() => void handleSaveCasinoGame(game.game, { isEnabled: !game.isEnabled })}>
                    {game.isEnabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.form} style={{ marginTop: 16 }}>
            <h3 className={styles.formTitle}>New casino reward</h3>
            <div className={styles.formRow}>
              <select className={styles.select} value={newCasinoRewardGame} onChange={(event) => setNewCasinoRewardGame(event.target.value)}>
                <option value="wheel">Wheel</option>
                <option value="slots">Slots</option>
                <option value="roulette">Roulette</option>
                <option value="chest">Chest</option>
              </select>
              <select className={styles.select} value={newCasinoRewardType} onChange={(event) => setNewCasinoRewardType(event.target.value)}>
                <option value="shop_discount">Discount</option>
                <option value="casino_credits">Casino credits</option>
                <option value="none">No reward</option>
              </select>
              <input className={styles.input} placeholder="Title" value={newCasinoRewardTitle} onChange={(event) => setNewCasinoRewardTitle(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} type="number" placeholder="Weight" value={newCasinoRewardWeight} onChange={(event) => setNewCasinoRewardWeight(event.target.value)} />
              <input className={styles.input} type="number" placeholder="Discount %" value={newCasinoRewardDiscount} onChange={(event) => setNewCasinoRewardDiscount(event.target.value)} />
              <input className={styles.input} type="number" placeholder="Credits" value={newCasinoRewardCredits} onChange={(event) => setNewCasinoRewardCredits(event.target.value)} />
            </div>
            <button className={styles.createBtn} onClick={() => void handleCreateCasinoReward()} disabled={!newCasinoRewardTitle.trim()}>
              {t('common.save', { defaultValue: 'Save' })}
            </button>
          </div>

          <div className={styles.discountList} style={{ marginTop: 16 }}>
            {casinoConfig.rewardConfigs.map((rewardConfig) => (
              <div key={rewardConfig.id} className={styles.discountCard}>
                <div>
                  <div className={styles.discountCode}>{rewardConfig.title}</div>
                  <div>{rewardConfig.game} • {rewardConfig.rewardType} • weight {rewardConfig.weight}</div>
                  <div className={styles.orderMeta}>
                    {rewardConfig.discountPercent ? `${rewardConfig.discountPercent}%` : ''}
                    {rewardConfig.creditAmount ? ` • ${rewardConfig.creditAmount} credits` : ''}
                  </div>
                </div>
                <button className={styles.replyBtn} onClick={() => void handleToggleCasinoReward(rewardConfig.id, rewardConfig.isActive)}>
                  {rewardConfig.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            ))}
          </div>

          <div className={styles.form} style={{ marginTop: 16 }}>
            <h3 className={styles.formTitle}>Casino credit adjustment</h3>
            <div className={styles.formRow}>
              <input className={styles.input} type="number" placeholder="User ID" value={casinoAdjustmentUserId} onChange={(event) => setCasinoAdjustmentUserId(event.target.value)} />
              <input className={styles.input} type="number" placeholder="Amount" value={casinoAdjustmentAmount} onChange={(event) => setCasinoAdjustmentAmount(event.target.value)} />
              <input className={styles.input} placeholder="Reason" value={casinoAdjustmentReason} onChange={(event) => setCasinoAdjustmentReason(event.target.value)} />
            </div>
            <button className={styles.createBtn} onClick={() => void handleAdjustCasinoCredits()} disabled={!casinoAdjustmentUserId || !casinoAdjustmentAmount || !casinoAdjustmentReason.trim()}>
              Adjust credits
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
