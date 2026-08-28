import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function upsertProductByName(input: {
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  price: number
  image: string
  categoryId: number
  isRecommended: boolean
}) {
  const existing = await prisma.product.findFirst({
    where: { name: input.name },
    select: { id: true },
  })

  if (existing) {
    return prisma.product.update({
      where: { id: existing.id },
      data: {
        nameEn: input.nameEn,
        descriptionEn: input.descriptionEn,
        price: input.price,
        image: input.image,
        categoryId: input.categoryId,
        isActive: true,
        isRecommended: input.isRecommended,
      },
    })
  }

  return prisma.product.create({
    data: {
      name: input.name,
      nameEn: input.nameEn,
      description: input.description,
      descriptionEn: input.descriptionEn,
      price: input.price,
      image: input.image,
      categoryId: input.categoryId,
      isActive: true,
      isRecommended: input.isRecommended,
    },
  })
}

async function main() {
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

  const coffee = await upsertProductByName({
    name: 'Кофе Premium',
    nameEn: 'Premium Coffee',
    description: 'Отборный зерновой кофе высшего качества. Насыщенный вкус и аромат.',
    descriptionEn: 'Selected whole-bean coffee with a rich taste and aroma.',
    price: 20,
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600',
    categoryId: home.id,
    isRecommended: true,
  })

  const headphones = await upsertProductByName({
    name: 'Наушники Wireless',
    nameEn: 'Wireless Headphones',
    description: 'Беспроводные наушники с шумоподавлением. 30 часов работы.',
    descriptionEn: 'Wireless headphones with noise cancellation and 30 hours of battery life.',
    price: 150,
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
    categoryId: electronics.id,
    isRecommended: true,
  })

  const tshirt = await upsertProductByName({
    name: 'Футболка Classic',
    nameEn: 'Classic T-shirt',
    description: 'Минималистичная футболка из premium-хлопка. Идеальный крой.',
    descriptionEn: 'A minimalist T-shirt made from premium cotton with a clean fit.',
    price: 35,
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600',
    categoryId: clothing.id,
    isRecommended: false,
  })

  const charger = await upsertProductByName({
    name: 'Зарядка USB-C 65W',
    nameEn: 'USB-C Charger 65W',
    description: 'Быстрая зарядка для ноутбуков и телефонов. Компактный дизайн.',
    descriptionEn: 'A fast charger for laptops and phones with a compact design.',
    price: 45,
    image: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600',
    categoryId: electronics.id,
    isRecommended: false,
  })

  const lamp = await upsertProductByName({
    name: 'Лампа настольная',
    nameEn: 'Desk Lamp',
    description: 'Современная LED лампа с регулировкой яркости. Заряжается от USB.',
    descriptionEn: 'A modern LED lamp with adjustable brightness and USB charging.',
    price: 60,
    image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600',
    categoryId: home.id,
    isRecommended: false,
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

async function createDeliveryOptionIfMissing(input: {
  name: string
  nameEn: string
  type: string
  price: number
  sortOrder: number
}) {
  const existing = await prisma.deliveryOption.findFirst({
    where: { name: input.name, type: input.type },
    select: { id: true },
  })
  if (existing) {
    return
  }
  await prisma.deliveryOption.create({
    data: {
      name: input.name,
      nameEn: input.nameEn,
      type: input.type,
      price: input.price,
      isActive: true,
      sortOrder: input.sortOrder,
    },
  })
}

// Upsert delivery options and sample discount without deleting or re-keying existing data
async function seedExtras() {
  await prisma.appSetting.upsert({
    where: { key: 'shop_name' },
    update: { value: 'Telegram Shop' },
    create: { key: 'shop_name', value: 'Telegram Shop' },
  })
  await createDeliveryOptionIfMissing({
    name: 'Самовывоз',
    nameEn: 'Pickup',
    type: 'pickup',
    price: 0,
    sortOrder: 1,
  })
  await createDeliveryOptionIfMissing({
    name: 'Доставка курьером',
    nameEn: 'Courier delivery',
    type: 'delivery',
    price: 250,
    sortOrder: 2,
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
