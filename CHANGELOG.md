# Changelog

All notable changes to NanoClaw will be documented in this file.

## [1.2.17] - Multi-LLM Edition (tiny-flowlab fork)

### Added
- **Multi-LLM backend via Vercel AI SDK**: Switch between Claude, OpenAI, Gemini, and Ollama using the `LLM_PROVIDER` environment variable (`claude` | `openai` | `gemini` | `ollama`). Defaults to `claude`.
- **`LLM_MODEL` env var**: Override the default model for any provider (e.g. `gpt-4o-mini`, `gemini-1.5-pro`, `llama3.1`).
- **`OLLAMA_BASE_URL` env var**: Configure the Ollama endpoint (default: `http://localhost:11434`).
- **`OPENAI_API_KEY` and `GEMINI_API_KEY`**: New credential proxy keys injected into agent containers.
- **Telegram channel support**: Merged from `qwibitai/nanoclaw-telegram`. Configure via `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_CHAT_IDS`.
- **LLM abstraction layer** (`container/agent-runner/src/llm/`): `interface.ts`, `factory.ts`, and per-provider modules (`claude.ts`, `openai.ts`, `gemini.ts`, `ollama.ts`).
- **MCP bridge** (`container/agent-runner/src/mcp-bridge.ts`): 7 IPC tools in Vercel AI SDK format — `send_message`, `schedule_task`, `list_tasks`, `pause_task`, `resume_task`, `cancel_task`, `update_task`.
- **Conversation history persistence**: Session history stored as JSON files at `/workspace/group/.nanoclaw-sessions/{sessionId}.json`.

### Changed
- **Agent runner rewritten** (`container/agent-runner/src/index.ts`): Replaced `@anthropic-ai/claude-agent-sdk` with `streamText()` from Vercel AI SDK. Provider-agnostic tool/history loop.
- **Dockerfile updated**: Removed `@anthropic-ai/claude-code` global install; uses `--legacy-peer-deps` for agent-runner; simplified entrypoint to `node /app/dist/index.js`.
- **`container-runner.ts`**: Passes `LLM_PROVIDER`, `LLM_MODEL`, and provider-specific API key env vars to agent containers.

### Dependencies (agent-runner)
- Removed: `@anthropic-ai/claude-agent-sdk`
- Added: `ai ^4.3.16`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `ollama-ai-provider`, `@modelcontextprotocol/sdk`, `cron-parser`, `zod`

---

## [1.2.0](https://github.com/qwibitai/nanoclaw/compare/v1.1.6...v1.2.0)

[BREAKING] WhatsApp removed from core, now a skill. Run `/add-whatsapp` to re-add (existing auth/groups preserved).
- **fix:** Prevent scheduled tasks from executing twice when container runtime exceeds poll interval (#138, #669)
