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

  const [warsaw, krakow, wroclaw] = await Promise.all([
    prisma.city.create({ data: { name: 'Варшава', isActive: true } }),
    prisma.city.create({ data: { name: 'Краков', isActive: true } }),
    prisma.city.create({ data: { name: 'Вроцлав', isActive: true } }),
  ])

  const categories = await Promise.all([
    prisma.category.create({ data: { name: 'Одежда', sortOrder: 1 } }),
    prisma.category.create({ data: { name: 'Электроника', sortOrder: 2 } }),
    prisma.category.create({ data: { name: 'Дом', sortOrder: 3 } }),
    prisma.category.create({ data: { name: 'Аксессуары', sortOrder: 4 } }),
    prisma.category.create({ data: { name: 'Другое', sortOrder: 5 } }),
  ])

  const byName = Object.fromEntries(categories.map((category) => [category.name, category]))

  const coffee = await prisma.product.create({
    data: {
      name: 'Кофе',
      description: 'Свежая обжарка для дома и офиса с гибким выбором веса.',
      price: 20,
      image: '/products/coffee.svg',
      categoryId: byName['Дом'].id,
      isRecommended: true,
    },
  })

  const headphones = await prisma.product.create({
    data: {
      name: 'Наушники',
      description: 'Беспроводные наушники с чистым звуком и холодным синим кейсом.',
      price: 299,
      image: '/products/headphones.svg',
      categoryId: byName['Электроника'].id,
      isRecommended: true,
    },
  })

  const tshirt = await prisma.product.create({
    data: {
      name: 'Футболка',
      description: 'Минималистичная футболка премиального кроя для ежедневного гардероба.',
      price: 85,
      image: '/products/tshirt.svg',
      categoryId: byName['Одежда'].id,
      isRecommended: false,
    },
  })

  const charger = await prisma.product.create({
    data: {
      name: 'Зарядка',
      description: 'Компактное зарядное устройство для смартфона и аксессуаров.',
      price: 59,
      image: '/products/charger.svg',
      categoryId: byName['Аксессуары'].id,
      isRecommended: true,
    },
  })

  await prisma.productCity.createMany({
    data: [
      {
        productId: coffee.id,
        cityId: warsaw.id,
        stock: 18,
        minimumQuantity: 0.5,
        quantityStep: 0.5,
        maximumQuantity: 5,
        unit: 'кг',
        isAvailable: true,
      },
      {
        productId: coffee.id,
        cityId: krakow.id,
        stock: 9.5,
        minimumQuantity: 0.5,
        quantityStep: 0.5,
        maximumQuantity: 4,
        unit: 'кг',
        isAvailable: true,
      },
      {
        productId: headphones.id,
        cityId: warsaw.id,
        stock: 7,
        minimumQuantity: 1,
        quantityStep: 1,
        maximumQuantity: 3,
        unit: 'шт.',
        isAvailable: true,
      },
      {
        productId: headphones.id,
        cityId: wroclaw.id,
        stock: 4,
        minimumQuantity: 1,
        quantityStep: 1,
        maximumQuantity: 2,
        unit: 'шт.',
        isAvailable: true,
      },
      {
        productId: tshirt.id,
        cityId: warsaw.id,
        stock: 24,
        minimumQuantity: 1,
        quantityStep: 1,
        maximumQuantity: 10,
        unit: 'шт.',
        isAvailable: true,
      },
      {
        productId: tshirt.id,
        cityId: krakow.id,
        stock: 12,
        minimumQuantity: 1,
        quantityStep: 1,
        maximumQuantity: 6,
        unit: 'шт.',
        isAvailable: true,
      },
      {
        productId: charger.id,
        cityId: warsaw.id,
        stock: 15,
        minimumQuantity: 1,
        quantityStep: 1,
        maximumQuantity: 5,
        unit: 'шт.',
        isAvailable: true,
      },
      {
        productId: charger.id,
        cityId: wroclaw.id,
        stock: 11,
        minimumQuantity: 1,
        quantityStep: 1,
        maximumQuantity: 4,
        unit: 'шт.',
        isAvailable: true,
      }
    ],
  })
}

main()
  .catch(async (error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
