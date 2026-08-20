export interface ProductCategory {
  id: number;
  name: string;
}

export interface ProductCity {
  cityId: number;
  stock: number;
  minimumQuantity: number;
  quantityStep: number;
  maximumQuantity: number;
  unit: string;
  isAvailable: boolean;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  category: ProductCategory;
  productCities: ProductCity[];
  isRecommended: boolean;
}
