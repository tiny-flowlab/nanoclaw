/**
 * NanoClaw Agent Runner (Multi-LLM Edition)
 *
 * Replaces the original Claude Agent SDK with Vercel AI SDK so any LLM
 * backend can be used: claude, openai, gemini, ollama.
 *
 * Input protocol (unchanged from original):
 *   Stdin: Full ContainerInput JSON (read until EOF)
 *   IPC:   Follow-up messages written as JSON files to /workspace/ipc/input/
 *          Files: {type:"message", text:"..."}.json — polled and consumed
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Output protocol (unchanged from original):
 *   Each result is wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 */

import fs from 'fs';
import path from 'path';
import { streamText, type CoreMessage } from 'ai';
import { createLLMModel } from './llm/factory.js';
import { buildNanoclawTools } from './mcp-bridge.js';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_POLL_MS = 500;
const SESSIONS_DIR = '/workspace/group/.nanoclaw-sessions';

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }
    return true;
  }
  return false;
}

function drainIpcInput(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs
      .readdirSync(IPC_INPUT_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();

    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message' && data.text) messages.push(data.text);
      } catch {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    return messages;
  } catch {
    return [];
  }
}

/** Load conversation history from disk for session continuity. */
function loadHistory(sessionId: string): CoreMessage[] {
  const file = path.join(SESSIONS_DIR, `${sessionId}.json`);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as CoreMessage[];
  } catch {
    return [];
  }
}

/** Persist conversation history to disk. */
function saveHistory(sessionId: string, messages: CoreMessage[]): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const file = path.join(SESSIONS_DIR, `${sessionId}.json`);
  // Keep last 100 messages to avoid unbounded growth
  const trimmed = messages.slice(-100);
  fs.writeFileSync(file, JSON.stringify(trimmed, null, 2));
}

/** Remove session files older than 7 days to prevent unbounded accumulation. */
function cleanupOldSessions(currentSessionId: string): void {
  try {
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const files = fs.readdirSync(SESSIONS_DIR);
    for (const file of files) {
      if (!file.endsWith('.json') || file === `${currentSessionId}.json`) continue;
      const filePath = path.join(SESSIONS_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > MAX_AGE_MS) {
          fs.unlinkSync(filePath);
          log(`Cleaned up old session: ${file}`);
        }
      } catch { /* ignore per-file errors */ }
    }
  } catch { /* directory might not exist */ }
}

/** Build system prompt from global CLAUDE.md + group CLAUDE.md. */
function buildSystemPrompt(isMain: boolean, assistantName?: string): string {
  const parts: string[] = [];

  const globalPath = '/workspace/global/CLAUDE.md';
  if (!isMain && fs.existsSync(globalPath)) {
    parts.push(fs.readFileSync(globalPath, 'utf-8'));
  }

  const groupPath = '/workspace/group/CLAUDE.md';
  if (fs.existsSync(groupPath)) {
    parts.push(fs.readFileSync(groupPath, 'utf-8'));
  }

  if (parts.length === 0) {
    return `You are ${assistantName || 'Andy'}, a helpful personal assistant.`;
  }

  return parts.join('\n\n---\n\n');
}

async function runAgentLoop(
  containerInput: ContainerInput,
  sessionId: string,
): Promise<void> {
  const model = await createLLMModel();
  const tools = buildNanoclawTools({
    chatJid: containerInput.chatJid,
    groupFolder: containerInput.groupFolder,
    isMain: containerInput.isMain,
  });
  const systemPrompt = buildSystemPrompt(containerInput.isMain, containerInput.assistantName);

  let history = loadHistory(sessionId);
  let closed = false;

  // Build initial prompt
  let promptText = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    promptText = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${promptText}`;
  }

  // Drain any pending IPC messages into the initial prompt
  const pending = drainIpcInput();
  if (pending.length > 0) {
    promptText += '\n' + pending.join('\n');
  }

  // Conversation loop: run streamText -> wait for follow-up -> repeat
  while (!closed) {
    history = [...history, { role: 'user', content: promptText } as CoreMessage];

    log(`Running streamText (provider=${process.env.LLM_PROVIDER || 'claude'}, history=${history.length} msgs)`);

    let fullText = '';

    try {
      const result = streamText({
        model,
        system: systemPrompt,
        messages: history,
        tools,
        maxSteps: 20,
      });

      // Consume the stream and collect text
      for await (const chunk of result.textStream) {
        fullText += chunk;
      }

      // Warn if the model hit the step limit without producing visible text
      const finishReason = await result.finishReason;
      if (!fullText && finishReason !== 'stop') {
        log(`Warning: streamText finished with reason "${finishReason}" and no text output`);
      }

      // Use result.response.messages to capture the full assistant turn,
      // including any intermediate tool calls and tool results from maxSteps.
      // This preserves correct multi-turn context across follow-up messages.
      const { messages: responseMessages } = await result.response;
      history = [...history, ...responseMessages];
      saveHistory(sessionId, history);
      cleanupOldSessions(sessionId);

      writeOutput({
        status: 'success',
        result: fullText || null,
        newSessionId: sessionId,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`streamText error: ${errMsg}`);
      writeOutput({ status: 'error', result: null, error: errMsg });
      return;
    }

    // Wait for follow-up IPC message or _close sentinel
    log('Waiting for follow-up IPC message or close sentinel...');
    const next = await new Promise<string | null>((resolve) => {
      const poll = () => {
        if (shouldClose()) { resolve(null); return; }
        const msgs = drainIpcInput();
        if (msgs.length > 0) { resolve(msgs.join('\n')); return; }
        setTimeout(poll, IPC_POLL_MS);
      };
      poll();
    });

    if (next === null) {
      log('Close sentinel received, ending loop');
      closed = true;
    } else {
      promptText = next;
    }
  }
}

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    log(`Received input for group: ${containerInput.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`,
    });
    process.exit(1);
  }

  const sessionId =
    containerInput.sessionId ||
    `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
  try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }

  try {
    await runAgentLoop(containerInput, sessionId);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[agent-runner] Fatal:', err);
  process.exit(1);
});
