import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/cart/:telegramId
router.get('/:telegramId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: req.params.telegramId },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const cart = await prisma.cart.findUnique({
      where: { userId: user.id },
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true,
                productCities: {
                  where: user.selectedCityId
                    ? { cityId: user.selectedCityId }
                    : undefined,
                },
              },
            },
          },
        },
      },
    });

    if (!cart) {
      return res.json({ items: [], total: 0 });
    }

    const total = cart.items.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0
    );

    res.json({ ...cart, total });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// POST /api/cart/:telegramId/items - add or update item
router.post('/:telegramId/items', async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    const user = await prisma.user.findUnique({
      where: { telegramId: req.params.telegramId },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    let cart = await prisma.cart.findUnique({ where: { userId: user.id } });
    if (!cart) {
      cart = await prisma.cart.create({ data: { userId: user.id } });
    }

    const item = await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: Number(productId) } },
      update: { quantity: Number(quantity) },
      create: {
        cartId: cart.id,
        productId: Number(productId),
        quantity: Number(quantity),
      },
    });

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

// PATCH /api/cart/:telegramId/items - update existing item quantity
router.patch('/:telegramId/items', async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    const user = await prisma.user.findUnique({
      where: { telegramId: req.params.telegramId },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const cart = await prisma.cart.findUnique({ where: { userId: user.id } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });

    const existingItem = await prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId: Number(productId) } },
    });
    if (!existingItem) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    const item = await prisma.cartItem.update({
      where: { cartId_productId: { cartId: cart.id, productId: Number(productId) } },
      data: { quantity: Number(quantity) },
    });

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// DELETE /api/cart/:telegramId/items/:productId
router.delete('/:telegramId/items/:productId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: req.params.telegramId },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const cart = await prisma.cart.findUnique({ where: { userId: user.id } });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });

    await prisma.cartItem.deleteMany({
      where: {
        cartId: cart.id,
        productId: Number(req.params.productId),
      },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete cart item' });
  }
});

// DELETE /api/cart/:telegramId - clear cart
router.delete('/:telegramId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: req.params.telegramId },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const cart = await prisma.cart.findUnique({ where: { userId: user.id } });
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

export default router;
