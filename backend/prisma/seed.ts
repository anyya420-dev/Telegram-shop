import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.cartItem.deleteMany()
  await prisma.cart.deleteMany()
  await prisma.productCity.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
  await prisma.city.deleteMany()
  await prisma.user.deleteMany()

  const warsaw = await prisma.city.upsert({
    where: { name: 'Варшава' },
    update: { nameEn: 'Warsaw', isActive: true, sortOrder: 1 },
    create: { name: 'Варшава', nameEn: 'Warsaw', isActive: true, sortOrder: 1 },
  })
  const krakow = await prisma.city.upsert({
    where: { name: 'Краков' },
    update: { nameEn: 'Krakow', isActive: true, sortOrder: 2 },
    create: { name: 'Краков', nameEn: 'Krakow', isActive: true, sortOrder: 2 },
  })
  const wroclaw = await prisma.city.upsert({
    where: { name: 'Вроцлав' },
    update: { nameEn: 'Wroclaw', isActive: true, sortOrder: 3 },
    create: { name: 'Вроцлав', nameEn: 'Wroclaw', isActive: true, sortOrder: 3 },
  })

  const clothing = await prisma.category.upsert({
    where: { name: 'Одежда' },
    update: { nameEn: 'Clothing', isActive: true, sortOrder: 1 },
    create: { name: 'Одежда', nameEn: 'Clothing', isActive: true, sortOrder: 1 },
  })
  const electronics = await prisma.category.upsert({
    where: { name: 'Электроника' },
    update: { nameEn: 'Electronics', isActive: true, sortOrder: 2 },
    create: { name: 'Электроника', nameEn: 'Electronics', isActive: true, sortOrder: 2 },
  })
  const home = await prisma.category.upsert({
    where: { name: 'Дом' },
    update: { nameEn: 'Home', isActive: true, sortOrder: 3 },
    create: { name: 'Дом', nameEn: 'Home', isActive: true, sortOrder: 3 },
  })
  const accessories = await prisma.category.upsert({
    where: { name: 'Аксессуары' },
    update: { nameEn: 'Accessories', isActive: true, sortOrder: 4 },
    create: { name: 'Аксессуары', nameEn: 'Accessories', isActive: true, sortOrder: 4 },
  })

  const coffee = await prisma.product.upsert({
    where: { id: 1 },
    update: {
      nameEn: 'Premium Coffee',
      descriptionEn: 'Selected whole-bean coffee with a rich taste and aroma.',
    },
    create: {
      name: 'Кофе Premium',
      nameEn: 'Premium Coffee',
      description: 'Отборный зерновой кофе высшего качества. Насыщенный вкус и аромат.',
      descriptionEn: 'Selected whole-bean coffee with a rich taste and aroma.',
      price: 20,
      image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600',
      categoryId: home.id,
      isActive: true,
      isRecommended: true,
    },
  })

  const headphones = await prisma.product.upsert({
    where: { id: 2 },
    update: {
      nameEn: 'Wireless Headphones',
      descriptionEn: 'Wireless headphones with noise cancellation and 30 hours of battery life.',
    },
    create: {
      name: 'Наушники Wireless',
      nameEn: 'Wireless Headphones',
      description: 'Беспроводные наушники с шумоподавлением. 30 часов работы.',
      descriptionEn: 'Wireless headphones with noise cancellation and 30 hours of battery life.',
      price: 150,
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
      categoryId: electronics.id,
      isActive: true,
      isRecommended: true,
    },
  })

  const tshirt = await prisma.product.upsert({
    where: { id: 3 },
    update: {
      nameEn: 'Classic T-shirt',
      descriptionEn: 'A minimalist T-shirt made from premium cotton with a clean fit.',
    },
    create: {
      name: 'Футболка Classic',
      nameEn: 'Classic T-shirt',
      description: 'Минималистичная футболка из premium-хлопка. Идеальный крой.',
      descriptionEn: 'A minimalist T-shirt made from premium cotton with a clean fit.',
      price: 35,
      image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600',
      categoryId: clothing.id,
      isActive: true,
      isRecommended: false,
    },
  })

  const charger = await prisma.product.upsert({
    where: { id: 4 },
    update: {
      nameEn: 'USB-C Charger 65W',
      descriptionEn: 'A fast charger for laptops and phones with a compact design.',
    },
    create: {
      name: 'Зарядка USB-C 65W',
      nameEn: 'USB-C Charger 65W',
      description: 'Быстрая зарядка для ноутбуков и телефонов. Компактный дизайн.',
      descriptionEn: 'A fast charger for laptops and phones with a compact design.',
      price: 45,
      image: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600',
      categoryId: electronics.id,
      isActive: true,
      isRecommended: false,
    },
  })

  const lamp = await prisma.product.upsert({
    where: { id: 5 },
    update: {
      nameEn: 'Desk Lamp',
      descriptionEn: 'A modern LED lamp with adjustable brightness and USB charging.',
    },
    create: {
      name: 'Лампа настольная',
      nameEn: 'Desk Lamp',
      description: 'Современная LED лампа с регулировкой яркости. Заряжается от USB.',
      descriptionEn: 'A modern LED lamp with adjustable brightness and USB charging.',
      price: 60,
      image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600',
      categoryId: home.id,
      isActive: true,
      isRecommended: false,
    },
  })

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
  })
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
  })

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
    })
  }

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
    })
  }

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
    })
  }

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
    })
  }

  console.log('Seed completed successfully')
}

// Upsert delivery options and sample discount (run separately, not resetting existing data)
async function seedExtras() {
  await prisma.deliveryOption.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: 'Самовывоз', nameEn: 'Pickup', type: 'pickup', price: 0, isActive: true, sortOrder: 1 },
  })
  await prisma.deliveryOption.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: 'Доставка курьером', nameEn: 'Courier delivery', type: 'delivery', price: 250, isActive: true, sortOrder: 2 },
  })
  await prisma.discount.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: { code: 'WELCOME10', type: 'percent', value: 10, minOrderAmount: 0, isActive: true },
  })
  console.log('Extras seeded')
}

main()
  .then(() => seedExtras())
  .catch(async (error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
