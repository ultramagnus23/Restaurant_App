import { PrismaClient } from '@prisma/client';
import { format, startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, differenceInDays } from 'date-fns';

export class ComputationEngine {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Orchestrator: Recomputes everything needed after data ingestion.
   */
  async recomputeAll(restaurantId: number, affectedDate?: Date): Promise<void> {
    const date = affectedDate || new Date();
    console.log(`[ComputationEngine] Starting recompute for Restaurant ${restaurantId} on ${format(date, 'yyyy-MM-dd')}`);

    try {
      // 1. Time Aggregates (Day, Week, Month)
      await this.recomputeTimeAggregates(restaurantId, date);

      // 2. Item Baselines (Statistical Norms)
      await this.recomputeBaselines(restaurantId, date);

      // 3. Insight Generation (Detect Anomalies)
      await this.generateInsights(restaurantId);
      
      console.log(`[ComputationEngine] Recompute complete.`);
    } catch (error) {
      console.error(`[ComputationEngine] Critical Error:`, error);
      throw error;
    }
  }

  // --- TIME AGGREGATION LOGIC ---

  private async recomputeTimeAggregates(restaurantId: number, date: Date): Promise<void> {
    await this.computeDailyAggregate(restaurantId, date);
    
    // Check if we need to update weekly/monthly
    const isSunday = date.getDay() === 0;
    const isMonthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() === date.getDate();

    if (isSunday) await this.computeWeeklyAggregate(restaurantId, date);
    if (isMonthEnd) await this.computeMonthlyAggregate(restaurantId, date);
  }

