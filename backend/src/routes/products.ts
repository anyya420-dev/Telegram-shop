import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/products/recommended?cityId=1
router.get('/recommended/list', async (req, res) => {
  try {
    const { cityId } = req.query;
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        isRecommended: true,
      },
      include: {
        category: true,
        productCities: {
          where: cityId
            ? { cityId: Number(cityId), isAvailable: true }
            : { isAvailable: true },
          include: { city: true },
        },
      },
    });
    const filtered = cityId ? products.filter((p) => p.productCities.length > 0) : products;
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recommended products' });
  }
});

// GET /api/products?cityId=1&categoryId=2&search=coffee
router.get('/', async (req, res) => {
  try {
    const { cityId, categoryId, search } = req.query;

    const where: {
      isActive: boolean;
      categoryId?: number;
      name?: { contains: string };
    } = { isActive: true };

    if (categoryId) {
      where.categoryId = Number(categoryId);
    }

    if (search) {
      where.name = { contains: String(search) };
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
        productCities: {
          where: cityId
            ? { cityId: Number(cityId), isAvailable: true }
            : { isAvailable: true },
          include: { city: true },
        },
      },
    });

    // Filter to only products available in the selected city
    const filtered = cityId
      ? products.filter((p) => p.productCities.length > 0)
      : products;

    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/:id?cityId=1
router.get('/:id', async (req, res) => {
  try {
    const { cityId } = req.query;
    const product = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        category: true,
        productCities: {
          where: cityId
            ? { cityId: Number(cityId) }
            : undefined,
          include: { city: true },
        },
      },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

export default router;
