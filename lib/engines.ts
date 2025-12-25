// lib/engines.ts
import path from 'path';
import { AnalyticsEngine } from '../server/src/engines/analyticsEngine';
import { InsightEngine } from '../server/src/engines/insightEngine';
import { DecisionTracker } from '../server/src/engines/decisionTracker';
import { OutcomeEvaluator } from '../server/src/engines/outcomeEvaluator';

// 1. Define the database path
// process.cwd() ensures this finds the file correctly in the Next.js server runtime
const DB_PATH = path.join(process.cwd(), 'restaurant_app.db'); 

// 2. Initialize and export the instances
// These will be reused across your server components
export const analyticsEngine = new AnalyticsEngine(DB_PATH);
export const insightEngine = new InsightEngine(DB_PATH);
export const decisionTracker = new DecisionTracker(DB_PATH);
export const outcomeEvaluator = new OutcomeEvaluator(DB_PATH);