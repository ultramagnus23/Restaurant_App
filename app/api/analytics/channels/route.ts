import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import type { ChannelMetrics } from "@/lib/types"

// Platform fee percentages (can be made configurable)
const PLATFORM_FEES: Record<string, number> = {
  "delivery-zomato": 0.25, // 25%
  "delivery-swiggy": 0.25, // 25%
  "delivery-doordash": 0.30, // 30%
  "booking": 0.05, // 5% (booking platform fee)
  "walk-in": 0,
  "delivery-direct": 0,
}

// Customer acquisition costs (can be made configurable)
const CAC: Record<string, number> = {
  "walk-in": 0,
  "booking": 400,
  "delivery-direct": 680,
  "delivery-zomato": 1200,
  "delivery-swiggy": 1150,
  "delivery-doordash": 1300,
}

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      where: {
        status: "COMPLETED",
      },
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
      },
    })

    // Group orders by channel
    const channelMap = new Map<string, {
      orders: typeof orders
      revenue: number
      grossMargin: number
    }>()

    for (const order of orders) {
      const channel = order.channel
      if (!channelMap.has(channel)) {
        channelMap.set(channel, { orders: [], revenue: 0, grossMargin: 0 })
      }

      const channelData = channelMap.get(channel)!
      channelData.orders.push(order)
      channelData.revenue += order.totalAmount

      // Calculate gross margin (revenue - COGS)
      const orderMargin = order.items.reduce((sum, item) => {
        const itemCost = item.menuItem.costPrice * item.quantity
        const itemRevenue = item.price * item.quantity
        return sum + (itemRevenue - itemCost)
      }, 0)
      channelData.grossMargin += orderMargin
    }

    // Calculate metrics for each channel
    const channelMetrics: ChannelMetrics[] = Array.from(channelMap.entries()).map(
      ([channel, data]) => {
        const totalOrders = data.orders.length
        const totalRevenue = data.revenue
        const grossMargin = data.grossMargin
        const platformFeePercent = PLATFORM_FEES[channel] || 0
        const platformFees = totalRevenue * platformFeePercent
        const customerAcquisitionCost = (CAC[channel] || 0) * totalOrders
        const netMargin = grossMargin - platformFees - customerAcquisitionCost
        const netMarginPercent = totalRevenue > 0 ? (netMargin / totalRevenue) * 100 : 0
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

        // Calculate repeat rate (simplified - would need customer tracking)
        // For now, estimate based on channel type
        const repeatRate = channel === "walk-in" ? 45 :
          channel === "booking" ? 65 :
          channel === "delivery-direct" ? 78 :
          channel.includes("zomato") ? 22 :
          channel.includes("swiggy") ? 24 : 20

        // Calculate LTV (simplified)
        const avgOrderFrequency = repeatRate > 50 ? 4 : repeatRate > 30 ? 2 : 1
        const lifetimeValue = avgOrderValue * avgOrderFrequency * 12 // 12 months
        const ltvCacRatio = customerAcquisitionCost > 0
          ? lifetimeValue / customerAcquisitionCost
          : 0

        return {
          channel: channel as ChannelMetrics["channel"],
          totalOrders,
          totalRevenue,
          grossMargin,
          platformFees,
          netMargin,
          netMarginPercent: Math.round(netMarginPercent * 100) / 100,
          avgOrderValue: Math.round(avgOrderValue * 100) / 100,
          customerAcquisitionCost,
          repeatRate,
          lifetimeValue: Math.round(lifetimeValue * 100) / 100,
          ltvCacRatio: Math.round(ltvCacRatio * 100) / 100,
        }
      }
    )

    return NextResponse.json({
      success: true,
      data: channelMetrics,
    })
  } catch (error: any) {
    console.error("Error calculating channel metrics:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
