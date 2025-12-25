"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
// Keep your existing sub-components
import { DecisionEngine } from "@/components/decision-engine"
import { MenuEngineering } from "@/components/menu-engineering"
import { ChannelAnalysis } from "@/components/channel-analysis"
import { ServerPerformance } from "@/components/server-performance"
import { TimeCapacity } from "@/components/time-capacity"
import { ScenarioSimulator } from "@/components/scenario-simulator"
import { CurrencySelector } from "@/components/currency-selector"
// UI Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MetricCard } from "@/components/MetricCard" // Ensure this component exists or use simple Cards
import { Upload, Loader2, BarChart3, UtensilsCrossed, Users, Clock, Zap, ArrowUp, ArrowDown } from "lucide-react"

export default function Dashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  
  // State for the new Engine Data
  const [stats, setStats] = useState<any>(null)
  const [insights, setInsights] = useState<any>(null)
  const [decisions, setDecisions] = useState<any[]>([])

  useEffect(() => {
    checkDataAndLoad()
    
    const interval = setInterval(() => checkDataAndLoad(), 120000)
    
    const handleStorageChange = () => checkDataAndLoad()
    window.addEventListener("storage", handleStorageChange)
    
    const handleFocus = () => checkDataAndLoad()
    window.addEventListener("focus", handleFocus)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener("storage", handleStorageChange)
      window.removeEventListener("focus", handleFocus)
    }
  }, [])

  async function checkDataAndLoad() {
    try {
      setLoading(true)
      // Call the API route we created in Step 1
      const res = await fetch("/api/analytics/dashboard")
      const json = await res.json()
      
      if (json.success && json.data.dailyStats.totalOrders > 0) {
        setHasData(true)
        setStats(json.data.dailyStats)
        setInsights(json.data.revenueAnalysis)
        setDecisions(json.data.pendingDecisions)
        setLastUpdated(new Date())
      } else {
        setHasData(false)
      }
    } catch (error) {
      console.error("Error checking data:", error)
      setHasData(false)
    } finally {
      setLoading(false)
    }
  }

  const formatLastUpdated = () => {
    if (!lastUpdated) return "Just now"
    const diff = Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
    if (diff < 60) return `${diff} sec${diff !== 1 ? "s" : ""} ago`
    const minutes = Math.floor(diff / 60)
    if (minutes < 60) return `${minutes} min${minutes !== 1 ? "s" : ""} ago`
    const hours = Math.floor(minutes / 60)
    return `${hours} hour${hours !== 1 ? "s" : ""} ago`
  }

  if (loading && !hasData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!hasData && !loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">No Data Available</CardTitle>
            <CardDescription>
              Upload a CSV file to start analyzing your restaurant data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={() => router.push("/upload")} 
              className="w-full gap-2"
              size="lg"
            >
              <Upload className="h-4 w-4" />
              Upload CSV File
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              CSV should include: posOrderId, order_time, channel, menu_item, category, quantity, price
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Restaurant Intelligence</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Profit-aware operational decisions
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-sm">
                <div className="font-medium">Demo Restaurant</div>
                <div className="text-muted-foreground">Last updated: {formatLastUpdated()}</div>
              </div>
              <CurrencySelector />
              <Button 
                onClick={() => router.push("/upload")} 
                variant="outline" 
                size="sm"
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Upload
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8 space-y-8">
        
        {/* 1. TOP METRICS GRID (From Engines) */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">₹{stats.totalRevenue?.toFixed(2)}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Orders Today</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.totalOrders}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">₹{stats.avgOrderValue?.toFixed(2)}</div>
                </CardContent>
            </Card>
          </div>
        )}

        {/* 2. AI INSIGHTS SECTION (From Engines) */}
        {insights && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-black-50 border-blue-200">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            📊 Revenue Analysis (vs Last 7 Days)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-2 mb-2">
                            <span className={`text-3xl font-bold ${insights.revenueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {insights.revenueChange >= 0 ? '+' : ''}{insights.revenueChangePct?.toFixed(1)}%
                            </span>
                            <span className="text-sm text-gray-600">
                                (₹{Math.abs(insights.revenueChange || 0).toFixed(0)})
                            </span>
                        </div>
                        <p className="text-sm text-gray-700 italic border-l-4 border-blue-300 pl-3 py-1">
                            "{insights.explanation}"
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                            <div className="flex flex-col">
                                <span className="text-gray-500">Volume Impact</span>
                                <span className={insights.decomposition?.volumeEffect >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                    ₹{insights.decomposition?.volumeEffect?.toFixed(0)}
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-gray-500">Price Impact</span>
                                <span className={insights.decomposition?.priceEffect >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                    ₹{insights.decomposition?.priceEffect?.toFixed(0)}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Pending Recommendations Summary */}
                <Card className="bg-black-50 border-blue-200">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2 text-blue-900">
                            🤖 Latest AI Recommendations
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {decisions && decisions.length > 0 ? (
                            <ul className="space-y-3">
                                {decisions.slice(0, 3).map((d: any) => (
                                    <li key={d.id} className="bg-white p-3 rounded border border-blue-100 shadow-sm">
                                        <div className="font-bold text-blue-800 text-sm">{d.recommendation}</div>
                                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">{d.rationale}</div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500">No pending recommendations at this moment.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        )}

        {/* 3. ORIGINAL TABS */}
        <Tabs defaultValue="decisions" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 h-12">
            <TabsTrigger value="decisions" className="gap-2">
              <Zap className="h-4 w-4" />
              Decisions
            </TabsTrigger>
            <TabsTrigger value="menu" className="gap-2">
              <UtensilsCrossed className="h-4 w-4" />
              Menu
            </TabsTrigger>
            <TabsTrigger value="capacity" className="gap-2">
              <Clock className="h-4 w-4" />
              Capacity
            </TabsTrigger>
            <TabsTrigger value="channels" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Channels
            </TabsTrigger>
            <TabsTrigger value="servers" className="gap-2">
              <Users className="h-4 w-4" />
              Servers
            </TabsTrigger>
            <TabsTrigger value="simulator" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Simulator
            </TabsTrigger>
          </TabsList>

          <TabsContent value="decisions" className="space-y-6">
            {/* We pass the fetched decisions to the component if it accepts props, 
                otherwise it renders as is */}
            <DecisionEngine />
          </TabsContent>

          <TabsContent value="menu" className="space-y-6">
            <MenuEngineering items={[]} />
          </TabsContent>

          <TabsContent value="capacity" className="space-y-6">
            <TimeCapacity />
          </TabsContent>

          <TabsContent value="channels" className="space-y-6">
            <ChannelAnalysis />
          </TabsContent>

          <TabsContent value="servers" className="space-y-6">
            <ServerPerformance />
          </TabsContent>

          <TabsContent value="simulator" className="space-y-6">
            <ScenarioSimulator />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}