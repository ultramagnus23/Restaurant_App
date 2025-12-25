import prisma from "@/lib/prisma"

export async function getDashboardMetrics() {
  const orders = await prisma.order.findMany()

  const totalOrders = orders.length
  const totalRevenue = orders.reduce(
    (sum, o) => sum + o.totalAmount,
    0
  )

  const avgOrderValue =
    totalOrders === 0 ? 0 : totalRevenue / totalOrders

  return {
    totalOrders,
    totalRevenue,
    avgOrderValue,
  }
}

export async function getRevenueByDay() {
  const orders = await prisma.order.findMany()

  const map = new Map<string, number>()

  for (const o of orders) {
    const day = o.timestamp.toISOString().split("T")[0]
    map.set(day, (map.get(day) ?? 0) + o.totalAmount)
  }

  return Array.from(map.entries()).map(([date, revenue]) => ({
    date,
    revenue,
  }))
}

export async function getMenuProfitability() {
  const items = await prisma.orderItem.findMany({
    include: { menuItem: true },
  })

  const map = new Map<
    string,
    { revenue: number; cost: number }
  >()

  for (const i of items) {
    const name = i.menuItem.name
    const revenue = i.price * i.quantity
    const cost = i.menuItem.costPrice * i.quantity

    if (!map.has(name)) {
      map.set(name, { revenue: 0, cost: 0 })
    }

    map.get(name)!.revenue += revenue
    map.get(name)!.cost += cost
  }

  return Array.from(map.entries()).map(([name, v]) => ({
    name,
    revenue: v.revenue,
    profit: v.revenue - v.cost,
  }))
}
