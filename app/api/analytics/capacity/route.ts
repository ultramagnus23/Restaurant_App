import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import type { TimeSlot, TableMetrics } from "@/lib/types"

// Configuration (can be made configurable)
const TOTAL_SEATS = 104 // Total restaurant capacity
const HOURS_OPEN = 12 // 11 AM to 11 PM

function getDayPart(hour: number): TimeSlot["dayPart"] {
  if (hour >= 6 && hour < 11) return "breakfast"
  if (hour >= 11 && hour < 15) return "lunch"
  if (hour >= 15 && hour < 21) return "dinner"
  return "late-night"
}

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      where: {
        status: "COMPLETED",
      },
      include: {
        items: true,
      },
    })

    // Group orders by hour
    const hourMap = new Map<number, typeof orders>()

    for (const order of orders) {
      const hour = new Date(order.timestamp).getHours()
      if (!hourMap.has(hour)) {
        hourMap.set(hour, [])
      }
      hourMap.get(hour)!.push(order)
    }

    // Calculate time slot metrics
    const timeSlots: TimeSlot[] = Array.from(hourMap.entries())
      .map(([hour, hourOrders]) => {
        const orders = hourOrders.length
        const revenue = hourOrders.reduce((sum, o) => sum + o.totalAmount, 0)
        const capacity = TOTAL_SEATS
        const utilizationPercent = Math.min(100, (orders / capacity) * 100)

        // Estimate table turnover (simplified: assume 1 hour average)
        const avgTableTurnover = 1.0

        // Calculate RevPASH: Revenue Per Available Seat Hour
        const revPASH = capacity > 0 ? revenue / capacity : 0

        return {
          hour,
          dayPart: getDayPart(hour),
          orders,
          revenue,
          capacity,
          utilizationPercent: Math.round(utilizationPercent * 100) / 100,
          avgTableTurnover,
          revPASH: Math.round(revPASH * 100) / 100,
        }
      })
      .sort((a, b) => a.hour - b.hour)

    // Calculate table size metrics (simplified - would need actual table data)
    // For now, estimate based on guest count if available
    const tableSizeMap = new Map<number, { count: number; revenue: number; seats: number }>()

    for (const order of orders) {
      const guestCount = order.guestCount || 2 // Default to 2 if not available
      let tableSize: 2 | 4 | 6 | 8 = 2
      if (guestCount <= 2) tableSize = 2
      else if (guestCount <= 4) tableSize = 4
      else if (guestCount <= 6) tableSize = 6
      else tableSize = 8

      if (!tableSizeMap.has(tableSize)) {
        tableSizeMap.set(tableSize, { count: 0, revenue: 0, seats: 0 })
      }

      const data = tableSizeMap.get(tableSize)!
      data.count++
      data.revenue += order.totalAmount
      data.seats += tableSize
    }

    // Estimate table counts (simplified)
    const tableCounts: Record<number, number> = {
      2: 12,
      4: 10,
      6: 4,
      8: 2,
    }

    const tableMetrics: TableMetrics[] = Array.from(tableSizeMap.entries())
      .map(([size, data]) => {
        const count = tableCounts[size] || 1
        const totalSeats = size * count
        const avgUtilization = data.count > 0
          ? Math.min(100, (data.count / count) * 100)
          : 0
        const avgRevenue = data.count > 0 ? data.revenue / data.count : 0
        const revenuePerSeat = totalSeats > 0 ? data.revenue / totalSeats : 0

        return {
          size: size as 2 | 4 | 6 | 8,
          count,
          totalSeats,
          avgUtilization: Math.round(avgUtilization * 100) / 100,
          avgRevenue: Math.round(avgRevenue * 100) / 100,
          revenuePerSeat: Math.round(revenuePerSeat * 100) / 100,
        }
      })
      .sort((a, b) => a.size - b.size)

    return NextResponse.json({
      success: true,
      data: {
        timeSlots,
        tableMetrics,
      },
    })
  } catch (error: any) {
    console.error("Error calculating capacity metrics:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
