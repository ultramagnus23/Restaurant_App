import Database from 'better-sqlite3';
import { format, subDays } from 'date-fns';

interface RevenueDecomposition {
  revenueChange: number;
  revenueChangePct: number;
  decomposition: {
    volumeEffect: number;
    volumeEffectPct: number;
    priceEffect: number;
    priceEffectPct: number;
    mixEffect: number;
    mixEffectPct: number;
  };
  explanation: string;
}

interface Insight {
  id?: number;
  insightType: string;
  entityId: number;
  entityType: string;
  title: string;
  explanation: string;
  causalFactors: string;
  confidenceScore?: number;
}

export class InsightEngine {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        insight_type TEXT NOT NULL,
        entity_id INTEGER,
        entity_type TEXT,
        title TEXT,
        explanation TEXT,
        causal_factors TEXT,
        confidence_score REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  public analyzeRevenueChange(
    restaurantId: number,
    currentPeriodDays: number = 7,
    comparisonPeriodDays: number = 7
  ): RevenueDecomposition {
    const today = new Date();
    const currentStart = subDays(today, currentPeriodDays);
    const comparisonStart = subDays(currentStart, comparisonPeriodDays);
    const comparisonEnd = currentStart;

    // Get current period data
    const currentQuery = `
      SELECT 
        item_id,
        SUM(quantity) as qty,
        AVG(price) as avg_price,
        SUM(quantity * price) as revenue
      FROM transactions
      WHERE restaurant_id = ?
        AND DATE(timestamp) BETWEEN ? AND ?
      GROUP BY item_id
    `;

    const currentData = this.db
      .prepare(currentQuery)
      .all(
        restaurantId,
        format(currentStart, 'yyyy-MM-dd'),
        format(today, 'yyyy-MM-dd')
      ) as any[];

    // Get comparison period data
    const comparisonData = this.db
      .prepare(currentQuery)
      .all(
        restaurantId,
        format(comparisonStart, 'yyyy-MM-dd'),
        format(comparisonEnd, 'yyyy-MM-dd')
      ) as any[];

    // Create maps for easy lookup
    const currentMap = new Map(currentData.map((item) => [item.item_id, item]));
    const comparisonMap = new Map(comparisonData.map((item) => [item.item_id, item]));

    // Calculate total revenues
    const totalCurrentRev = currentData.reduce((sum, item) => sum + item.revenue, 0);
    const totalComparisonRev = comparisonData.reduce((sum, item) => sum + item.revenue, 0);
    const revenueChange = totalCurrentRev - totalComparisonRev;

    // Decomposition: Volume effect
    let volumeEffect = 0;
    for (const [itemId, comp] of comparisonMap) {
      const current = currentMap.get(itemId);
      const qtyChange = (current?.qty || 0) - comp.qty;
      volumeEffect += qtyChange * comp.avg_price;
    }

    // Price effect
    let priceEffect = 0;
    for (const [itemId, current] of currentMap) {
      const comp = comparisonMap.get(itemId);
      if (comp) {
        const priceChange = current.avg_price - comp.avg_price;
        priceEffect += priceChange * current.qty;
      }
    }

    // Mix effect (new items or discontinued items)
    const mixEffect = revenueChange - volumeEffect - priceEffect;

    const decomposition: RevenueDecomposition = {
      revenueChange,
      revenueChangePct: totalComparisonRev > 0 ? (revenueChange / totalComparisonRev) * 100 : 0,
      decomposition: {
        volumeEffect,
        volumeEffectPct: revenueChange !== 0 ? (volumeEffect / Math.abs(revenueChange)) * 100 : 0,
        priceEffect,
        priceEffectPct: revenueChange !== 0 ? (priceEffect / Math.abs(revenueChange)) * 100 : 0,
        mixEffect,
        mixEffectPct: revenueChange !== 0 ? (mixEffect / Math.abs(revenueChange)) * 100 : 0,
      },
      explanation: this.generateExplanation(volumeEffect, priceEffect, mixEffect, revenueChange),
    };

    // Store insight
    this.storeInsight({
      insightType: 'revenue_decomposition',
      entityId: restaurantId,
      entityType: 'restaurant',
      title: 'Revenue Change Analysis',
      explanation: decomposition.explanation,
      causalFactors: JSON.stringify(decomposition.decomposition),
    });

    return decomposition;
  }

  private generateExplanation(
    volume: number,
    price: number,
    mix: number,
    total: number
  ): string {
    if (total === 0) {
      return 'No significant revenue change detected.';
    }

    const factors: string[] = [];
    const threshold = Math.abs(total) * 0.3;

    if (Math.abs(volume) > threshold) {
      const direction = volume > 0 ? 'increased' : 'decreased';
      factors.push(`customer demand ${direction}`);
    }

    if (Math.abs(price) > threshold) {
      const direction = price > 0 ? 'raised' : 'lowered';
      factors.push(`prices were ${direction}`);
    }

    if (Math.abs(mix) > threshold) {
      factors.push('product mix changed');
    }

    if (factors.length === 0) {
      return 'Revenue change was due to minor fluctuations across multiple factors.';
    }

    const changeDirection = total > 0 ? 'increased' : 'decreased';
    return `Revenue ${changeDirection} primarily because ${factors.join(' and ')}.`;
  }

  private storeInsight(insight: Insight): void {
    const query = `
      INSERT INTO insights 
      (insight_type, entity_id, entity_type, title, explanation, causal_factors)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    this.db.prepare(query).run(
      insight.insightType,
      insight.entityId,
      insight.entityType,
      insight.title,
      insight.explanation,
      insight.causalFactors
    );
  }

  public calculatePriceElasticity(itemId: number, restaurantId: number): number | null {
    const query = `
      SELECT 
        DATE(timestamp) as sale_date,
        AVG(price) as avg_price,
        SUM(quantity) as total_qty
      FROM transactions
      WHERE item_id = ? AND restaurant_id = ?
      GROUP BY DATE(timestamp)
      ORDER BY sale_date
    `;

    const data = this.db.prepare(query).all(itemId, restaurantId) as any[];

    if (data.length < 10) {
      return null; // Need enough data points
    }

    const priceChanges: number[] = [];
    const qtyChanges: number[] = [];

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];

      if (prev.avg_price > 0 && prev.total_qty > 0) {
        const pricePctChange = (curr.avg_price - prev.avg_price) / prev.avg_price;
        const qtyPctChange = (curr.total_qty - prev.total_qty) / prev.total_qty;

        if (Math.abs(pricePctChange) > 0.01) {
          // Significant price change
          priceChanges.push(pricePctChange);
          qtyChanges.push(qtyPctChange);
        }
      }
    }

    if (priceChanges.length === 0) {
      return null;
    }

    // Calculate elasticities and average
    const elasticities = priceChanges
      .map((p, i) => (p !== 0 ? qtyChanges[i] / p : 0))
      .filter((e) => e !== 0);

    return elasticities.length > 0
      ? elasticities.reduce((sum, e) => sum + e, 0) / elasticities.length
      : null;
  }
}