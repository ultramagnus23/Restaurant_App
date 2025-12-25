import Database from 'better-sqlite3';
import { subDays, differenceInDays } from 'date-fns';
import { DecisionTracker } from './decisionTracker';

interface EvaluationResult {
  predicted: Record<string, any>;
  actual: Record<string, any>;
  accuracy: number;
  evaluation: string;
}

export class OutcomeEvaluator {
  private db: Database.Database;
  private decisionTracker: DecisionTracker;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.decisionTracker = new DecisionTracker(dbPath);
  }

  public evaluateDecision(decisionId: number): EvaluationResult | null {
    const decision = this.decisionTracker.getDecisionById(decisionId);

    if (!decision || decision.status !== 'implemented' || !decision.implementedAt) {
      return null;
    }

    // Check if enough time has passed (7 days)
    const daysSinceImplementation = differenceInDays(new Date(), decision.implementedAt);

    if (daysSinceImplementation < 7) {
      return null;
    }

    // Measure actual impact
    let actualImpact: Record<string, any>;

    if (decision.entityType === 'item') {
      actualImpact = this.measureItemImpact(decision.entityId, decision.implementedAt);
    } else if (decision.entityType === 'restaurant') {
      actualImpact = this.measureRestaurantImpact(decision.entityId, decision.implementedAt);
    } else {
      return null;
    }

    // Calculate accuracy
    const accuracy = this.calculateAccuracy(decision.predictedImpact, actualImpact);

    // Log the outcome
    this.decisionTracker.logOutcome({
      decisionId,
      actualImpact,
      evaluationDate: new Date(),
      accuracyScore: accuracy,
    });

    return {
      predicted: decision.predictedImpact,
      actual: actualImpact,
      accuracy,
      evaluation: this.generateEvaluationText(decision.predictedImpact, actualImpact, accuracy),
    };
  }

  private measureItemImpact(itemId: number, implementationDate: Date): Record<string, any> {
    const beforeStart = subDays(implementationDate, 14);
    const beforeEnd = implementationDate;
    const afterStart = implementationDate;
    const afterEnd = subDays(new Date(), -7);

    const query = `
      SELECT SUM(quantity * price) as revenue, SUM(quantity) as qty
      FROM transactions
      WHERE item_id = ? AND DATE(timestamp) BETWEEN ? AND ?
    `;

    const before = this.db
      .prepare(query)
      .get(itemId, beforeStart.toISOString().split('T')[0], beforeEnd.toISOString().split('T')[0]) as any;

    const after = this.db
      .prepare(query)
      .get(itemId, afterStart.toISOString().split('T')[0], afterEnd.toISOString().split('T')[0]) as any;

    const beforeRev = before?.revenue || 0;
    const afterRev = after?.revenue || 0;
    const revenueChange = beforeRev > 0 ? ((afterRev - beforeRev) / beforeRev) * 100 : 0;

    return {
      revenue_change_pct: revenueChange,
      before_revenue: beforeRev,
      after_revenue: afterRev,
    };
  }

  private measureRestaurantImpact(restaurantId: number, implementationDate: Date): Record<string, any> {
    const beforeStart = subDays(implementationDate, 14);
    const beforeEnd = implementationDate;
    const afterStart = implementationDate;
    const afterEnd = subDays(new Date(), -7);

    const query = `
      SELECT SUM(total_amount) as revenue, COUNT(*) as orders
      FROM transactions
      WHERE restaurant_id = ? AND DATE(timestamp) BETWEEN ? AND ?
    `;

    const before = this.db
      .prepare(query)
      .get(restaurantId, beforeStart.toISOString().split('T')[0], beforeEnd.toISOString().split('T')[0]) as any;

    const after = this.db
      .prepare(query)
      .get(restaurantId, afterStart.toISOString().split('T')[0], afterEnd.toISOString().split('T')[0]) as any;

    const beforeRev = before?.revenue || 0;
    const afterRev = after?.revenue || 0;
    const revenueChange = beforeRev > 0 ? ((afterRev - beforeRev) / beforeRev) * 100 : 0;

    return {
      revenue_change_pct: revenueChange,
      before_revenue: beforeRev,
      after_revenue: afterRev,
    };
  }

  private calculateAccuracy(predicted: Record<string, any>, actual: Record<string, any>): number {
    if ('revenue_change_pct' in predicted && 'revenue_change_pct' in actual) {
      const predVal = predicted.revenue_change_pct;
      const actualVal = actual.revenue_change_pct;

      if (predVal === 0 && actualVal === 0) {
        return 1.0;
      }

      const error = Math.abs(predVal - actualVal) / Math.max(Math.abs(predVal), Math.abs(actualVal));
      return Math.max(0, 1 - error);
    }

    return 0.5; // Unknown
  }

  private generateEvaluationText(
    predicted: Record<string, any>,
    actual: Record<string, any>,
    accuracy: number
  ): string {
    const predChange = predicted.revenue_change_pct || 0;
    const actualChange = actual.revenue_change_pct || 0;

    if (accuracy > 0.8) {
      return `Prediction was highly accurate. Expected ${predChange.toFixed(1)}% change, actual was ${actualChange.toFixed(1)}%.`;
    } else if (accuracy > 0.5) {
      return `Prediction was moderately accurate. Expected ${predChange.toFixed(1)}% change, actual was ${actualChange.toFixed(1)}%.`;
    } else {
      return `Prediction was off. Expected ${predChange.toFixed(1)}% change, actual was ${actualChange.toFixed(1)}%. Adjusting models.`;
    }
  }
}