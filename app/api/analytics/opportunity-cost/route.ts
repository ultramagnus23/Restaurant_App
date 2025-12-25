import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import type { MenuItem, OrderItem } from "@prisma/client"

interface OpportunityCostAnalysis {
  menuItemId: string
  name: string
  prepTime: number
  orders: number
  revenue: number
  profit: number
  revenuePerPrepMinute: number
  opportunityCost: number
  bottleneckScore: number // Higher = more bottleneck
  recommendation: string
}

type MenuItemWithOrders = MenuItem & {
  launchDate: Date | null
  prepTime: number | null
  active: boolean
  orderItems: (OrderItem & {
    order: {
      status: string
    }
  })[]
}

export async function GET() {
  try {
    const menuItems = await prisma.menuItem.findMany({
      include: {
        orderItems: {
          include: {
            order: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    }) as MenuItemWithOrders[]

    // Filter to only completed orders
    const menuItemsWithCompletedOrders: MenuItemWithOrders[] = menuItems.map((item) => {
      const filteredOrderItems = item.orderItems.filter((oi) => oi.order.status === "COMPLETED")
      return {
        ...item,
        orderItems: filteredOrderItems,
      } as MenuItemWithOrders
    })

    // Calculate average prep time if not available (default to 10)
    const avgPrepTime = menuItemsWithCompletedOrders.reduce((sum, item) => {
      return sum + (item.prepTime || 10)
    }, 0) / (menuItemsWithCompletedOrders.length || 1)

    const analyses: OpportunityCostAnalysis[] = []

    for (const item of menuItemsWithCompletedOrders) {
      const prepTime = item.prepTime || 10
      const orders = item.orderItems.reduce((sum: number, oi) => sum + oi.quantity, 0)
      const revenue = item.orderItems.reduce((sum: number, oi) => sum + oi.price * oi.quantity, 0)
      const profit = item.orderItems.reduce((sum: number, oi) => {
        return sum + (oi.price * oi.quantity - item.costPrice * oi.quantity)
      }, 0)

      // Revenue per prep minute
      const totalPrepMinutes = prepTime * orders
      const revenuePerPrepMinute = totalPrepMinutes > 0 ? revenue / totalPrepMinutes : 0

      // Opportunity cost: How much revenue could we generate with the same prep time?
      // Assume average dish generates revenuePerPrepMinute * prepTime
      const avgRevenuePerPrepMinute = menuItemsWithCompletedOrders.reduce((sum: number, mi) => {
        const miOrders = mi.orderItems.reduce((s: number, oi) => s + oi.quantity, 0)
        const miRevenue = mi.orderItems.reduce((s: number, oi) => s + oi.price * oi.quantity, 0)
        const miPrepTime = mi.prepTime || 10
        const miTotalPrepMinutes = miPrepTime * miOrders
        return sum + (miTotalPrepMinutes > 0 ? miRevenue / miTotalPrepMinutes : 0)
      }, 0) / (menuItemsWithCompletedOrders.length || 1)

      const opportunityCost = totalPrepMinutes * (avgRevenuePerPrepMinute - revenuePerPrepMinute)

      // Bottleneck score: Higher prep time + lower revenue per minute = higher bottleneck
      const bottleneckScore = prepTime * (1 / (revenuePerPrepMinute + 1))

      // Generate recommendation
      let recommendation = ""
      if (prepTime > avgPrepTime * 1.5 && revenuePerPrepMinute < avgRevenuePerPrepMinute * 0.7) {
        recommendation = `High prep time (${prepTime} min) with low revenue efficiency. Consider simplifying recipe or increasing price.`
      } else if (prepTime > avgPrepTime * 1.5 && revenuePerPrepMinute > avgRevenuePerPrepMinute * 1.2) {
        recommendation = `High prep time but good revenue efficiency. Consider optimizing prep process to reduce time.`
      } else if (prepTime < avgPrepTime * 0.7 && revenuePerPrepMinute < avgRevenuePerPrepMinute * 0.8) {
        recommendation = `Low prep time but also low revenue. Good for volume but consider upselling or bundling.`
      } else {
        recommendation = `Well-balanced prep time and revenue efficiency.`
      }

      analyses.push({
        menuItemId: item.id,
        name: item.name,
        prepTime,
        orders,
        revenue: Math.round(revenue * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        revenuePerPrepMinute: Math.round(revenuePerPrepMinute * 100) / 100,
        opportunityCost: Math.round(opportunityCost * 100) / 100,
        bottleneckScore: Math.round(bottleneckScore * 100) / 100,
        recommendation,
      })
    }

    // Sort by bottleneck score (highest first)
    analyses.sort((a, b) => b.bottleneckScore - a.bottleneckScore)

    return NextResponse.json({
      success: true,
      data: analyses,
    })
  } catch (error: any) {
    console.error("Error calculating opportunity cost:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
