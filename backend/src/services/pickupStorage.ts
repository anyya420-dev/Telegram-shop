import type { Prisma } from '@prisma/client'

function normalizeVariantKey(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeAmount(value: number) {
  return Number(value.toFixed(3))
}

export async function assignPickupStoragesForPaidOrder(tx: Prisma.TransactionClient, orderId: number) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      deliveryOption: true,
      items: {
        include: {
          pickupAssignment: true,
        },
        orderBy: { id: 'asc' },
      },
    },
  })

  if (!order || order.deliveryOption?.type !== 'pickup') {
    await tx.order.update({ where: { id: orderId }, data: { pickupStorageResolutionRequired: false } })
    return { requiresManualResolution: false }
  }

  let requiresManualResolution = false

  for (const item of order.items) {
    if (item.pickupAssignment) {
      continue
    }

    const variantKey = normalizeVariantKey(item.variantKey)
    const targetQuantity = normalizeAmount(item.quantity)
    const targetUnit = item.unit.trim()

    let assigned = false

    for (let attempt = 0; attempt < 10 && !assigned; attempt += 1) {
      const candidate = await tx.pickupStorage.findFirst({
        where: {
          productCityId: item.productCityId,
          variantKey,
          quantity: targetQuantity,
          unit: targetUnit,
          isActive: true,
          status: 'available',
          assignedOrderItemId: null,
        },
        orderBy: { id: 'asc' },
      })

      if (!candidate) {
        break
      }

      const updated = await tx.pickupStorage.updateMany({
        where: {
          id: candidate.id,
          isActive: true,
          status: 'available',
          assignedOrderItemId: null,
        },
        data: {
          status: 'assigned',
          assignedAt: new Date(),
          assignedOrderId: order.id,
          assignedOrderItemId: item.id,
        },
      })

      if (updated.count === 1) {
        await tx.pickupStorageAssignment.create({
          data: {
            orderItemId: item.id,
            pickupStorageId: candidate.id,
            productName: item.productName,
            variantKey,
            quantity: item.quantity,
            unit: item.unit,
            photoUrl: candidate.photoUrl,
            address: candidate.address,
            instructions: candidate.instructions,
          },
        })
        assigned = true
      }
    }

    if (!assigned) {
      requiresManualResolution = true
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: order.status,
          comment: `Pickup storage missing for item ${item.id}; manual resolution required`,
        },
      })
    }
  }

  await tx.order.update({
    where: { id: order.id },
    data: { pickupStorageResolutionRequired: requiresManualResolution },
  })

  return { requiresManualResolution }
}
