import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import type { Decision } from "@/lib/types"

async function getMenuEngineering() {
  const menuItems = await prisma.menuItem.findMany({
    include: {
      orderItems: {
        include: {
          order: true,
        },
      },
    },
  })

  // Filter to only completed orders
  const menuItemsWithCompletedOrders = menuItems.map((item) => ({
    ...item,
    orderItems: item.orderItems.filter((oi) => oi.order.status === "COMPLETED"),
  }))

  const totalOrders = menuItemsWithCompletedOrders.reduce(
    (sum, item) => sum + item.orderItems.reduce((s, oi) => s + oi.quantity, 0),
    0
  )
  const avgOrdersPerItem = totalOrders / (menuItemsWithCompletedOrders.length || 1)

  return menuItemsWithCompletedOrders.map((item) => {
    const orders = item.orderItems.reduce((sum, oi) => sum + oi.quantity, 0)
    const popularity = avgOrdersPerItem > 0
      ? Math.min(100, (orders / avgOrdersPerItem) * 50)
      : 0
    const margin = item.sellingPrice - item.costPrice
    const revenue = item.orderItems.reduce((sum, oi) => sum + oi.price * oi.quantity, 0)

    return {
      id: item.id,
      name: item.name,
      popularity,
      margin,
      revenue,
      orders,
      price: item.sellingPrice,
      cost: item.costPrice,
      prepTime: item.prepTime || 10,
    }
  })
}

async function getChannelMetrics() {
  const orders = await prisma.order.findMany({
    where: { status: "COMPLETED" },
    include: {
      items: {
        include: {
          menuItem: true,
        },
      },
    },
  })

  const channelMap = new Map<string, { orders: typeof orders; revenue: number; grossMargin: number }>()

  for (const order of orders) {
    if (!channelMap.has(order.channel)) {
      channelMap.set(order.channel, { orders: [], revenue: 0, grossMargin: 0 })
    }
    const data = channelMap.get(order.channel)!
    data.orders.push(order)
    data.revenue += order.totalAmount
    data.grossMargin += order.items.reduce((sum, item) => {
      return sum + (item.price * item.quantity - item.menuItem.costPrice * item.quantity)
    }, 0)
  }

  return Array.from(channelMap.entries()).map(([channel, data]) => {
    const platformFeePercent = channel.includes("zomato") || channel.includes("swiggy") ? 0.25 :
      channel === "booking" ? 0.05 : 0
    const platformFees = data.revenue * platformFeePercent
    const netMargin = data.grossMargin - platformFees

    return {
      channel,
      totalOrders: data.orders.length,
      totalRevenue: data.revenue,
      netMargin,
      netMarginPercent: data.revenue > 0 ? (netMargin / data.revenue) * 100 : 0,
    }
  })
}

async function getCapacityMetrics() {
  const orders = await prisma.order.findMany({
    where: { status: "COMPLETED" },
  })

  const hourMap = new Map<number, typeof orders>()
  for (const order of orders) {
    const hour = new Date(order.timestamp).getHours()
    if (!hourMap.has(hour)) hourMap.set(hour, [])
    hourMap.get(hour)!.push(order)
  }

  return Array.from(hourMap.entries()).map(([hour, hourOrders]) => ({
    hour,
    orders: hourOrders.length,
    revenue: hourOrders.reduce((sum, o) => sum + o.totalAmount, 0),
  }))
}

