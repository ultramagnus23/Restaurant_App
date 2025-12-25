import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import type { ServerPerformance } from "@/lib/types"

// Calculate shift difficulty based on hour and day of week
function calculateShiftDifficulty(timestamp: Date): number {
  const hour = timestamp.getHours()
  const dayOfWeek = timestamp.getDay() // 0 = Sunday, 6 = Saturday

  // Peak hours (lunch 12-14, dinner 18-21) are harder
  const isPeakHour = (hour >= 12 && hour < 14) || (hour >= 18 && hour < 21)
  // Weekends are harder
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  let difficulty = 1.0
  if (isPeakHour && isWeekend) difficulty = 1.5
  else if (isPeakHour) difficulty = 1.3
  else if (isWeekend) difficulty = 1.2

  return difficulty
}

// Calculate fatigue adjustment based on hours worked
function calculateFatigueAdjustment(hoursWorked: number): number {
  // Performance degrades after 6 hours
  if (hoursWorked <= 6) return 1.0
  if (hoursWorked <= 8) return 0.95
  if (hoursWorked <= 10) return 0.85
  return 0.75 // > 10 hours
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

    const servers = await prisma.server.findMany({
      include: {
        orders: {
          include: {
            items: {
              include: {
                menuItem: true,
              },
            },
          },
        },
      },
    })

    // Filter to only completed orders
    const serversWithCompletedOrders = servers.map((server) => ({
      ...server,
      orders: server.orders.filter((o) => o.status === "COMPLETED"),
    }))

    const serverPerformance: ServerPerformance[] = serversWithCompletedOrders.map((server) => {
      const orders = server.orders
      const totalOrders = orders.length
      const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0)
      const avgCheckSize = totalOrders > 0 ? totalRevenue / totalOrders : 0

      // Calculate upsell rate (simplified: orders with > 2 items)
      const ordersWithUpsells = orders.filter((o) => {
        const itemCount = o.items.reduce((sum, item) => sum + item.quantity, 0)
        return itemCount > 2
      }).length
      const upsellRate = totalOrders > 0 ? (ordersWithUpsells / totalOrders) * 100 : 0

      // Calculate average service time (simplified: estimate based on order size)
      // Real implementation would track actual service times
      const avgServiceTime = orders.reduce((sum, o) => {
        const itemCount = o.items.reduce((s, item) => s + item.quantity, 0)
        // Estimate: 10 min base + 2 min per item
        return sum + (10 + itemCount * 2)
      }, 0) / (totalOrders || 1)

      // Group orders by shift to calculate hours worked
      const shifts = new Map<string, Date[]>()
      for (const order of orders) {
        const shiftKey = order.timestamp.toISOString().split("T")[0] // Group by day
        if (!shifts.has(shiftKey)) {
          shifts.set(shiftKey, [])
        }
        shifts.get(shiftKey)!.push(order.timestamp)
      }

      const shiftsWorked = shifts.size
      // Estimate hours worked (assume 8 hours per shift)
      const hoursWorked = shiftsWorked * 8

      // Calculate normalized effectiveness
      // Raw performance = revenue per hour
      const rawPerformance = hoursWorked > 0 ? totalRevenue / hoursWorked : 0

      // Calculate average shift difficulty
      const avgDifficulty = orders.reduce((sum, o) => {
        return sum + calculateShiftDifficulty(o.timestamp)
      }, 0) / (totalOrders || 1)

      // Apply fatigue adjustment
      const fatigueAdjustment = calculateFatigueAdjustment(hoursWorked)

      // Normalized effectiveness = (Raw Performance / Shift Difficulty) * Fatigue Adjustment
      const effectivenessScore = Math.min(
        100,
        Math.round((rawPerformance / avgDifficulty) * fatigueAdjustment * 0.1)
      )

      return {
        id: server.id,
        name: server.name,
        active: true,
        hireDate: new Date().toISOString(), // TODO: Add hireDate to Server schema
        totalOrders,
        totalRevenue,
        avgCheckSize: Math.round(avgCheckSize * 100) / 100,
        upsellRate: Math.round(upsellRate * 100) / 100,
        avgServiceTime: Math.round(avgServiceTime * 100) / 100,
        effectivenessScore,
        shiftsWorked,
        hoursWorked,
      }
    })

    return NextResponse.json({
      success: true,
      data: serverPerformance,
    })
  } catch (error: any) {
    console.error("Error calculating server performance:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
