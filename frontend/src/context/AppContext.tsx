import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { ProductCity } from '../types/product';

interface TelegramWebAppUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramWebApp {
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
  };
  ready: () => void;
  expand: () => void;
}

export interface City {
  id: number;
  name: string;
  isActive: boolean;
}

export interface User {
  id: number;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  selectedCityId: number | null;
  selectedCity: City | null;
}

export interface CartItem {
  id: number;
  cartId: number;
  productId: number;
  quantity: number;
  product: {
    id: number;
    name: string;
    price: number;
    image: string | null;
    category: { name: string };
    productCities: ProductCity[];
  };
}

export interface Cart {
  id?: number;
  items: CartItem[];
  total: number;
}

interface AppContextValue {
  user: User | null;
  cart: Cart;
  selectedCity: City | null;
  loading: boolean;
  refreshCart: () => void;
  setCity: (city: City) => Promise<void>;
  addToCart: (productId: number, quantity: number) => Promise<void>;
  updateCartItem: (productId: number, quantity: number) => Promise<void>;
  removeFromCart: (productId: number) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [cart, setCart] = useState<Cart>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchCart = useCallback(async (telegramId: string) => {
    try {
      const data = await api.get<Cart>(`/cart/${telegramId}`);
      setCart(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const tg = (window as Window & {
          Telegram?: { WebApp?: TelegramWebApp };
        }).Telegram?.WebApp;
        const demoStorageKey = 'telegram-shop-demo-user-id';
        const storedDemoId = window.localStorage.getItem(demoStorageKey);
        const generatedDemoId =
          storedDemoId ||
          `demo_${window.crypto?.randomUUID?.() ?? Date.now().toString()}`;
        let telegramId = generatedDemoId;
        let username: string | undefined;
        let firstName: string | undefined;
        let lastName: string | undefined;

        if (tg && tg.initDataUnsafe?.user) {
          const tgUser = tg.initDataUnsafe.user;
          telegramId = String(tgUser.id);
          username = tgUser.username;
          firstName = tgUser.first_name;
          lastName = tgUser.last_name;
          tg.ready();
          tg.expand();
        } else {
          if (!storedDemoId) {
            window.localStorage.setItem(demoStorageKey, generatedDemoId);
          }
          telegramId = generatedDemoId;
        }

        const userData = await api.post<User>('/users/auth', {
          telegramId,
          username,
          firstName,
          lastName,
        });

        setUser(userData);
        await fetchCart(telegramId);

        if (!userData.selectedCityId) {
          navigate('/select-city');
        }
      } catch (e) {
        console.error('Init error', e);
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, [navigate, fetchCart]);

  const setCity = useCallback(
    async (city: City) => {
      if (!user) return;
      const updated = await api.patch<User>(`/users/${user.telegramId}/city`, {
        cityId: city.id,
      });
      setUser(updated);
    },
    [user]
  );

  const refreshCart = useCallback(() => {
    if (user) {
      void fetchCart(user.telegramId);
    }
  }, [user, fetchCart]);

  const addToCart = useCallback(
    async (productId: number, quantity: number) => {
      if (!user) return;
      await api.post(`/cart/${user.telegramId}/items`, { productId, quantity });
      await fetchCart(user.telegramId);
    },
    [user, fetchCart]
  );

  const updateCartItem = useCallback(
    async (productId: number, quantity: number) => {
      if (!user) return;
      await api.patch(`/cart/${user.telegramId}/items`, { productId, quantity });
      await fetchCart(user.telegramId);
    },
    [user, fetchCart]
  );

  const removeFromCart = useCallback(
    async (productId: number) => {
      if (!user) return;
      await api.delete(`/cart/${user.telegramId}/items/${productId}`);
      await fetchCart(user.telegramId);
    },
    [user, fetchCart]
  );

  const selectedCity = user?.selectedCity ?? null;

  return (
    <AppContext.Provider
      value={{
        user,
        cart,
        selectedCity,
        loading,
        refreshCart,
        setCity,
        addToCart,
        updateCartItem,
        removeFromCart,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