export async function GET() {
  try {
    // Check if we have any data
    const orderCount = await prisma.order.count()
    if (orderCount === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      })
    }

    const [menuData, channelData, capacityData] = await Promise.all([
      getMenuEngineering(),
      getChannelMetrics(),
      getCapacityMetrics(),
    ])

    const decisions: Decision[] = []

    // 1. Menu Engineering Decisions
    for (const item of menuData) {
      // Puzzles: Low popularity, high margin -> Promote
      if (item.popularity < 50 && item.margin >= 680) {
        const projectedIncrease = item.orders * 0.45 // 45% volume increase
        const impact = projectedIncrease * item.margin

        decisions.push({
          id: `DEC-MENU-${item.id}`,
      action: "Promote",
          item: item.name,
      category: "Menu",
          priority: item.margin > 1000 ? "high" : "medium",
          impact: {
            min: Math.round(impact * 0.7),
            max: Math.round(impact * 1.2),
            confidence: 75,
          },
          reason: `High contribution margin (₹${item.margin}) with low popularity (${item.popularity}%). Strategic promotion can increase volume without capacity strain.`,
          risks: ["May cannibalize similar items by 8-12%"],
          recommendation: `Run happy hour promotion 2-4pm with ₹${Math.round(item.price * 0.15)} off. Expected 45% volume increase.`,
      status: "pending",
      createdAt: new Date().toISOString(),
        })
      }

      // Plowhorses: High popularity, low margin -> Reprice
      if (item.popularity >= 50 && item.margin < 680 && item.margin > 0) {
        const priceIncrease = Math.round(item.price * 0.15) // 15% increase
        const volumeLoss = 0.25 // Assume 25% volume loss
        const newOrders = item.orders * (1 - volumeLoss)
        const newMargin = (item.price + priceIncrease) - item.cost
        const impact = (newOrders * newMargin) - (item.orders * item.margin)

        decisions.push({
          id: `DEC-PRICE-${item.id}`,
      action: "Reprice",
          item: item.name,
      category: "Menu",
          priority: item.orders > 200 ? "high" : "medium",
          impact: {
            min: Math.round(impact * 0.8),
            max: Math.round(impact * 1.1),
            confidence: 70,
          },
          reason: `Popularity index of ${item.popularity}% but contribution margin only ₹${item.margin}. Price elasticity modeling suggests +₹${priceIncrease} increase maintains 70% of volume.`,
          risks: [`Could reduce orders by 25-30%`, "Competition pricing may be lower"],
          recommendation: `Increase price from ₹${item.price} to ₹${item.price + priceIncrease}. Monitor first week closely.`,
      status: "pending",
      createdAt: new Date().toISOString(),
        })
      }

      // Dogs with high prep time -> Remove
      if (item.popularity < 50 && item.margin < 680 && item.prepTime > 15) {
        const opportunityCost = item.prepTime * item.orders * 2.3 // 2.3 other dishes blocked
        const impact = opportunityCost - (item.orders * item.margin)

        if (impact > 0) {
          decisions.push({
            id: `DEC-REMOVE-${item.id}`,
      action: "Remove",
            item: item.name,
      category: "Menu",
      priority: "medium",
            impact: {
              min: Math.round(impact * 0.6),
              max: Math.round(impact * 1.4),
              confidence: 65,
            },
            reason: `Kitchen bottleneck: ${item.prepTime}-min prep time blocks ${Math.round(item.prepTime / 8)} other dishes during peak. Only ${item.orders} orders with ₹${item.margin} margin doesn't justify opportunity cost.`,
            risks: ["May disappoint regular customers"],
            recommendation: `Replace with ${Math.round(item.prepTime * 0.5)}-min prep dish. Free up ${Math.round(item.prepTime * item.orders)} min/week peak capacity.`,
      status: "pending",
      createdAt: new Date().toISOString(),
          })
        }
      }
    }

    // 2. Channel Optimization Decisions
    const directChannel = channelData.find((c) => c.channel === "delivery-direct")
    const aggregatorChannels = channelData.filter((c) =>
      c.channel.includes("zomato") || c.channel.includes("swiggy")
    )

    if (directChannel && aggregatorChannels.length > 0) {
      const aggregatorTotal = aggregatorChannels.reduce((sum, c) => sum + c.totalRevenue, 0)
      const aggregatorMargin = aggregatorChannels.reduce((sum, c) => sum + c.netMargin, 0)
      const directMargin = directChannel.netMargin

      if (directMargin > aggregatorMargin / aggregatorChannels.length) {
        const currentSplit = aggregatorTotal / (aggregatorTotal + directChannel.totalRevenue)
        const targetSplit = 0.3 // 30% aggregator, 70% direct
        const impact = (currentSplit - targetSplit) * aggregatorTotal * 0.5 // 50% margin improvement

        decisions.push({
          id: "DEC-CHANNEL-001",
      action: "Optimize",
      item: "Delivery Channel Mix",
      category: "Channel",
      priority: "high",
          impact: {
            min: Math.round(impact * 0.7),
            max: Math.round(impact * 1.3),
            confidence: 75,
          },
          reason: `Direct ordering net margin is ${Math.round(directChannel.netMarginPercent)}% vs aggregators at ${Math.round((aggregatorMargin / aggregatorTotal) * 100)}%. Current split leaves opportunity on table.`,
          risks: ["May reduce total order volume by 15%", "Requires marketing spend"],
      recommendation: "Launch loyalty program for direct orders. Target 70/30 split in 8 weeks.",
      status: "pending",
      createdAt: new Date().toISOString(),
        })
      }
    }

    // 3. Capacity Optimization Decisions
    const peakHours = capacityData.filter((c) => c.hour >= 18 && c.hour <= 21)
    const offPeakHours = capacityData.filter((c) => c.hour >= 14 && c.hour < 18)

    if (peakHours.length > 0 && offPeakHours.length > 0) {
      const peakRevPASH = peakHours.reduce((sum, h) => sum + h.revenue, 0) / (peakHours.length * 104)
      const offPeakRevPASH = offPeakHours.reduce((sum, h) => sum + h.revenue, 0) / (offPeakHours.length * 104)

      if (peakRevPASH > offPeakRevPASH * 2) {
        const improvement = (peakRevPASH - offPeakRevPASH) * 0.11 * 104 * 3 // 11% improvement, 3 hours
        decisions.push({
          id: "DEC-CAPACITY-001",
          action: "Optimize",
          item: "Peak Hour Capacity",
      category: "Operations",
      priority: "medium",
          impact: {
            min: Math.round(improvement * 0.8),
            max: Math.round(improvement * 1.2),
            confidence: 65,
          },
          reason: `Peak hours (6-9 PM) show ${Math.round((peakRevPASH / offPeakRevPASH) * 100)}% higher RevPASH than off-peak. Capacity optimization can improve table turnover.`,
          risks: ["May require staffing adjustments"],
          recommendation: "Optimize table allocation and server scheduling during peak hours.",
      status: "pending",
      createdAt: new Date().toISOString(),
        })
      }
}

    return NextResponse.json({
      success: true,
      data: decisions,
    })
  } catch (error: any) {
    console.error("Error generating decisions:", error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || "Failed to generate decisions" 
    }, { status: 500 })
  }
}
