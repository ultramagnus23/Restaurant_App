import Database from 'better-sqlite3';
import { format, subDays } from 'date-fns';

interface DailyAggregate {
  date: string;
  restaurantId: number;
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  uniqueItemsSold: number;
}

interface ItemBaseline {
  itemId: number;
  restaurantId: number;
  avgDailyQuantity: number;
  avgDailyRevenue: number;
  stdDevQuantity: number;
  baselinePeriodStart: string;
  baselinePeriodEnd: string;
}

interface BaselineComparison {
  baselineAvg: number;
  currentValue: number;
  deviationSigma: number;
  performance: 'above' | 'below' | 'normal';
}

export class AnalyticsEngine {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initTables();
  }

  private initTables(): void {
    // 1. THIS IS THE MISSING PART CAUSING YOUR ERROR
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pos_order_id TEXT,
        timestamp DATETIME,
        channel TEXT,
        menu_item TEXT,
        category TEXT,
        quantity INTEGER,
        price REAL,
        total_amount REAL,
        restaurant_id INTEGER DEFAULT 1,
        item_id INTEGER, 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Daily aggregates table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_aggregates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        restaurant_id INTEGER,
        total_revenue REAL,
        total_orders INTEGER,
        avg_order_value REAL,
        unique_items_sold INTEGER,
        computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, restaurant_id)
      )
    `);

    // 3. Item performance baselines
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS item_baselines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        restaurant_id INTEGER,
        baseline_period_start DATE,
        baseline_period_end DATE,
        avg_daily_quantity REAL,
        avg_daily_revenue REAL,
        std_dev_quantity REAL,
        price_elasticity REAL,
        computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(item_id, baseline_period_end)
      )
    `);

    // 4. Temporal patterns
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS temporal_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER,
        hour_of_day INTEGER,
        day_of_week INTEGER,
        avg_revenue REAL,
        avg_orders INTEGER,
        peak_items TEXT,
        computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(restaurant_id, hour_of_day, day_of_week)
      )
    `);
  }
  public computeDailyAggregates(restaurantId: number, date: string): DailyAggregate | null {
    const query = `
      SELECT 
        COUNT(*) as total_orders,
        SUM(total_amount) as total_revenue,
        AVG(total_amount) as avg_order_value,
        COUNT(DISTINCT item_id) as unique_items
      FROM transactions
      WHERE DATE(timestamp) = ? AND restaurant_id = ?
    `;

    const result = this.db.prepare(query).get(date, restaurantId) as any;

    if (!result || result.total_orders === 0) {
      return null;
    }

    // Store the aggregate
    const insertQuery = `
      INSERT OR REPLACE INTO daily_aggregates 
      (date, restaurant_id, total_revenue, total_orders, avg_order_value, unique_items_sold)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    this.db.prepare(insertQuery).run(
      date,
      restaurantId,
      result.total_revenue,
      result.total_orders,
      result.avg_order_value,
      result.unique_items
    );

    return {
      date,
      restaurantId,
      totalRevenue: result.total_revenue,
      totalOrders: result.total_orders,
      avgOrderValue: result.avg_order_value,
      uniqueItemsSold: result.unique_items,
    };
  }

  public computeItemBaseline(
    itemId: number,
    restaurantId: number,
    lookbackDays: number = 30
  ): ItemBaseline | null {
    const endDate = new Date();
    const startDate = subDays(endDate, lookbackDays);

    const query = `
      SELECT 
        DATE(timestamp) as sale_date,
        SUM(quantity) as daily_qty,
        SUM(quantity * price) as daily_rev
      FROM transactions
      WHERE item_id = ? 
        AND restaurant_id = ?
        AND DATE(timestamp) BETWEEN ? AND ?
      GROUP BY DATE(timestamp)
    `;

    const dailyData = this.db
      .prepare(query)
      .all(itemId, restaurantId, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')) as any[];

    if (dailyData.length < 7) {
      return null; // Need minimum data
    }

    const quantities = dailyData.map((row) => row.daily_qty);
    const revenues = dailyData.map((row) => row.daily_rev);

    const avgQty = this.mean(quantities);
    const avgRev = this.mean(revenues);
    const stdQty = this.standardDeviation(quantities);

    // Store baseline
    const insertQuery = `
      INSERT OR REPLACE INTO item_baselines 
      (item_id, restaurant_id, baseline_period_start, baseline_period_end,
       avg_daily_quantity, avg_daily_revenue, std_dev_quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.prepare(insertQuery).run(
      itemId,
      restaurantId,
      format(startDate, 'yyyy-MM-dd'),
      format(endDate, 'yyyy-MM-dd'),
      avgQty,
      avgRev,
      stdQty
    );

    return {
      itemId,
      restaurantId,
      avgDailyQuantity: avgQty,
      avgDailyRevenue: avgRev,
      stdDevQuantity: stdQty,
      baselinePeriodStart: format(startDate, 'yyyy-MM-dd'),
      baselinePeriodEnd: format(endDate, 'yyyy-MM-dd'),
    };
  }

  public getBaselineComparison(itemId: number, currentValue: number): BaselineComparison | null {
    const query = `
      SELECT avg_daily_quantity, std_dev_quantity
      FROM item_baselines
      WHERE item_id = ?
      ORDER BY computed_at DESC
      LIMIT 1
    `;

    const baseline = this.db.prepare(query).get(itemId) as any;

    if (!baseline) {
      return null;
    }

    const avg = baseline.avg_daily_quantity;
    const std = baseline.std_dev_quantity;
    const deviation = std > 0 ? (currentValue - avg) / std : 0;

    let performance: 'above' | 'below' | 'normal';
    if (deviation > 0.5) {
      performance = 'above';
    } else if (deviation < -0.5) {
      performance = 'below';
    } else {
      performance = 'normal';
    }

    return {
      baselineAvg: avg,
      currentValue,
      deviationSigma: deviation,
      performance,
    };
  }

  // Utility functions
  private mean(numbers: number[]): number {
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }

  private standardDeviation(numbers: number[]): number {
    const avg = this.mean(numbers);
    const squareDiffs = numbers.map((num) => Math.pow(num - avg, 2));
    const avgSquareDiff = this.mean(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  }
}