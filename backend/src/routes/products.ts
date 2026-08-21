import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

const productInclude = (cityId?: string) => ({
  category: true,
  productCities: {
    where: cityId
      ? { cityId: Number(cityId), isAvailable: true }
      : { isAvailable: true },
    include: { city: true },
  },
});

// GET /api/products/recommended?cityId=1
router.get('/recommended/list', async (req, res) => {
  try {
    const { cityId } = req.query;
    const products = await prisma.product.findMany({
      where: { isActive: true, isRecommended: true },
      include: productInclude(cityId as string | undefined),
    });
    const filtered = cityId ? products.filter((p) => p.productCities.length > 0) : products;
    res.json(filtered);
  } catch {
    res.status(500).json({ error: 'Failed to fetch recommended products' });
  }
});

// GET /api/products?cityId=1&categoryId=2&search=coffee&sort=newest|price_asc|price_desc|popular&featured=1&newest=1
router.get('/', async (req, res) => {
  try {
    const { cityId, categoryId, search, sort, featured, newest } = req.query;

    const where: Parameters<typeof prisma.product.findMany>[0]['where'] = { isActive: true };

    if (categoryId) where.categoryId = Number(categoryId);
    if (search) where.name = { contains: String(search) };
    if (featured === '1') where.isRecommended = true;

    // Sorting
    let orderBy: Parameters<typeof prisma.product.findMany>[0]['orderBy'] = { createdAt: 'desc' };
    if (sort === 'newest') orderBy = { createdAt: 'desc' };
    else if (sort === 'price_asc') orderBy = { price: 'asc' };
    else if (sort === 'price_desc') orderBy = { price: 'desc' };
    else if (sort === 'popular') orderBy = { isRecommended: 'desc' };

    const take = newest === '1' ? 10 : undefined;

    const products = await prisma.product.findMany({
      where,
      orderBy,
      take,
      include: productInclude(cityId as string | undefined),
    });

    const filtered = cityId ? products.filter((p) => p.productCities.length > 0) : products;
    res.json(filtered);
  } catch {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/:id/related?cityId=1
router.get('/:id/related', async (req, res) => {
  try {
    const { cityId } = req.query;
    const product = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
      select: { categoryId: true },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const related = await prisma.product.findMany({
      where: { isActive: true, categoryId: product.categoryId, id: { not: Number(req.params.id) } },
      take: 6,
      include: productInclude(cityId as string | undefined),
    });
    const filtered = cityId ? related.filter((p) => p.productCities.length > 0) : related;
    res.json(filtered);
  } catch {
    res.status(500).json({ error: 'Failed to fetch related products' });
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
          where: cityId ? { cityId: Number(cityId) } : undefined,
          include: { city: true },
        },
      },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

export default router;
