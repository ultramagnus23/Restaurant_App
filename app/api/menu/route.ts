import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import type { MenuItem } from "@/lib/types"

export async function GET() {
  try {
    const menuItems = await prisma.menuItem.findMany({
      include: {
        orderItems: true,
      },
    })

    // Calculate popularity and orders for each item
    const totalOrders = menuItems.reduce(
      (sum, item) => sum + item.orderItems.reduce((s, oi) => s + oi.quantity, 0),
      0
    )
    const avgOrdersPerItem = totalOrders / (menuItems.length || 1)

    const result: MenuItem[] = menuItems.map((item) => {
      const orders = item.orderItems.reduce((sum, oi) => sum + oi.quantity, 0)
      const popularity = avgOrdersPerItem > 0
        ? Math.min(100, (orders / avgOrdersPerItem) * 50)
        : 0

      return {
        id: item.id,
        name: item.name,
        category: item.category as "appetizer" | "main" | "dessert" | "beverage",
        price: item.sellingPrice,
        cost: item.costPrice,
        prepTime: 10, // TODO: Add prepTime to schema
        popularity: Math.round(popularity),
        orders,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    })

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
