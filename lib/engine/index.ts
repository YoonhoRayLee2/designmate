import type { DesignEngine } from './types';
import { ruleEngine } from './ruleEngine';
import { createGroqEngine } from './groqEngine';

// Single swap point. When GROQ_API_KEY is set, use the Groq-backed engine;
// otherwise fall back to the offline rule engine.
export function getEngine(): DesignEngine {
  const key = process.env.GROQ_API_KEY;
  if (key) return createGroqEngine(key);
  return ruleEngine;
}
