import { PrismaClient } from '@prisma/client';
import { subDays, format } from 'date-fns';

interface DecomposedInsight {
  observation: string;
  explanation: string;
  causalFactors: Array<{
    factor: string;
    contribution: number;
    contributionPct: number;
    direction: 'positive' | 'negative';
  }>;
  formula: string;
  assumptions: string[];
  sampleSize: number;
  confidenceScore: number;
  recommendation?: string;
  metadata?: {
    currentValue: number;
    previousValue: number;
    absoluteChange: number;
    percentChange: number;
  };
}

export class ExplainableInsightEngine {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Generate comprehensive revenue change insight with full mathematical decomposition
   */
  async analyzeRevenueChange(
    restaurantId: number,
    currentPeriodDays: number = 7
  ): Promise<DecomposedInsight | null> {
    const today = new Date();
    const currentStart = subDays(today, currentPeriodDays);
    const comparisonStart = subDays(currentStart, currentPeriodDays);

    // Get current period orders
    const currentOrders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        timestamp: { gte: currentStart, lte: today },
      },
      include: { 
        orderItems: {
          include: { menuItem: true }
        } 
      },
    });

    // Get comparison period orders
    const comparisonOrders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        timestamp: { gte: comparisonStart, lt: currentStart },
      },
      include: { 
        orderItems: {
          include: { menuItem: true }
        } 
      },
    });

    if (currentOrders.length === 0 || comparisonOrders.length === 0) {
      console.log('[ExplainableInsightEngine] Insufficient data for revenue analysis');
      return null;
    }

    const currentRevenue = currentOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const comparisonRevenue = comparisonOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const revenueChange = currentRevenue - comparisonRevenue;
    const revenueChangePct = comparisonRevenue !== 0 ? (revenueChange / comparisonRevenue) * 100 : 0;

    console.log(`[ExplainableInsightEngine] Revenue change: ${revenueChangePct.toFixed(2)}%`);

    const decomposition = await this.decomposeRevenueChange(
      currentOrders,
      comparisonOrders,
      revenueChange
    );

    const causalFactors = decomposition.factors
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    const explanation = this.generateRevenueExplanation(
      causalFactors,
      revenueChangePct,
      currentRevenue,
      comparisonRevenue
    );

    const sampleSize = currentOrders.length + comparisonOrders.length;
    const confidenceScore = this.calculateConfidenceScore(
      sampleSize,
      currentOrders.length,
      comparisonOrders.length
    );

    const recommendation = this.generateRecommendation(
      causalFactors,
      revenueChangePct,
      currentOrders,
      comparisonOrders
    );

    const insight: DecomposedInsight = {
      observation: `Revenue ${revenueChangePct > 0 ? 'increased' : 'decreased'} by ${Math.abs(revenueChangePct).toFixed(1)}% (₹${Math.abs(revenueChange).toFixed(0)}) compared to the previous ${currentPeriodDays} days.`,
      explanation,
      causalFactors,
      formula: decomposition.formula,
      assumptions: decomposition.assumptions,
      sampleSize,
      confidenceScore,
      recommendation: recommendation || undefined,
      metadata: {
        currentValue: currentRevenue,
        previousValue: comparisonRevenue,
        absoluteChange: revenueChange,
        percentChange: revenueChangePct,
      },
    };

    await this.storeInsight(restaurantId, insight);

    return insight;
  }

  private async decomposeRevenueChange(
    currentOrders: any[],
    comparisonOrders: any[],
    totalRevenueChange: number
  ): Promise<{
    factors: Array<{
      factor: string;
      contribution: number;
      contributionPct: number;
      direction: 'positive' | 'negative';
    }>;
    formula: string;
    assumptions: string[];
  }> {
    const currentItems = this.aggregateItemData(currentOrders);
    const comparisonItems = this.aggregateItemData(comparisonOrders);

    const allItemIds = new Set([
      ...Array.from(currentItems.keys()),
      ...Array.from(comparisonItems.keys()),
    ]);

    let volumeEffect = 0;
    for (const itemId of allItemIds) {
      const curr = currentItems.get(itemId);
      const comp = comparisonItems.get(itemId);

      if (comp) {
        const qtyChange = (curr?.qty || 0) - comp.qty;
        volumeEffect += qtyChange * comp.avgPrice;
      }
    }

    let priceEffect = 0;
    for (const itemId of allItemIds) {
      const curr = currentItems.get(itemId);
      const comp = comparisonItems.get(itemId);

      if (curr && comp) {
        const priceChange = curr.avgPrice - comp.avgPrice;
        priceEffect += curr.qty * priceChange;
      }
    }

    const mixEffect = totalRevenueChange - volumeEffect - priceEffect;

    const absTotal = Math.abs(totalRevenueChange);
    const volumePct = absTotal > 0 ? (volumeEffect / absTotal) * 100 : 0;
    const pricePct = absTotal > 0 ? (priceEffect / absTotal) * 100 : 0;
    const mixPct = absTotal > 0 ? (mixEffect / absTotal) * 100 : 0;

    const factors = [
      {
        factor: 'Volume (Customer Demand)',
        contribution: volumeEffect,
        contributionPct: volumePct,
        direction: volumeEffect >= 0 ? ('positive' as const) : ('negative' as const),
      },
      {
        factor: 'Price Changes',
        contribution: priceEffect,
        contributionPct: pricePct,
        direction: priceEffect >= 0 ? ('positive' as const) : ('negative' as const),
      },
      {
        factor: 'Product Mix Shift',
        contribution: mixEffect,
        contributionPct: mixPct,
        direction: mixEffect >= 0 ? ('positive' as const) : ('negative' as const),
      },
    ];

    const formula = `ΔRevenue = Volume Effect + Price Effect + Mix Effect
  = (ΔQuantity × P̄ₒₗₐ) + (Q̄ₙₑw × ΔPrice) + ΔMix
  = ₹${volumeEffect.toFixed(0)} + ₹${priceEffect.toFixed(0)} + ₹${mixEffect.toFixed(0)}
  = ₹${totalRevenueChange.toFixed(0)}`;

    const assumptions = [
      'Linear decomposition assumes no interaction between price and quantity effects',
      'Average prices weighted by quantity sold in each period',
      `Analysis based on ${currentOrders.length} current and ${comparisonOrders.length} comparison orders`,
      'Mix effect includes new items, discontinued items, and cross-effects',
      'Does not account for external factors (seasonality, competition, weather, events)',
    ];

    return { factors, formula, assumptions };
  }

  // Changed key type from number to string (CUID)
  private aggregateItemData(
    orders: any[]
  ): Map<string, { qty: number; revenue: number; avgPrice: number }> {
    const itemMap = new Map<string, { qty: number; revenue: number; avgPrice: number }>();

    for (const order of orders) {
      for (const item of order.orderItems) {
        const existing = itemMap.get(item.menuItemId) || { qty: 0, revenue: 0, avgPrice: 0 };
        existing.qty += item.quantity;
        existing.revenue += item.quantity * item.priceAtTime;
        itemMap.set(item.menuItemId, existing);
      }
    }

    for (const [itemId, data] of itemMap) {
      data.avgPrice = data.qty > 0 ? data.revenue / data.qty : 0;
    }

    return itemMap;
  }

  private generateRevenueExplanation(
    causalFactors: Array<{
      factor: string;
      contribution: number;
      contributionPct: number;
      direction: string;
    }>,
    revenueChangePct: number,
    currentRevenue: number,
    comparisonRevenue: number
  ): string {
    const primaryFactor = causalFactors[0];
    const secondaryFactor = causalFactors[1];
    
    const overallDirection = revenueChangePct > 0 ? 'increased' : 'decreased';
    const magnitude = Math.abs(revenueChangePct) > 20 ? 'significantly' : 'moderately';

    let explanation = `Revenue ${magnitude} ${overallDirection} by ${Math.abs(revenueChangePct).toFixed(1)}% `;
    explanation += `(from ₹${comparisonRevenue.toFixed(0)} to ₹${currentRevenue.toFixed(0)}). `;

    explanation += `This change was primarily driven by ${primaryFactor.factor.toLowerCase()}, `;
    explanation += `which contributed ${primaryFactor.direction === 'positive' ? '+' : ''}₹${Math.abs(primaryFactor.contribution).toFixed(0)} `;
    explanation += `(${Math.abs(primaryFactor.contributionPct).toFixed(1)}% of the change). `;

    if (Math.abs(secondaryFactor.contributionPct) > 25) {
      explanation += `${secondaryFactor.factor} was a secondary contributor.`;
    }

    return explanation;
  }

  private calculateConfidenceScore(
    totalSamples: number,
    currentSamples: number,
    comparisonSamples: number
  ): number {
    const sampleConfidence = Math.min(1, totalSamples / 200);
    const balance = Math.min(currentSamples, comparisonSamples) / Math.max(currentSamples, comparisonSamples);
    const balancePenalty = balance < 0.5 ? 0.8 : 1.0;
    return Math.min(0.85, sampleConfidence * balancePenalty);
  }

  private generateRecommendation(
    causalFactors: Array<{ factor: string }>,
    revenueChangePct: number,
    currentOrders: any[],
    comparisonOrders: any[]
  ): string | null {
    const isDecline = revenueChangePct < 0;
    const isSignificant = Math.abs(revenueChangePct) > 5;

    if (!isSignificant) return 'Revenue is stable. Continue monitoring trends.';

    const primaryFactor = causalFactors[0].factor;

    if (isDecline) {
      if (primaryFactor.includes('Volume')) {
        return `Customer traffic has declined. Consider running targeted promotions to drive footfall.`;
      } else if (primaryFactor.includes('Price')) {
        return `Recent price increases may have negatively impacted demand. Consider testing smaller price increments.`;
      }
    }
    return null;
  }

  private async storeInsight(restaurantId: number, insight: DecomposedInsight): Promise<void> {
    const changeMagnitude = Math.abs(insight.metadata?.percentChange || 0);
    let severity: string;

    if (changeMagnitude > 20) severity = 'critical';
    else if (changeMagnitude > 10) severity = 'warning';
    else severity = 'info';

    const expiresAt = subDays(new Date(), -7);

    // Now fields exist in schema
    await this.prisma.insight.create({
      data: {
        restaurantId,
        type: 'revenue_decomposition',
        severity,
        observation: insight.observation,
        explanation: insight.explanation,
        causalFactors: JSON.stringify(insight.causalFactors),
        formula: insight.formula,
        assumptions: JSON.stringify(insight.assumptions),
        sampleSize: insight.sampleSize,
        confidenceScore: insight.confidenceScore,
        recommendation: insight.recommendation,
        expiresAt,
      },
    });

    console.log(`[ExplainableInsightEngine] Insight stored with ${(insight.confidenceScore * 100).toFixed(0)}% confidence`);
  }

  // Changed menuItemId type to string (CUID)
  async analyzeItemPerformance(menuItemId: string): Promise<DecomposedInsight | null> {
    const baseline = await this.prisma.itemBaseline.findFirst({
      where: { menuItemId },
      orderBy: { computedAt: 'desc' },
      include: { menuItem: true },
    });

    if (!baseline) {
      console.log(`[ExplainableInsightEngine] No baseline found for item ${menuItemId}`);
      return null;
    }

    const recentStart = subDays(new Date(), 7);
    const recentOrders = await this.prisma.orderItem.findMany({
      where: {
        menuItemId,
        order: {
          timestamp: { gte: recentStart },
        },
      },
      include: { order: true },
    });

    if (recentOrders.length === 0) return null;

    const totalQty = recentOrders.reduce((sum, item) => sum + item.quantity, 0);
    const avgDailyQty = totalQty / 7;
    const deviation = baseline.stdDevQuantity > 0 ? (avgDailyQty - baseline.avgDailyQuantity) / baseline.stdDevQuantity : 0;

    let severity: string;
    if (Math.abs(deviation) > 1.5) severity = deviation < 0 ? 'critical' : 'info';
    else if (Math.abs(deviation) > 0.5) severity = 'warning';
    else severity = 'info';

    const performanceStatus = deviation > 0 ? 'outperforming' : 'underperforming';

    const insight: DecomposedInsight = {
      observation: `${baseline.menuItem.name} is ${performanceStatus} its baseline.`,
      explanation: `Current sales are ${deviation.toFixed(1)} standard deviations from normal.`,
      causalFactors: [],
      formula: `z-score = ${deviation.toFixed(2)}`,
      assumptions: ['Normal distribution assumed'],
      sampleSize: recentOrders.length,
      confidenceScore: baseline.confidenceScore,
      recommendation: deviation < -1.5 ? 'Consider running a promotion.' : undefined,
    };

    // Store insight (fields now exist)
    await this.prisma.insight.create({
      data: {
        restaurantId: baseline.menuItem.restaurantId,
        type: 'item_performance',
        severity,
        observation: insight.observation,
        explanation: insight.explanation,
        causalFactors: JSON.stringify(insight.causalFactors),
        formula: insight.formula,
        assumptions: JSON.stringify(insight.assumptions),
        sampleSize: insight.sampleSize,
        confidenceScore: insight.confidenceScore,
        recommendation: insight.recommendation,
        expiresAt: subDays(new Date(), -7),
      },
    });

    return insight;
  }

  async getActiveInsights(restaurantId: number): Promise<any[]> {
    return await this.prisma.insight.findMany({
      where: {
        restaurantId,
        expiresAt: { gt: new Date() },
      },
      orderBy: [
        { severity: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }
}
