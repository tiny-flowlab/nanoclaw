/**
 * LLM provider interface for NanoClaw agent runner.
 * Any provider must return a LanguageModel compatible with Vercel AI SDK's streamText().
 */
import type { LanguageModel } from 'ai';

export type { LanguageModel };

export interface LLMProviderConfig {
  /** Which provider to use: claude, openai, gemini, ollama */
  provider: string;
  /** Model name override (optional, each provider has a sensible default) */
  model?: string;
}
