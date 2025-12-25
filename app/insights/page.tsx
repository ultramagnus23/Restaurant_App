"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, TrendingUp, TrendingDown, AlertCircle, CheckCircle, DollarSign, Users, Clock } from "lucide-react"
import { useCurrency } from "@/lib/hooks/use-currency"
import { api } from "@/lib/api-client"

interface DashboardSnapshot {
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  topItems: Array<{ name: string; revenue: number; orders: number }>
  topChannels: Array<{ channel: string; revenue: number; margin: number }>
  keyInsights: string[]
}

export default function OwnerInsightsPage() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const { format } = useCurrency()

  useEffect(() => {
    loadInsights()
  }, [])

  async function loadInsights() {
    try {
      setLoading(true)
      
      // Fetch all data
      const [dashboardRes, menuRes, channelsRes, decisionsRes] = await Promise.all([
        fetch("/api/analytics/dashboard"),
        api.getMenuEngineering(),
        api.getChannelMetrics(),
        api.getDecisions(),
      ])

      const dashboard = await dashboardRes.json()
      const menu = menuRes.success ? menuRes.data : []
      const channels = channelsRes.success ? channelsRes.data : []
      const decisions = decisionsRes.success ? decisionsRes.data : []

      // Generate insights
      const insights: string[] = []
      
      if (dashboard.success) {
        const topMenuItems = menu
          .sort((a: any, b: any) => b.revenue - a.revenue)
          .slice(0, 3)
          .map((item: any) => ({
            name: item.name,
            revenue: item.revenue,
            orders: item.orders,
          }))

        const topChannels = channels
          .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
          .slice(0, 3)
          .map((ch: any) => ({
            channel: ch.channel,
            revenue: ch.totalRevenue,
            margin: ch.netMargin,
          }))

        // Generate key insights
        if (decisions.length > 0) {
          const highPriorityDecisions = decisions.filter((d: any) => d.priority === "high")
          if (highPriorityDecisions.length > 0) {
            insights.push(`You have ${highPriorityDecisions.length} high-priority opportunities that could add ₹${highPriorityDecisions.reduce((sum: number, d: any) => sum + d.impact.min, 0).toLocaleString()} to ₹${highPriorityDecisions.reduce((sum: number, d: any) => sum + d.impact.max, 0).toLocaleString()} to your monthly profit.`)
          }
        }

        const lowMarginChannels = channels.filter((ch: any) => ch.netMarginPercent < 30)
        if (lowMarginChannels.length > 0) {
          insights.push(`${lowMarginChannels.length} of your sales channels have low profit margins (under 30%). Consider shifting customers to higher-margin channels.`)
        }

        const puzzleItems = menu.filter((item: any) => item.engineeringCategory === "Puzzles")
        if (puzzleItems.length > 0) {
          insights.push(`You have ${puzzleItems.length} menu items that are profitable but not popular. Promoting these could significantly increase revenue.`)
        }

        setSnapshot({
          totalRevenue: dashboard.data.totalRevenue,
          totalOrders: dashboard.data.totalOrders,
          avgOrderValue: dashboard.data.avgOrderValue,
          topItems: topMenuItems,
          topChannels,
          keyInsights: insights,
        })
      }
    } catch (error) {
      console.error("Error loading insights:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="container mx-auto px-6 py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No data available. Upload CSV to see insights.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Owner Insights</h1>
        <p className="text-muted-foreground mt-2">
          A simple overview of what's happening in your restaurant
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Revenue</CardDescription>
            <CardTitle className="text-3xl text-primary">{format(snapshot.totalRevenue)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">From {snapshot.totalOrders} orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Average Order Value</CardDescription>
            <CardTitle className="text-3xl text-accent">{format(snapshot.avgOrderValue)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Per customer order</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Top Performing Items</CardDescription>
            <CardTitle className="text-3xl text-foreground">{snapshot.topItems.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Menu items driving revenue</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Menu Items</CardTitle>
            <CardDescription>Your best-selling items by revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {snapshot.topItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">{item.orders} orders</p>
                  </div>
                  <p className="font-semibold text-primary">{format(item.revenue)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Sales Channels</CardTitle>
            <CardDescription>Where your revenue comes from</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {snapshot.topChannels.map((channel, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <div>
                    <p className="font-medium capitalize">{channel.channel.replace("-", " ")}</p>
                    <p className="text-sm text-muted-foreground">Net margin: {format(channel.margin)}</p>
                  </div>
                  <p className="font-semibold text-primary">{format(channel.revenue)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {snapshot.keyInsights.length > 0 && (
        <Card className="mt-6 border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              Key Insights
            </CardTitle>
            <CardDescription>Important things you should know</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {snapshot.keyInsights.map((insight, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

