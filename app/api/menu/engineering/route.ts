import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import type { MenuEngineering } from "@/lib/types"

export async function GET() {
  try {
    // Get all menu items with their order items
    const menuItems = await prisma.menuItem.findMany({
      include: {
        orderItems: {
          include: {
            order: {
              where: {
                status: "COMPLETED",
              },
            },
          },
        },
      },
    })

    // Calculate total orders for popularity calculation
    const allOrderItems = await prisma.orderItem.findMany({
      include: {
        order: {
          where: {
            status: "COMPLETED",
          },
    },
      },
    })

    const totalOrders = allOrderItems.reduce((sum, item) => sum + item.quantity, 0)
    const avgOrdersPerItem = totalOrders / (menuItems.length || 1)

    // Calculate average margin for threshold
    const margins = menuItems.map((item) => item.sellingPrice - item.costPrice)
    const avgMargin = margins.reduce((sum, m) => sum + m, 0) / (margins.length || 1)

    const menuEngineering: MenuEngineering[] = menuItems.map((item) => {
      // Calculate orders and revenue for this item
      const itemOrders = item.orderItems.reduce((sum, oi) => sum + oi.quantity, 0)
      const revenue = item.orderItems.reduce(
        (sum, oi) => sum + oi.price * oi.quantity,
        0
      )
      const margin = item.sellingPrice - item.costPrice

      // Calculate popularity (0-100 scale based on orders relative to average)
      const popularity = avgOrdersPerItem > 0
        ? Math.min(100, (itemOrders / avgOrdersPerItem) * 50)
        : 0

      // Calculate revenue per minute (margin / prep time)
      // Default prep time to 10 minutes if not available
      const prepTime = 10 // TODO: Add prepTime to MenuItem schema
      const revenuePerMinute = prepTime > 0 ? margin / prepTime : 0

    // Categorize based on popularity and margin thresholds
      // Using 50% popularity threshold and ₹680 margin threshold (as per README)
    let engineeringCategory: MenuEngineering["engineeringCategory"]
      if (popularity >= 50 && margin >= 680) {
      engineeringCategory = "Stars"
      } else if (popularity >= 50 && margin < 680) {
      engineeringCategory = "Plowhorses"
      } else if (popularity < 50 && margin >= 680) {
      engineeringCategory = "Puzzles"
    } else {
      engineeringCategory = "Dogs"
    }

      // Calculate cannibalization (simplified: items ordered together)
      // This is a placeholder - real cannibalization requires order-level analysis
      const cannibalization = 0 // TODO: Implement proper cannibalization analysis

    return {
        id: item.id,
        name: item.name,
        category: item.category as "appetizer" | "main" | "dessert" | "beverage",
        price: item.sellingPrice,
        cost: item.costPrice,
        prepTime,
        popularity: Math.round(popularity),
        orders: itemOrders,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      engineeringCategory,
      margin,
      revenue,
        cannibalization,
      revenuePerMinute,
    }
  })

    return NextResponse.json({
      success: true,
      data: menuEngineering,
    })
  } catch (error: any) {
    console.error("Error calculating menu engineering:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
