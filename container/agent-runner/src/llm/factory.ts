/**
 * LLM factory: resolves the correct provider from LLM_PROVIDER env var.
 *
 * Supported values for LLM_PROVIDER:
 *   claude   → Anthropic Claude (default)
 *   openai   → OpenAI / Codex
 *   gemini   → Google Gemini
 *   ollama   → Local Ollama
 *
 * Optionally set LLM_MODEL to override the default model for the chosen provider.
 */
import type { LanguageModel } from 'ai';

export async function createLLMModel(): Promise<LanguageModel> {
  const provider = (process.env.LLM_PROVIDER || 'claude').toLowerCase();
  const modelId = process.env.LLM_MODEL || undefined;

  switch (provider) {
    case 'claude': {
      const { createClaudeModel } = await import('./providers/claude.js');
      return createClaudeModel(modelId);
    }
    case 'openai': {
      const { createOpenAIModel } = await import('./providers/openai.js');
      return createOpenAIModel(modelId);
    }
    case 'gemini': {
      const { createGeminiModel } = await import('./providers/gemini.js');
      return createGeminiModel(modelId);
    }
    case 'ollama': {
      const { createOllamaModel } = await import('./providers/ollama.js');
      return createOllamaModel(modelId);
    }
    default:
      throw new Error(
        `Unknown LLM_PROVIDER: "${provider}". Supported: claude, openai, gemini, ollama`,
      );
  }
}