  private async computeDailyAggregate(restaurantId: number, date: Date): Promise<void> {
    const periodStart = startOfDay(date);
    const periodEnd = endOfDay(date);

    // Fetch Full Order Data
    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        timestamp: { gte: periodStart, lte: periodEnd },
      },
      include: { orderItems: true }
    });

    if (orders.length === 0) return;

    // Calculation
    const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalItems = orders.reduce((sum, o) => sum + o.orderItems.length, 0);
    
    // Unique items set
    const uniqueItemIds = new Set<string>();
    orders.forEach(o => o.orderItems.forEach(i => uniqueItemIds.add(i.menuItemId)));
    const uniqueItems = uniqueItemIds.size;

    // Versioning
    const existing = await this.prisma.timeAggregate.findFirst({
      where: { restaurantId, periodType: 'day', periodStart },
      orderBy: { version: 'desc' }
    });
    const version = (existing?.version || 0) + 1;

    // Upsert Aggregate
    await this.prisma.timeAggregate.create({
      data: {
        restaurantId,
        periodType: 'day',
        periodStart,
        periodEnd,
        totalRevenue,
        totalOrders,
        avgOrderValue,
        totalItems,
        uniqueItems,
        hourOfDay: null,
        dayOfWeek: date.getDay(),
        version
      }
    });
    console.log(`[Aggregate] Computed Day: ${format(date, 'yyyy-MM-dd')} (v${version})`);
  }

  private async computeWeeklyAggregate(restaurantId: number, date: Date): Promise<void> {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfDay(date);

    // Aggregate from daily aggregates (Optimization)
    const dailyAggs = await this.prisma.timeAggregate.findMany({
      where: {
        restaurantId,
        periodType: 'day',
        periodStart: { gte: start, lte: end }
      },
      distinct: ['periodStart'],
      orderBy: { version: 'desc' }
    });

    if (dailyAggs.length === 0) return;

    const totalRevenue = dailyAggs.reduce((sum, d) => sum + d.totalRevenue, 0);
    const totalOrders = dailyAggs.reduce((sum, d) => sum + d.totalOrders, 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const existing = await this.prisma.timeAggregate.findFirst({
      where: { restaurantId, periodType: 'week', periodStart: start },
      orderBy: { version: 'desc' }
    });
    const version = (existing?.version || 0) + 1;

    await this.prisma.timeAggregate.create({
      data: {
        restaurantId,
        periodType: 'week',
        periodStart: start,
        periodEnd: end,
        totalRevenue,
        totalOrders,
        avgOrderValue,
        totalItems: 0, 
        uniqueItems: 0,
        version
      }
    });
  }

  private async computeMonthlyAggregate(restaurantId: number, date: Date): Promise<void> {
    const start = startOfMonth(date);
    const end = endOfDay(date);

    const dailyAggs = await this.prisma.timeAggregate.findMany({
      where: { restaurantId, periodType: 'day', periodStart: { gte: start, lte: end } },
      distinct: ['periodStart'],
      orderBy: { version: 'desc' }
    });

    if (dailyAggs.length === 0) return;

    const totalRevenue = dailyAggs.reduce((sum, d) => sum + d.totalRevenue, 0);
    const totalOrders = dailyAggs.reduce((sum, d) => sum + d.totalOrders, 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const existing = await this.prisma.timeAggregate.findFirst({
      where: { restaurantId, periodType: 'month', periodStart: start },
      orderBy: { version: 'desc' }
    });
    const version = (existing?.version || 0) + 1;

    await this.prisma.timeAggregate.create({
      data: {
        restaurantId,
        periodType: 'month',
        periodStart: start,
        periodEnd: end,
        totalRevenue,
        totalOrders,
        avgOrderValue,
        totalItems: 0,
        uniqueItems: 0,
        version
      }
    });
  }

  // --- BASELINE AGGREGATION LOGIC ---

  private async recomputeBaselines(restaurantId: number, date: Date): Promise<void> {
    const menuItems = await this.prisma.menuItem.findMany({
      where: { restaurantId, isActive: true }
    });

    console.log(`[Baselines] Processing ${menuItems.length} active items...`);
    for (const item of menuItems) {
      await this.computeItemBaseline(item.id, 30); // 30-day rolling window
    }
  }

  async computeItemBaseline(menuItemId: string, lookbackDays: number = 30): Promise<void> {
    const endDate = new Date();
    const startDate = subDays(endDate, lookbackDays);

    // Advanced Raw Query: Gets Quantity, Revenue, and Price Points
    const dailyData = await this.prisma.$queryRaw<Array<{
      sale_date: string;
      daily_qty: number;
      daily_rev: number;
      avg_price: number;
    }>>`
      SELECT 
        DATE(o.timestamp) as sale_date,
        SUM(oi.quantity) as daily_qty,
        SUM(oi.quantity * oi.priceAtTime) as daily_rev,
        AVG(oi.priceAtTime) as avg_price
      FROM OrderItem oi
      JOIN "Order" o ON oi.orderId = o.id
      WHERE oi.menuItemId = ${menuItemId}
        AND o.timestamp >= ${startDate}
      GROUP BY DATE(o.timestamp)
      ORDER BY sale_date ASC
    `;

    if (!dailyData || dailyData.length < 5) return; // Need minimum data points

    // Cleanse Data (Convert BigInt/Strings to Numbers)
    const cleanData = dailyData.map(d => ({
      qty: Number(d.daily_qty),
      rev: Number(d.daily_rev),
      price: Number(d.avg_price)
    }));

    const quantities = cleanData.map(d => d.qty);
    const revenues = cleanData.map(d => d.rev);

    // Statistical Measures
    const avgQty = this.mean(quantities);
    const stdQty = this.stdDev(quantities);
    const avgRev = this.mean(revenues);
    const stdRev = this.stdDev(revenues);

    // Advanced Metrics
    const elasticity = this.estimatePriceElasticity(cleanData);
    const seasonality = this.estimateSeasonality(cleanData);
    
    // Confidence Score (Based on Variance and Sample Size)
    const cv = avgQty > 0 ? stdQty / avgQty : 1;
    const confidence = Math.max(0, (1 - cv) * Math.min(1, cleanData.length / 30));

    // Persist Baseline
    const existing = await this.prisma.itemBaseline.findFirst({
      where: { menuItemId, periodEnd: endDate },
      orderBy: { version: 'desc' }
    });
    const version = (existing?.version || 0) + 1;

    await this.prisma.itemBaseline.create({
      data: {
        menuItemId,
        periodStart: startDate,
        periodEnd: endDate,
        avgDailyQuantity: avgQty,
        stdDevQuantity: stdQty,
        avgDailyRevenue: avgRev,
        stdDevRevenue: stdRev,
        priceElasticity: elasticity,
        seasonalityIndex: seasonality,
        sampleSize: cleanData.length,
        confidenceScore: confidence,
        version
      }
    });
  }

  // --- STATISTICAL HELPERS ---

  private estimatePriceElasticity(data: any[]): number | null {
    // Calculates Price Elasticity of Demand (PED)
    // Formula: % Change in Qty / % Change in Price
    let sumElasticity = 0;
    let count = 0;

    for (let i = 1; i < data.length; i++) {
      const prev = data[i-1];
      const curr = data[i];

      if (prev.price === 0 || prev.qty === 0) continue;

      const pctChangePrice = (curr.price - prev.price) / prev.price;
      const pctChangeQty = (curr.qty - prev.qty) / prev.qty;

      // Only consider significant price changes (> 2%) to avoid noise
      if (Math.abs(pctChangePrice) > 0.02) {
        const e = pctChangeQty / pctChangePrice;
        // Filter extreme outliers
        if (e > -10 && e < 10) {
          sumElasticity += e;
          count++;
        }
      }
    }
    return count > 0 ? sumElasticity / count : null;
  }

  private estimateSeasonality(data: any[]): number {
    // Detects weekend spikes (Fri/Sat/Sun vs Weekdays)
    // Returns a multiplier index (e.g., 1.2 means weekends are 20% higher)
    // NOTE: This assumes 'data' is sorted by date and we can infer day of week if needed
    // For simplicity in this engine, we return a placeholder 1.0 or simple variance
    return 1.0; 
  }

  private async generateInsights(restaurantId: number): Promise<void> {
    // Placeholder for Insight Generation Logic
    // In a full system, this would compare Current Daily Aggregate vs Baselines
    // and create 'Insight' records if deviation > 2 Standard Deviations.
    // console.log("Insight generation skipped for brevity.");
  }

  private mean(arr: number[]): number {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  private stdDev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const avg = this.mean(arr);
    const sumSqDiff = arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0);
    return Math.sqrt(sumSqDiff / arr.length);
  }
}
