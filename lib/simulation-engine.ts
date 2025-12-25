import prisma from "@/lib/prisma"

export interface SimulationInput {
  priceChangePercent?: number
  overrideElasticity?: number
  menuItemId?: string
  channelMix?: Record<string, number> // Target channel percentages
  staffingChanges?: {
    serverId?: string
    hoursChange?: number
  }
  hoursChanges?: {
    openHour?: number
    closeHour?: number
  }
}

export interface SimulationResult {
  projected: number
  delta: number
  projectedProfit: number
  profitDelta: number
  projectedOrders: number
  ordersDelta: number
  confidence: number
  risks: string[]
}

export async function runSimulation(input: SimulationInput): Promise<SimulationResult> {
  // Get baseline metrics
  const orders = await prisma.order.findMany({
    where: { status: "COMPLETED" },
    include: {
      items: {
        include: { menuItem: true },
      },
    },
  })

  const baselineRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0)
  const baselineOrders = orders.length
  const baselineProfit = orders.reduce((sum, order) => {
    return sum + order.items.reduce((itemSum, item) => {
      return itemSum + (item.price * item.quantity - item.menuItem.costPrice * item.quantity)
    }, 0)
  }, 0)

  let projectedRevenue = baselineRevenue
  let projectedOrders = baselineOrders
  let projectedProfit = baselineProfit
  const risks: string[] = []

  // 1. Price Change Simulation
  if (input.priceChangePercent !== undefined && input.menuItemId) {
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: input.menuItemId },
      include: {
        orderItems: {
          include: {
            order: {
              where: { status: "COMPLETED" },
            },
          },
        },
      },
    })

    if (menuItem) {
      const elasticity = input.overrideElasticity || menuItem.baseElasticity || 1.2
      const volumeChange = -input.priceChangePercent * elasticity
      const itemOrders = menuItem.orderItems.reduce((sum, oi) => sum + oi.quantity, 0)
      const itemRevenue = menuItem.orderItems.reduce((sum, oi) => sum + oi.price * oi.quantity, 0)
      const itemProfit = menuItem.orderItems.reduce((sum, oi) => {
        return sum + (oi.price * oi.quantity - menuItem.costPrice * oi.quantity)
      }, 0)

      const newPrice = menuItem.sellingPrice * (1 + input.priceChangePercent)
      const newVolume = itemOrders * (1 + volumeChange)
      const newRevenue = newPrice * newVolume
      const newProfit = (newPrice - menuItem.costPrice) * newVolume

      projectedRevenue = baselineRevenue - itemRevenue + newRevenue
      projectedProfit = baselineProfit - itemProfit + newProfit
      projectedOrders = baselineOrders - itemOrders + newVolume

      if (Math.abs(volumeChange) > 0.3) {
        risks.push(`Volume change of ${Math.round(volumeChange * 100)}% may be too aggressive`)
      }
    }
  }

  // 2. Channel Mix Simulation
  if (input.channelMix) {
    const currentChannels = new Map<string, number>()
    orders.forEach((o) => {
      currentChannels.set(o.channel, (currentChannels.get(o.channel) || 0) + o.totalAmount)
    })

    const totalCurrentRevenue = Array.from(currentChannels.values()).reduce((a, b) => a + b, 0)
    const targetTotal = Object.values(input.channelMix).reduce((a, b) => a + b, 0)

    if (Math.abs(targetTotal - 100) > 1) {
      risks.push("Channel mix percentages don't sum to 100%")
    }

    // Recalculate revenue based on new mix
    let newRevenue = 0
    for (const [channel, targetPercent] of Object.entries(input.channelMix)) {
      const currentPercent = totalCurrentRevenue > 0
        ? ((currentChannels.get(channel) || 0) / totalCurrentRevenue) * 100
        : 0
      const changePercent = targetPercent - currentPercent

      // Estimate revenue change (simplified)
      const channelRevenue = currentChannels.get(channel) || 0
      newRevenue += channelRevenue * (1 + changePercent / 100)
    }

    projectedRevenue = newRevenue
  }

  // 3. Staffing Changes Simulation
  if (input.staffingChanges) {
    // Simplified: assume staffing affects service speed and capacity
    const capacityMultiplier = input.staffingChanges.hoursChange
      ? 1 + (input.staffingChanges.hoursChange / 100)
      : 1

    projectedOrders = baselineOrders * capacityMultiplier
    projectedRevenue = baselineRevenue * capacityMultiplier
    projectedProfit = baselineProfit * capacityMultiplier

    if (input.staffingChanges.hoursChange && input.staffingChanges.hoursChange < -20) {
      risks.push("Significant reduction in staffing may impact service quality")
    }
  }

  // 4. Hours Changes Simulation
  if (input.hoursChanges) {
    const currentHours = 12 // Assume 11 AM - 11 PM
    const newOpenHour = input.hoursChanges.openHour || 11
    const newCloseHour = input.hoursChanges.closeHour || 23
    const newHours = newCloseHour - newOpenHour

    if (newHours < currentHours) {
      const reductionPercent = (currentHours - newHours) / currentHours
      projectedRevenue = baselineRevenue * (1 - reductionPercent * 0.8) // Assume 80% of reduction
      projectedOrders = baselineOrders * (1 - reductionPercent * 0.8)
      projectedProfit = baselineProfit * (1 - reductionPercent * 0.8)
      risks.push(`Reducing hours may impact customer convenience`)
    } else if (newHours > currentHours) {
      const increasePercent = (newHours - currentHours) / currentHours
      projectedRevenue = baselineRevenue * (1 + increasePercent * 0.6) // Assume 60% efficiency
      projectedOrders = baselineOrders * (1 + increasePercent * 0.6)
      projectedProfit = baselineProfit * (1 + increasePercent * 0.5) // Lower profit efficiency
      risks.push(`Extended hours may have lower efficiency`)
    }
  }

  // Calculate confidence based on data quality and change magnitude
  let confidence = 80
  if (baselineOrders < 100) confidence -= 20
  if (baselineOrders < 50) confidence -= 20
  if (risks.length > 2) confidence -= 10

  const delta = projectedRevenue - baselineRevenue
  const profitDelta = projectedProfit - baselineProfit
  const ordersDelta = projectedOrders - baselineOrders

  return {
    projected: projectedRevenue,
    delta,
    projectedProfit,
    profitDelta,
    projectedOrders: Math.round(projectedOrders),
    ordersDelta: Math.round(ordersDelta),
    confidence: Math.max(50, Math.min(95, confidence)),
    risks,
  }
}

// Legacy function for backward compatibility
export function simulatePriceChange({
  baseRevenue,
  priceChangePercent,
  elasticity,
}: {
  baseRevenue: number
  priceChangePercent: number
  elasticity: number
}) {
  const volumeChange = -priceChangePercent * elasticity
  const newRevenue = baseRevenue * (1 + priceChangePercent) * (1 + volumeChange)

  return {
    projectedRevenue: newRevenue,
    delta: newRevenue - baseRevenue,
  }
}
