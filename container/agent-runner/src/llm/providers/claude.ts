/**
 * Claude (Anthropic) provider.
 * Reads ANTHROPIC_API_KEY from environment.
 * Default model: claude-sonnet-4-5
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

export function createClaudeModel(modelId?: string): LanguageModel {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL;

  const anthropic = createAnthropic({
    apiKey: apiKey || 'placeholder',
    ...(baseURL ? { baseURL } : {}),
  });

  return anthropic(modelId || 'claude-sonnet-4-5') as LanguageModel;
}
