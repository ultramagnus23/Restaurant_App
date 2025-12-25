import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import type { MenuItem, OrderItem } from "@prisma/client"

interface NewDishMetrics {
  menuItemId: string
  name: string
  launchDate: string
  daysSinceLaunch: number
  totalOrders: number
  uniqueCustomers: number
  repeatRate: number
  adoptionRate: number // Orders per day since launch
  breakEvenDays: number
  breakEvenStatus: "achieved" | "on-track" | "at-risk" | "failed"
  earlyFailureSignals: string[]
  revenue: number
  profit: number
  avgOrdersPerDay: number
}

type MenuItemWithOrders = MenuItem & {
  launchDate: Date | null
  prepTime: number | null
  active: boolean
  orderItems: (OrderItem & {
    order: {
      timestamp: Date
      status: string
    }
  })[]
}

export async function GET() {
  try {
    // Get menu items with launch dates (items created in last 90 days are considered "new")
    const allMenuItems = await prisma.menuItem.findMany({
      include: {
        orderItems: {
          include: {
            order: {
              select: {
                timestamp: true,
                status: true,
              },
            },
          },
        },
      },
    }) as MenuItemWithOrders[]

    const now = new Date()
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    // Filter to only completed orders
    const menuItemsWithCompletedOrders: MenuItemWithOrders[] = allMenuItems.map((item) => {
      const filteredOrderItems = item.orderItems.filter((oi) => oi.order.status === "COMPLETED")
      return {
        ...item,
        orderItems: filteredOrderItems,
      } as MenuItemWithOrders
    })

    // Filter new dishes (launched in last 90 days or no launch date but created recently)
    const newDishes = menuItemsWithCompletedOrders.filter((item) => {
      if (item.launchDate) {
        return new Date(item.launchDate) >= ninetyDaysAgo
      }
      // If no launch date, check if it has orders in last 90 days
      const recentOrders = item.orderItems.filter((oi) => {
        const orderDate = new Date(oi.order.timestamp)
        return orderDate >= ninetyDaysAgo
      })
      return recentOrders.length > 0
    })

    const metrics: NewDishMetrics[] = []

    for (const item of newDishes) {
      const launchDate = item.launchDate ? new Date(item.launchDate) : 
        item.orderItems.length > 0 
          ? new Date(item.orderItems[0].order.timestamp)
          : now

      const daysSinceLaunch = Math.floor((now.getTime() - launchDate.getTime()) / (24 * 60 * 60 * 1000))
      
      // Get all orders for this item
      const itemOrders = item.orderItems
      const totalOrders = itemOrders.reduce((sum: number, oi) => sum + oi.quantity, 0)
      
      // Estimate unique customers (simplified - would need customer tracking)
      // For now, use order count as proxy
      const uniqueCustomers = itemOrders.length
      const repeatRate = uniqueCustomers > 0 ? (totalOrders / uniqueCustomers - 1) * 100 : 0
      
      const adoptionRate = daysSinceLaunch > 0 ? totalOrders / daysSinceLaunch : 0
      const avgOrdersPerDay = daysSinceLaunch > 0 ? totalOrders / daysSinceLaunch : 0

      // Calculate revenue and profit
      const revenue = itemOrders.reduce((sum: number, oi) => sum + oi.price * oi.quantity, 0)
      const profit = itemOrders.reduce((sum: number, oi) => {
        return sum + (oi.price * oi.quantity - item.costPrice * oi.quantity)
      }, 0)

      // Break-even analysis
      // Assume break-even target is 3x cost price in profit (simplified)
      const breakEvenTarget = item.costPrice * 3
      const breakEvenDays = profit > 0 && avgOrdersPerDay > 0
        ? Math.ceil(breakEvenTarget / (profit / daysSinceLaunch))
        : Infinity

      // Determine break-even status
      let breakEvenStatus: "achieved" | "on-track" | "at-risk" | "failed"
      if (profit >= breakEvenTarget) {
        breakEvenStatus = "achieved"
      } else if (daysSinceLaunch < 30 && profit > breakEvenTarget * 0.3) {
        breakEvenStatus = "on-track"
      } else if (daysSinceLaunch >= 30 && profit < breakEvenTarget * 0.5) {
        breakEvenStatus = "at-risk"
      } else {
        breakEvenStatus = "failed"
      }

      // Early failure signals
      const failureSignals: string[] = []
      if (daysSinceLaunch >= 14 && totalOrders < 5) {
        failureSignals.push("Very low adoption after 2 weeks")
      }
      if (repeatRate < 10 && totalOrders > 10) {
        failureSignals.push("Low repeat rate indicates poor customer satisfaction")
      }
      if (avgOrdersPerDay < 0.5 && daysSinceLaunch >= 7) {
        failureSignals.push("Declining daily orders")
      }
      if (profit < 0) {
        failureSignals.push("Negative profit margin")
      }
      if (daysSinceLaunch >= 30 && profit < breakEvenTarget * 0.3) {
        failureSignals.push("Not on track to break even")
      }

      metrics.push({
        menuItemId: item.id,
        name: item.name,
        launchDate: launchDate.toISOString(),
        daysSinceLaunch,
        totalOrders,
        uniqueCustomers,
        repeatRate: Math.round(repeatRate * 100) / 100,
        adoptionRate: Math.round(adoptionRate * 100) / 100,
        breakEvenDays: breakEvenDays === Infinity ? -1 : breakEvenDays,
        breakEvenStatus,
        earlyFailureSignals: failureSignals,
        revenue: Math.round(revenue * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        avgOrdersPerDay: Math.round(avgOrdersPerDay * 100) / 100,
      })
    }

    // Sort by launch date (newest first)
    metrics.sort((a, b) => b.daysSinceLaunch - a.daysSinceLaunch)

    return NextResponse.json({
      success: true,
      data: metrics,
    })
  } catch (error: any) {
    console.error("Error calculating new dish metrics:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
