import { type NextRequest, NextResponse } from "next/server"
import type { Order } from "@/lib/types"

// TODO: Replace this mock data with your actual POS system API integration
// Example integrations: Square, Toast, Lightspeed, Clover, etc.
//
// TO CONNECT YOUR API:
// 1. Import your POS SDK or API client
// 2. Replace generateMockOrders() with actual API calls
// 3. Add authentication if required
// 4. Map your POS data structure to our Order type
//
// Example:
// import { SquareClient } from '@square/api-client'
// const client = new SquareClient({ accessToken: process.env.SQUARE_API_KEY })
// const orders = await client.orders.list(...)

function generateMockOrders(): Order[] {
  const orders: Order[] = []
  const channels: Order["channel"][] = ["walk-in", "booking", "delivery-direct", "delivery-zomato", "delivery-swiggy"]

  const menuItems = [
    { id: "1", name: "Margherita Pizza", price: 1120, cost: 440 },
    { id: "2", name: "Caesar Salad", price: 760, cost: 504 },
    { id: "3", name: "Pepperoni Pizza", price: 1280, cost: 544 },
    { id: "4", name: "House Burger", price: 1040, cost: 624 },
    { id: "5", name: "Grilled Salmon", price: 1920, cost: 896 },
  ]

  for (let i = 0; i < 150; i++) {
    const channel = channels[Math.floor(Math.random() * channels.length)]
    const itemCount = Math.floor(Math.random() * 3) + 1
    const items: Order["items"] = []

    let subtotal = 0
    for (let j = 0; j < itemCount; j++) {
      const item = menuItems[Math.floor(Math.random() * menuItems.length)]
      const quantity = Math.floor(Math.random() * 2) + 1
      items.push({
        menuItemId: item.id,
        name: item.name,
        quantity,
        price: item.price,
        cost: item.cost,
      })
      subtotal += item.price * quantity
    }

    const taxes = Math.round(subtotal * 0.18) // 18% GST
    const fees = channel.includes("delivery") && !channel.includes("direct") ? Math.round(subtotal * 0.25) : 0
    const total = subtotal + taxes + fees

    orders.push({
      id: `ORD-${Date.now()}-${i}`,
      timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      channel,
      serverId: channel === "walk-in" || channel === "booking" ? `SRV-${Math.floor(Math.random() * 5) + 1}` : undefined,
      tableId: channel === "walk-in" || channel === "booking" ? `TBL-${Math.floor(Math.random() * 20) + 1}` : undefined,
      items,
      subtotal,
      taxes,
      fees,
      total,
      status: "completed",
      customerInfo: {
        id: Math.random() > 0.5 ? `CUST-${Math.floor(Math.random() * 100)}` : undefined,
        isRepeat: Math.random() > 0.6,
      },
    })
  }

  return orders
}

export async function GET(request: NextRequest) {
  try {
    // TODO: Replace with your actual API call
    // const orders = await yourPOSAPI.getOrders(...)

    const orders = generateMockOrders()

    return NextResponse.json({
      success: true,
      data: orders,
      count: orders.length,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
