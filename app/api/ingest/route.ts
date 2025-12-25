import prisma from "@/lib/prisma"
import Papa from "papaparse"

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File

    if (!file) {
      return Response.json({ success: false, error: "No file uploaded" }, { status: 400 })
    }

    const text = await file.text()

    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    })

    const rows = parsed.data as any[]

    if (!rows || rows.length === 0) {
      return Response.json({ success: false, error: "CSV file is empty or invalid" }, { status: 400 })
    }

    // Validate required columns
    const requiredColumns = ["posOrderId", "order_time", "channel", "menu_item", "category", "quantity", "price"]
    const firstRow = rows[0]
    const missingColumns = requiredColumns.filter(col => !(col in firstRow))
    
    if (missingColumns.length > 0) {
      return Response.json({ 
        success: false, 
        error: `Missing required columns: ${missingColumns.join(", ")}` 
      }, { status: 400 })
    }

    // Group rows by POS Order ID
    const ordersMap = new Map<string, any[]>()

    for (const row of rows) {
      const posOrderId = row.posOrderId?.toString().trim()
      if (!posOrderId) continue // Skip rows without order ID
      
      if (!ordersMap.has(posOrderId)) {
        ordersMap.set(posOrderId, [])
      }
      ordersMap.get(posOrderId)!.push(row)
    }

    let ordersCreated = 0
    let ordersSkipped = 0
    let errors: string[] = []

    for (const [posOrderId, items] of ordersMap.entries()) {
      try {
        // Skip duplicate uploads
        const existing = await prisma.order.findUnique({
          where: { posOrderId },
        })
        if (existing) {
          ordersSkipped++
          continue
        }

        const orderItemsData = []

        for (const item of items) {
          try {
            const menuItemName = item.menu_item?.toString().trim()
            const category = item.category?.toString().trim() || "main"
            const price = parseFloat(item.price) || 0
            const quantity = parseInt(item.quantity) || 1

            if (!menuItemName || price <= 0) {
              continue // Skip invalid items
            }

            // Ensure MenuItem exists
            let menuItem = await prisma.menuItem.findFirst({
              where: { name: menuItemName },
            })

            if (!menuItem) {
              menuItem = await prisma.menuItem.create({
                data: {
                  name: menuItemName,
                  category: category,
                  costPrice: price * 0.4, // Assume 40% cost
                  sellingPrice: price,
                  launchDate: new Date(),
                  prepTime: 10,
                  active: true,
                } as any,
              })
            }

            orderItemsData.push({
              quantity: quantity,
              price: price,
              menuItemId: menuItem.id,
            })
          } catch (itemError: any) {
            errors.push(`Error processing item ${item.menu_item}: ${itemError.message}`)
          }
        }

        if (orderItemsData.length === 0) {
          continue // Skip orders with no valid items
        }

        const totalAmount = orderItemsData.reduce(
          (sum, i) => sum + i.price * i.quantity,
          0
        )

        const orderTime = items[0].order_time
        const timestamp = orderTime ? new Date(orderTime) : new Date()
        const channel = items[0].channel?.toString().trim() || "walk-in"
        const serverName = items[0].server_name || items[0].server || null

        // Create or find server if server name is provided
        let serverId: string | undefined = undefined
        if (serverName) {
          let server = await prisma.server.findFirst({
            where: { name: serverName.toString().trim() },
          })
          
          if (!server) {
            server = await prisma.server.create({
              data: {
                name: serverName.toString().trim(),
              },
            })
          }
          serverId = server.id
        }

        await prisma.order.create({
          data: {
            posOrderId,
            timestamp,
            channel,
            totalAmount,
            status: "COMPLETED",
            serverId,
            items: {
              create: orderItemsData,
            },
          },
        })

        ordersCreated++
      } catch (orderError: any) {
        errors.push(`Error processing order ${posOrderId}: ${orderError.message}`)
      }
    }

    return Response.json({ 
      success: true, 
      message: `Successfully imported ${ordersCreated} orders. ${ordersSkipped} duplicates skipped.`,
      ordersCreated,
      ordersSkipped,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error: any) {
    console.error("CSV ingest error:", error)
    return Response.json({ 
      success: false, 
      error: error.message || "Failed to process CSV file" 
    }, { status: 500 })
  }
}
