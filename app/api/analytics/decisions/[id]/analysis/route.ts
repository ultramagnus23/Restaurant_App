import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import type { Decision } from "@/lib/types"

// Convert technical reasoning to owner-friendly language
function explainDecision(decision: Decision, context: any): string {
  const explanations: string[] = []
  
  if (decision.action === "Promote") {
    explanations.push(
      `Your "${decision.item}" dish is like a hidden gem - it makes you good money (₹${decision.impact.min.toLocaleString()} to ₹${decision.impact.max.toLocaleString()} potential monthly profit) but not many customers know about it yet.`
    )
    explanations.push(
      `Right now, it's only ordered ${context.currentOrders || "occasionally"} times, but each order gives you ₹${context.margin || 0} profit. If we can get more people to try it, you'll make significantly more money.`
    )
    explanations.push(
      `The recommendation is to run a promotion during slower hours (2-4pm) when your kitchen has capacity. This way, you're not overwhelming your staff during busy times, but you're still bringing in extra revenue.`
    )
    if (decision.risks.length > 0) {
      explanations.push(
        `The only risk is that some customers might order this instead of similar dishes, but that's actually fine because this one makes you more money anyway.`
      )
    }
  } else if (decision.action === "Reprice") {
    explanations.push(
      `Your "${decision.item}" is very popular - customers love it! But here's the thing: you're not making as much profit from it as you could be.`
    )
    explanations.push(
      `Right now, you're selling it for ₹${context.currentPrice || 0}, but you could increase the price by ₹${context.priceIncrease || 0} and still keep most of your customers. Even if 25% of customers decide not to order it anymore, you'll still make more money overall because the remaining customers are paying more.`
    )
    explanations.push(
      `This could add ₹${decision.impact.min.toLocaleString()} to ₹${decision.impact.max.toLocaleString()} to your monthly profit. The key is to do it gradually and watch how customers react.`
    )
  } else if (decision.action === "Remove") {
    explanations.push(
      `Your "${decision.item}" dish is taking up valuable kitchen time during your busiest hours, but it's not making you enough money to justify that.`
    )
    explanations.push(
      `It takes ${context.prepTime || 0} minutes to prepare, which means your kitchen could be making 2-3 other dishes in that same time. Those other dishes would make you more money.`
    )
    explanations.push(
      `By removing this dish, you free up kitchen capacity during peak hours, allowing you to serve more customers and make ₹${decision.impact.min.toLocaleString()} to ₹${decision.impact.max.toLocaleString()} more per month.`
    )
    explanations.push(
      `Don't worry - we can replace it with something faster to prepare that your customers will still love.`
    )
  } else if (decision.action === "Optimize") {
    if (decision.category === "Channel") {
      explanations.push(
        `You're currently using delivery apps like Zomato and Swiggy, which take a big cut (around 25%) of each order.`
      )
      explanations.push(
        `If you can get more customers to order directly from you (through your own website or phone), you keep that entire 25% as profit instead of giving it to the apps.`
      )
      explanations.push(
        `This could add ₹${decision.impact.min.toLocaleString()} to ₹${decision.impact.max.toLocaleString()} to your monthly profit. The way to do this is to offer incentives like loyalty points or small discounts for direct orders.`
      )
    } else {
      explanations.push(
        `During your busiest hours (6-9 PM), you're making much more money per table than during slower times.`
      )
      explanations.push(
        `By optimizing how you schedule staff and allocate tables during these peak hours, you can serve more customers and make ₹${decision.impact.min.toLocaleString()} to ₹${decision.impact.max.toLocaleString()} more per month.`
      )
    }
  }
  
  return explanations.join("\n\n")
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const decisionId = params.id
    
    // Re-generate decisions to get the current one (in production, you'd store decisions in DB)
    // For now, we'll use the same logic as the decisions route
    const orderCount = await prisma.order.count()
    if (orderCount === 0) {
      return NextResponse.json({ success: false, error: "No data available" }, { status: 404 })
    }

    // Get menu data
    const menuItems = await prisma.menuItem.findMany({
      include: {
        orderItems: {
          include: {
            order: true,
          },
        },
      },
    })

    const menuItemsWithCompletedOrders = menuItems.map((item) => ({
      ...item,
      orderItems: item.orderItems.filter((oi) => oi.order.status === "COMPLETED"),
    }))

    const totalOrders = menuItemsWithCompletedOrders.reduce(
      (sum, item) => sum + item.orderItems.reduce((s, oi) => s + oi.quantity, 0),
      0
    )
    const avgOrdersPerItem = totalOrders / (menuItemsWithCompletedOrders.length || 1)

    const menuData = menuItemsWithCompletedOrders.map((item) => {
      const orders = item.orderItems.reduce((sum, oi) => sum + oi.quantity, 0)
      const popularity = avgOrdersPerItem > 0
        ? Math.min(100, (orders / avgOrdersPerItem) * 50)
        : 0
      const margin = item.sellingPrice - item.costPrice
      const revenue = item.orderItems.reduce((sum, oi) => sum + oi.price * oi.quantity, 0)

      return {
        id: item.id,
        name: item.name,
        popularity,
        margin,
        revenue,
        orders,
        price: item.sellingPrice,
        cost: item.costPrice,
        prepTime: item.prepTime || 10,
      }
    })

    // Find the decision
    let decision: Decision | null = null
    
    for (const item of menuData) {
      if (item.popularity < 50 && item.margin >= 680) {
        const projectedIncrease = item.orders * 0.45
        const impact = projectedIncrease * item.margin
        const decId = `DEC-MENU-${item.id}`
        if (decId === decisionId) {
          decision = {
            id: decId,
            action: "Promote",
            item: item.name,
            category: "Menu",
            priority: item.margin > 1000 ? "high" : "medium",
            impact: {
              min: Math.round(impact * 0.7),
              max: Math.round(impact * 1.2),
              confidence: 75,
            },
            reason: `High contribution margin (₹${item.margin}) with low popularity (${item.popularity}%). Strategic promotion can increase volume without capacity strain.`,
            risks: ["May cannibalize similar items by 8-12%"],
            recommendation: `Run happy hour promotion 2-4pm with ₹${Math.round(item.price * 0.15)} off. Expected 45% volume increase.`,
            status: "pending",
            createdAt: new Date().toISOString(),
          }
          break
        }
      }
      
      if (item.popularity >= 50 && item.margin < 680 && item.margin > 0) {
        const priceIncrease = Math.round(item.price * 0.15)
        const volumeLoss = 0.25
        const newOrders = item.orders * (1 - volumeLoss)
        const newMargin = (item.price + priceIncrease) - item.cost
        const impact = (newOrders * newMargin) - (item.orders * item.margin)
        const decId = `DEC-PRICE-${item.id}`
        if (decId === decisionId) {
          decision = {
            id: decId,
            action: "Reprice",
            item: item.name,
            category: "Menu",
            priority: item.orders > 200 ? "high" : "medium",
            impact: {
              min: Math.round(impact * 0.8),
              max: Math.round(impact * 1.1),
              confidence: 70,
            },
            reason: `Popularity index of ${item.popularity}% but contribution margin only ₹${item.margin}. Price elasticity modeling suggests +₹${priceIncrease} increase maintains 70% of volume.`,
            risks: [`Could reduce orders by 25-30%`, "Competition pricing may be lower"],
            recommendation: `Increase price from ₹${item.price} to ₹${item.price + priceIncrease}. Monitor first week closely.`,
            status: "pending",
            createdAt: new Date().toISOString(),
          }
          break
        }
      }
      
      if (item.popularity < 50 && item.margin < 680 && item.prepTime > 15) {
        const opportunityCost = item.prepTime * item.orders * 2.3
        const impact = opportunityCost - (item.orders * item.margin)
        if (impact > 0) {
          const decId = `DEC-REMOVE-${item.id}`
          if (decId === decisionId) {
            decision = {
              id: decId,
              action: "Remove",
              item: item.name,
              category: "Menu",
              priority: "medium",
              impact: {
                min: Math.round(impact * 0.6),
                max: Math.round(impact * 1.4),
                confidence: 65,
              },
              reason: `Kitchen bottleneck: ${item.prepTime}-min prep time blocks ${Math.round(item.prepTime / 8)} other dishes during peak. Only ${item.orders} orders with ₹${item.margin} margin doesn't justify opportunity cost.`,
              risks: ["May disappoint regular customers"],
              recommendation: `Replace with ${Math.round(item.prepTime * 0.5)}-min prep dish. Free up ${Math.round(item.prepTime * item.orders)} min/week peak capacity.`,
              status: "pending",
              createdAt: new Date().toISOString(),
            }
            break
          }
        }
      }
    }
    
    if (!decision) {
      return NextResponse.json({ success: false, error: "Decision not found" }, { status: 404 })
    }
    
    // Get context data for the decision
    let context: any = {}
    
    if (decision.category === "Menu") {
      const menuItem = menuItems.find((m) => m.name === decision.item)
      
      if (menuItem) {
        const orders = menuItem.orderItems.filter((oi) => oi.order.status === "COMPLETED")
          .reduce((sum, oi) => sum + oi.quantity, 0)
        const margin = menuItem.sellingPrice - menuItem.costPrice
        
        context = {
          currentOrders: orders,
          currentPrice: menuItem.sellingPrice,
          margin: margin,
          prepTime: menuItem.prepTime || 10,
          priceIncrease: decision.action === "Reprice" ? Math.round(menuItem.sellingPrice * 0.15) : 0,
        }
      }
    }
    
    // Get historical impact data
    const historicalData = await prisma.scenario.findMany({
      where: {
        name: { contains: decision.item },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    })
    
    // Generate owner-friendly explanation
    const explanation = explainDecision(decision, context)
    
    // Calculate confidence based on data quality
    const dataQuality = orderCount > 100 ? "high" : orderCount > 50 ? "medium" : "low"
    
    return NextResponse.json({
      success: true,
      data: {
        decision,
        explanation,
        context,
        historicalData: historicalData.map((h) => ({
          name: h.name,
          projectedRevenue: h.projectedRevenue,
          revenueDelta: h.revenueDelta,
          createdAt: h.createdAt,
        })),
        dataQuality,
        confidence: decision.impact.confidence,
        nextSteps: [
          decision.action === "Promote" ? "Create promotional materials" :
          decision.action === "Reprice" ? "Update menu prices gradually" :
          decision.action === "Remove" ? "Identify replacement dish" :
          "Review operational changes",
          "Monitor customer feedback",
          "Track revenue impact weekly",
        ],
      },
    })
  } catch (error: any) {
    console.error("Error generating analysis:", error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || "Failed to generate analysis" 
    }, { status: 500 })
  }
}
