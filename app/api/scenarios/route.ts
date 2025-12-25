import { NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { runSimulation } from "@/lib/simulation-engine"

const scenarioSchema = z.object({
  name: z.string().min(1),
  priceChangePercent: z.number().optional(),
  overrideElasticity: z.number().optional(),
  menuItemId: z.string().optional(),
  channelMix: z.record(z.number()).optional(),
  staffingChanges: z.object({
    serverId: z.string().optional(),
    hoursChange: z.number().optional(),
  }).optional(),
  hoursChanges: z.object({
    openHour: z.number().optional(),
    closeHour: z.number().optional(),
  }).optional(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const validatedData = scenarioSchema.parse(body)

    // Run the simulation
    const simulationResults = await runSimulation({
      priceChangePercent: validatedData.priceChangePercent,
      overrideElasticity: validatedData.overrideElasticity,
      menuItemId: validatedData.menuItemId,
      channelMix: validatedData.channelMix,
      staffingChanges: validatedData.staffingChanges,
      hoursChanges: validatedData.hoursChanges,
    })

    // Get baseline for comparison
    const orders = await prisma.order.findMany({
      where: { status: "COMPLETED" },
    })
    const baselineRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0)
    const baselineOrders = orders.length

    // Save to DB
    const savedScenario = await prisma.scenario.create({
      data: {
        name: validatedData.name,
        priceChangePercent: validatedData.priceChangePercent || 0,
        overrideElasticity: validatedData.overrideElasticity,
        projectedRevenue: simulationResults.projected, 
        projectedProfit: simulationResults.projectedProfit,
        revenueDelta: simulationResults.delta,
      },
    })

    return NextResponse.json({
      success: true,
      scenario: savedScenario,
      results: {
        ...simulationResults,
        baseline: {
          revenue: baselineRevenue,
          orders: baselineOrders,
        },
      },
    })
  } catch (error: any) {
    console.error("Error creating scenario:", error)
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const scenarios = await prisma.scenario.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 50, // Limit to last 50 scenarios
    })

    return NextResponse.json({
      success: true,
      data: scenarios,
    })
  } catch (error: any) {
    console.error("Error fetching scenarios:", error)
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 })
  }
}
