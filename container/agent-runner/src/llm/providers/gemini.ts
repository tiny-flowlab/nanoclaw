/**
 * Google Gemini provider.
 * Reads GEMINI_API_KEY from environment.
 * Default model: gemini-2.0-flash
 */
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

export function createGeminiModel(modelId?: string): LanguageModel {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const google = createGoogleGenerativeAI({ apiKey });
  return google(modelId || 'gemini-2.0-flash') as LanguageModel;
}
