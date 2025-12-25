import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      where: {
        status: "COMPLETED",
      },
      orderBy: {
        timestamp: "asc",
      },
    })

    const map = new Map<string, number>()

    for (const order of orders) {
      const day = order.timestamp.toISOString().split("T")[0]
      map.set(day, (map.get(day) ?? 0) + order.totalAmount)
    }

    const revenueByDay = Array.from(map.entries())
      .map(([date, revenue]) => ({
        date,
        revenue,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      success: true,
      data: revenueByDay,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

