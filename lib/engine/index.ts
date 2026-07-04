import type { DesignEngine } from './types';
import { ruleEngine } from './ruleEngine';
import { createGroqEngine } from './groqEngine';

// Single swap point. When GROQ_API_KEY is set, use the Groq-backed engine;
// otherwise fall back to the offline rule engine.
export function getEngine(): DesignEngine {
  const key = process.env.GROQ_API_KEY;
  if (key) return createGroqEngine(key);
  console.warn(
    '[engine] GROQ_API_KEY 미설정 — 저품질 규칙 엔진으로 폴백합니다. 프로덕션에서는 환경변수를 설정하세요.',
  );
  return ruleEngine;
}
