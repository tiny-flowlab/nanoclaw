# Changelog

All notable changes to NanoClaw will be documented in this file.

## [1.2.18] - Reliability & Hardening

### Fixed
- **Tool call history preservation** (`agent-runner`): Replaced bare `fullText` assistant message push with `result.response.messages` so tool calls and tool results are included in conversation history. Without this, multi-turn follow-up messages lost all tool-call context.
- **DB graceful shutdown**: Added `closeDatabase()` and call it in the SIGTERM/SIGINT shutdown handler to prevent `SQLITE_BUSY` lock errors on service restart.
- **Message loop error backoff**: Repeated errors in the message polling loop now use exponential backoff (initial `POLL_INTERVAL`, max 60 s) instead of spinning immediately, preventing CPU exhaustion on persistent failures.
- **Telegram duplicate handler registration**: `connect()` now disconnects any existing bot instance before reconnecting, preventing duplicate `message:text` handlers from registering on reconnect.

### Added
- **Session file TTL cleanup** (`agent-runner`): Old `.nanoclaw-sessions/*.json` files are pruned after 7 days to prevent unbounded accumulation on active groups.
- **IPC error file cleanup**: Files in the `ipc/errors/` directory older than 7 days are deleted automatically on a 24-hour interval.
- **`pendingTasks` queue cap**: Each group is limited to 50 queued tasks; excess tasks are dropped with a warning to prevent unbounded memory growth.
- **Idle group state pruning**: Fully-idle group entries are removed from the `GroupQueue` internal Map after draining to prevent memory accumulation over long uptime.
- **Telegram incoming rate limit**: Messages exceeding 20 per 10 seconds per chat are dropped with a warning log, protecting against flooding/abuse.
- **`maxSteps` warning** (`agent-runner`): If `streamText` finishes without text output due to step limit or unexpected finish reason, a warning is logged to aid debugging.

---

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
