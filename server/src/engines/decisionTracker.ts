import Database from 'better-sqlite3';

interface Decision {
  id?: number;
  decisionType: string;
  entityId: number;
  entityType: string;
  recommendation: string;
  rationale: string;
  predictedImpact: Record<string, any>;
  status?: 'pending' | 'accepted' | 'rejected' | 'implemented';
  implementedAt?: Date;
  createdAt?: Date;
}

interface DecisionOutcome {
  decisionId: number;
  actualImpact: Record<string, any>;
  evaluationDate: Date;
  accuracyScore: number;
  notes?: string;
}

export class DecisionTracker {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        decision_type TEXT NOT NULL,
        entity_id INTEGER,
        entity_type TEXT,
        recommendation TEXT NOT NULL,
        rationale TEXT,
        predicted_impact TEXT,
        status TEXT DEFAULT 'pending',
        implemented_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decision_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        decision_id INTEGER NOT NULL,
        actual_impact TEXT,
        evaluation_date TIMESTAMP,
        accuracy_score REAL,
        notes TEXT,
        FOREIGN KEY (decision_id) REFERENCES decisions(id)
      )
    `);
  }

  public logRecommendation(decision: Decision): number {
    const query = `
      INSERT INTO decisions 
      (decision_type, entity_id, entity_type, recommendation, rationale, predicted_impact)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const result = this.db.prepare(query).run(
      decision.decisionType,
      decision.entityId,
      decision.entityType,
      decision.recommendation,
      decision.rationale,
      JSON.stringify(decision.predictedImpact)
    );

    return result.lastInsertRowid as number;
  }

  public updateDecisionStatus(
    decisionId: number,
    status: 'pending' | 'accepted' | 'rejected' | 'implemented'
  ): void {
    if (status === 'implemented') {
      const query = `
        UPDATE decisions 
        SET status = ?, implemented_at = ?
        WHERE id = ?
      `;
      this.db.prepare(query).run(status, new Date().toISOString(), decisionId);
    } else {
      const query = `
        UPDATE decisions 
        SET status = ?
        WHERE id = ?
      `;
      this.db.prepare(query).run(status, decisionId);
    }
  }

  public logOutcome(outcome: DecisionOutcome): void {
    const query = `
      INSERT INTO decision_outcomes 
      (decision_id, actual_impact, evaluation_date, accuracy_score, notes)
      VALUES (?, ?, ?, ?, ?)
    `;

    this.db.prepare(query).run(
      outcome.decisionId,
      JSON.stringify(outcome.actualImpact),
      outcome.evaluationDate.toISOString(),
      outcome.accuracyScore,
      outcome.notes || null
    );
  }

  public getPendingDecisions(restaurantId: number): Decision[] {
    const query = `
      SELECT id, decision_type, recommendation, rationale, predicted_impact, created_at
      FROM decisions
      WHERE entity_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `;

    const rows = this.db.prepare(query).all(restaurantId) as any[];

    return rows.map((row) => ({
      id: row.id,
      decisionType: row.decision_type,
      entityId: restaurantId,
      entityType: 'restaurant',
      recommendation: row.recommendation,
      rationale: row.rationale,
      predictedImpact: JSON.parse(row.predicted_impact),
      status: 'pending',
      createdAt: new Date(row.created_at),
    }));
  }

  public getDecisionById(decisionId: number): Decision | null {
    const query = `
      SELECT * FROM decisions WHERE id = ?
    `;

    const row = this.db.prepare(query).get(decisionId) as any;

    if (!row) return null;

    return {
      id: row.id,
      decisionType: row.decision_type,
      entityId: row.entity_id,
      entityType: row.entity_type,
      recommendation: row.recommendation,
      rationale: row.rationale,
      predictedImpact: JSON.parse(row.predicted_impact),
      status: row.status,
      implementedAt: row.implemented_at ? new Date(row.implemented_at) : undefined,
      createdAt: new Date(row.created_at),
    };
  }
}