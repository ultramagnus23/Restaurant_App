// Currency types
export type Currency = "INR" | "USD" | "EUR" | "GBP" | "AUD" | "CAD" | "SGD" | "AED"

export interface CurrencyRate {
  code: Currency
  symbol: string
  rate: number // Rate relative to INR (base currency)
  name: string
}

// Menu Item models
export interface MenuItem {
  id: string
  name: string
  category: "appetizer" | "main" | "dessert" | "beverage"
  price: number // In INR
  cost: number // In INR
  prepTime: number // minutes
  popularity: number // 0-100
  orders: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface MenuEngineering extends MenuItem {
  engineeringCategory: "Stars" | "Plowhorses" | "Puzzles" | "Dogs"
  margin: number
  revenue: number
  cannibalization: number
  revenuePerMinute: number
}

// Order models
export interface Order {
  id: string
  timestamp: string
  channel: "walk-in" | "booking" | "delivery-direct" | "delivery-zomato" | "delivery-swiggy" | "delivery-doordash"
  serverId?: string
  tableId?: string
  items: OrderItem[]
  subtotal: number // In INR
  taxes: number // In INR
  fees: number // In INR (platform fees for delivery)
  total: number // In INR
  status: "pending" | "preparing" | "ready" | "completed" | "cancelled"
  customerInfo?: {
    id?: string
    name?: string
    phone?: string
    email?: string
    isRepeat: boolean
  }
}

export interface OrderItem {
  menuItemId: string
  name: string
  quantity: number
  price: number // In INR
  cost: number // In INR
}

// Server performance models
export interface Server {
  id: string
  name: string
  active: boolean
  hireDate: string
}

export interface ServerPerformance extends Server {
  totalOrders: number
  totalRevenue: number
  avgCheckSize: number
  upsellRate: number
  avgServiceTime: number
  effectivenessScore: number
  shiftsWorked: number
  hoursWorked: number
}

// Channel models
export interface ChannelMetrics {
  channel: Order["channel"]
  totalOrders: number
  totalRevenue: number
  grossMargin: number
  platformFees: number
  netMargin: number
  netMarginPercent: number
  avgOrderValue: number
  customerAcquisitionCost: number
  repeatRate: number
  lifetimeValue: number
  ltvCacRatio: number
}

// Capacity models
export interface TimeSlot {
  hour: number
  dayPart: "breakfast" | "lunch" | "dinner" | "late-night"
  orders: number
  revenue: number
  capacity: number
  utilizationPercent: number
  avgTableTurnover: number
  revPASH: number
}

export interface TableMetrics {
  size: 2 | 4 | 6 | 8
  count: number
  totalSeats: number
  avgUtilization: number
  avgRevenue: number
  revenuePerSeat: number
}

// Decision engine models
export interface Decision {
  id: string
  action: "Promote" | "Reprice" | "Remove" | "Optimize" | "Redesign"
  item: string
  category: "Menu" | "Channel" | "Operations" | "Capacity"
  priority: "high" | "medium" | "low"
  impact: {
    min: number // In INR
    max: number // In INR
    confidence: number // 0-100
  }
  reason: string
  risks: string[]
  recommendation: string
  status: "pending" | "implementing" | "completed" | "dismissed"
  createdAt: string
  implementedAt?: string
}

// Scenario simulation models
export interface Scenario {
  id: string
  name: string
  description: string
  changes: ScenarioChange[]
  projectedImpact: {
    revenue: { current: number; projected: number; change: number; changePercent: number }
    margin: { current: number; projected: number; change: number; changePercent: number }
    orders: { current: number; projected: number; change: number; changePercent: number }
  }
  confidence: number
  risks: string[]
  createdAt: string
}

export interface ScenarioChange {
  type: "menu_price" | "menu_remove" | "menu_add" | "channel_mix" | "staffing" | "hours"
  target: string
  value: any
  description: string
}

// Analytics aggregation models
export interface Analytics {
  period: "day" | "week" | "month" | "quarter" | "year"
  startDate: string
  endDate: string
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  grossMargin: number
  netMargin: number
  topItems: Array<{ itemId: string; name: string; revenue: number; orders: number }>
  topServers: Array<{ serverId: string; name: string; revenue: number; orders: number }>
  channelBreakdown: ChannelMetrics[]
}
