/**
 * Ollama (local) provider.
 * Reads OLLAMA_BASE_URL from environment (default: http://localhost:11434).
 * Default model: llama3.2
 *
 * Note: Only models supporting tool calls work with agent loops.
 * Supported: llama3.2, qwen2.5, mistral-nemo, etc.
 */
import { createOllama } from 'ollama-ai-provider';
import type { LanguageModel } from 'ai';

export function createOllamaModel(modelId?: string): LanguageModel {
  const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  const ollama = createOllama({ baseURL: `${baseURL}/api` });
  return ollama(modelId || 'llama3.2') as LanguageModel;
}
