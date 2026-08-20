import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// POST /api/users/auth - create or update user from Telegram data
router.post('/auth', async (req, res) => {
  try {
    const { telegramId, username, firstName, lastName } = req.body;

    if (!telegramId) {
      return res.status(400).json({ error: 'telegramId is required' });
    }

    const user = await prisma.user.upsert({
      where: { telegramId: String(telegramId) },
      update: {
        username: username || null,
        firstName: firstName || null,
        lastName: lastName || null,
      },
      create: {
        telegramId: String(telegramId),
        username: username || null,
        firstName: firstName || null,
        lastName: lastName || null,
      },
      include: { selectedCity: true },
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to authenticate user' });
  }
});

// PATCH /api/users/:telegramId/city
router.patch('/:telegramId/city', async (req, res) => {
  try {
    const { cityId } = req.body;
    const user = await prisma.user.update({
      where: { telegramId: req.params.telegramId },
      data: { selectedCityId: Number(cityId) },
      include: { selectedCity: true },
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update city' });
  }
});

// GET /api/users/:telegramId
router.get('/:telegramId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: req.params.telegramId },
      include: { selectedCity: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
