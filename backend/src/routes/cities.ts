import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const cities = await prisma.city.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(cities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

export default router;
