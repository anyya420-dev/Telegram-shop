import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Cities
  const warsaw = await prisma.city.upsert({
    where: { name: 'Варшава' },
    update: {},
    create: { name: 'Варшава', isActive: true, sortOrder: 1 },
  });
  const krakow = await prisma.city.upsert({
    where: { name: 'Краков' },
    update: {},
    create: { name: 'Краков', isActive: true, sortOrder: 2 },
  });
  const wroclaw = await prisma.city.upsert({
    where: { name: 'Вроцлав' },
    update: {},
    create: { name: 'Вроцлав', isActive: true, sortOrder: 3 },
  });

  // Categories
  const clothing = await prisma.category.upsert({
    where: { name: 'Одежда' },
    update: {},
    create: { name: 'Одежда', isActive: true, sortOrder: 1 },
  });
  const electronics = await prisma.category.upsert({
    where: { name: 'Электроника' },
    update: {},
    create: { name: 'Электроника', isActive: true, sortOrder: 2 },
  });
  const home = await prisma.category.upsert({
    where: { name: 'Дом' },
    update: {},
    create: { name: 'Дом', isActive: true, sortOrder: 3 },
  });
  const accessories = await prisma.category.upsert({
    where: { name: 'Аксессуары' },
    update: {},
    create: { name: 'Аксессуары', isActive: true, sortOrder: 4 },
  });

  // Products
  const coffee = await prisma.product.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Кофе Premium',
      description: 'Отборный зерновой кофе высшего качества. Насыщенный вкус и аромат.',
      price: 20,
      image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600',
      categoryId: home.id,
      isActive: true,
      isRecommended: true,
    },
  });

  const headphones = await prisma.product.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: 'Наушники Wireless',
      description: 'Беспроводные наушники с шумоподавлением. 30 часов работы.',
      price: 150,
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
      categoryId: electronics.id,
      isActive: true,
      isRecommended: true,
    },
  });

  const tshirt = await prisma.product.upsert({
    where: { id: 3 },
    update: {},
    create: {
      name: 'Футболка Classic',
      description: 'Минималистичная футболка из premium-хлопка. Идеальный крой.',
      price: 35,
      image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600',
      categoryId: clothing.id,
      isActive: true,
      isRecommended: false,
    },
  });

  const charger = await prisma.product.upsert({
    where: { id: 4 },
    update: {},
    create: {
      name: 'Зарядка USB-C 65W',
      description: 'Быстрая зарядка для ноутбуков и телефонов. Компактный дизайн.',
      price: 45,
      image: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600',
      categoryId: electronics.id,
      isActive: true,
      isRecommended: false,
    },
  });

  const lamp = await prisma.product.upsert({
    where: { id: 5 },
    update: {},
    create: {
      name: 'Лампа настольная',
      description: 'Современная LED лампа с регулировкой яркости. Заряжается от USB.',
      price: 60,
      image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600',
      categoryId: home.id,
      isActive: true,
      isRecommended: false,
    },
  });

  // ProductCity links
  // Coffee: Warsaw and Krakow with different quantities
  await prisma.productCity.upsert({
    where: { productId_cityId: { productId: coffee.id, cityId: warsaw.id } },
    update: {},
    create: {
      productId: coffee.id,
      cityId: warsaw.id,
      stock: 50,
      minimumQuantity: 0.5,
      quantityStep: 0.5,
      maximumQuantity: 5,
      unit: 'кг',
      isAvailable: true,
    },
  });
  await prisma.productCity.upsert({
    where: { productId_cityId: { productId: coffee.id, cityId: krakow.id } },
    update: {},
    create: {
      productId: coffee.id,
      cityId: krakow.id,
      stock: 20,
      minimumQuantity: 0.5,
      quantityStep: 0.5,
      maximumQuantity: 3,
      unit: 'кг',
      isAvailable: true,
    },
  });

  // Headphones: all cities
  for (const city of [warsaw, krakow, wroclaw]) {
    await prisma.productCity.upsert({
      where: { productId_cityId: { productId: headphones.id, cityId: city.id } },
      update: {},
      create: {
        productId: headphones.id,
        cityId: city.id,
        stock: 10,
        minimumQuantity: 1,
        quantityStep: 1,
        maximumQuantity: 5,
        unit: 'шт.',
        isAvailable: true,
      },
    });
  }

  // T-shirt: Warsaw and Wroclaw
  for (const city of [warsaw, wroclaw]) {
    await prisma.productCity.upsert({
      where: { productId_cityId: { productId: tshirt.id, cityId: city.id } },
      update: {},
      create: {
        productId: tshirt.id,
        cityId: city.id,
        stock: 30,
        minimumQuantity: 1,
        quantityStep: 1,
        maximumQuantity: 10,
        unit: 'шт.',
        isAvailable: true,
      },
    });
  }

  // Charger: all cities
  for (const city of [warsaw, krakow, wroclaw]) {
    await prisma.productCity.upsert({
      where: { productId_cityId: { productId: charger.id, cityId: city.id } },
      update: {},
      create: {
        productId: charger.id,
        cityId: city.id,
        stock: 15,
        minimumQuantity: 1,
        quantityStep: 1,
        maximumQuantity: 3,
        unit: 'шт.',
        isAvailable: true,
      },
    });
  }

  // Lamp: Krakow and Wroclaw
  for (const city of [krakow, wroclaw]) {
    await prisma.productCity.upsert({
      where: { productId_cityId: { productId: lamp.id, cityId: city.id } },
      update: {},
      create: {
        productId: lamp.id,
        cityId: city.id,
        stock: 8,
        minimumQuantity: 1,
        quantityStep: 1,
        maximumQuantity: 2,
        unit: 'шт.',
        isAvailable: true,
      },
    });
  }

  console.log('Seed completed successfully');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
