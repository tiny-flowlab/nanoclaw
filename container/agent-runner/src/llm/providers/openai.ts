/**
 * OpenAI / Codex provider.
 * Reads OPENAI_API_KEY from environment.
 * Default model: gpt-4o
 */
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export function createOpenAIModel(modelId?: string): LanguageModel {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const openai = createOpenAI({ apiKey });
  return openai(modelId || 'gpt-4o') as LanguageModel;
}
