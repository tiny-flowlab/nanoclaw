/**
 * MCP Bridge for NanoClaw agent runner.
 *
 * Converts the nanoclaw IPC MCP tools into Vercel AI SDK tool() format so
 * streamText() can call them during the agent loop.
 *
 * The MCP server (ipc-mcp-stdio.ts) is kept intact; this bridge provides
 * equivalent tool definitions that write directly to IPC files — same
 * behaviour, different calling convention.
 */
import fs from 'fs';
import path from 'path';
import { tool } from 'ai';
import { z } from 'zod';
import { CronExpressionParser } from 'cron-parser';

const IPC_DIR = '/workspace/ipc';
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);
  return filename;
}

export interface NanoclawContext {
  chatJid: string;
  groupFolder: string;
  isMain: boolean;
}

export function buildNanoclawTools(ctx: NanoclawContext) {
  return {
    send_message: tool({
      description:
        "Send a message to the user or group immediately while you're still running. Use for progress updates or to send multiple messages.",
      parameters: z.object({
        text: z.string().describe('The message text to send'),
        sender: z
          .string()
          .optional()
          .describe('Your role/identity name (e.g. "Researcher"). When set, messages appear from a dedicated bot in Telegram.'),
      }),
      execute: async ({ text, sender }) => {
        writeIpcFile(MESSAGES_DIR, {
          type: 'message',
          chatJid: ctx.chatJid,
          text,
          sender: sender || undefined,
          groupFolder: ctx.groupFolder,
          timestamp: new Date().toISOString(),
        });
        return 'Message sent.';
      },
    }),

    schedule_task: tool({
      description:
        'Schedule a recurring or one-time task. The task runs as a full agent with all tools. Use context_mode=group for tasks needing chat history, isolated for self-contained tasks.',
      parameters: z.object({
        prompt: z.string().describe('What the agent should do when the task runs.'),
        schedule_type: z
          .enum(['cron', 'interval', 'once'])
          .describe('cron=recurring at specific times, interval=every N ms, once=run once'),
        schedule_value: z
          .string()
          .describe(
            'cron: "0 9 * * *" | interval: milliseconds like "300000" | once: local timestamp like "2026-02-01T15:30:00" (no Z suffix)',
          ),
        context_mode: z
          .enum(['group', 'isolated'])
          .default('group')
          .describe('group=chat history, isolated=fresh session'),
        target_group_jid: z
          .string()
          .optional()
          .describe('(Main only) JID of the target group. Defaults to current group.'),
      }),
      execute: async ({ prompt, schedule_type, schedule_value, context_mode, target_group_jid }) => {
        if (schedule_type === 'cron') {
          try {
            CronExpressionParser.parse(schedule_value);
          } catch {
            return `Invalid cron: "${schedule_value}". Use format like "0 9 * * *"`;
          }
        } else if (schedule_type === 'interval') {
          const ms = parseInt(schedule_value, 10);
          if (isNaN(ms) || ms <= 0) return `Invalid interval: "${schedule_value}". Must be positive ms.`;
        } else if (schedule_type === 'once') {
          if (/[Zz]$/.test(schedule_value) || /[+-]\d{2}:\d{2}$/.test(schedule_value)) {
            return `Timestamp must be local time without timezone suffix. Got "${schedule_value}"`;
          }
        }

        const targetJid = ctx.isMain && target_group_jid ? target_group_jid : ctx.chatJid;
        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        writeIpcFile(TASKS_DIR, {
          type: 'schedule_task',
          taskId,
          prompt,
          schedule_type,
          schedule_value,
          context_mode: context_mode || 'group',
          targetJid,
          createdBy: ctx.groupFolder,
          timestamp: new Date().toISOString(),
        });

        return `Task ${taskId} scheduled: ${schedule_type} - ${schedule_value}`;
      },
    }),

    list_tasks: tool({
      description:
        "List all scheduled tasks. From main: shows all tasks. From other groups: shows only that group's tasks.",
      parameters: z.object({}),
      execute: async () => {
        const tasksFile = path.join(IPC_DIR, 'current_tasks.json');
        if (!fs.existsSync(tasksFile)) return 'No scheduled tasks found.';
        try {
          const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
          const tasks = ctx.isMain
            ? allTasks
            : allTasks.filter((t: { groupFolder: string }) => t.groupFolder === ctx.groupFolder);
          if (tasks.length === 0) return 'No scheduled tasks found.';
          return tasks
            .map(
              (t: { id: string; prompt: string; schedule_type: string; schedule_value: string; status: string; next_run?: string }) =>
                `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`,
            )
            .join('\n');
        } catch (err) {
          return `Error reading tasks: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    pause_task: tool({
      description: 'Pause a scheduled task. It will not run until resumed.',
      parameters: z.object({ task_id: z.string().describe('The task ID to pause') }),
      execute: async ({ task_id }) => {
        writeIpcFile(TASKS_DIR, {
          type: 'pause_task',
          taskId: task_id,
          groupFolder: ctx.groupFolder,
          isMain: ctx.isMain,
          timestamp: new Date().toISOString(),
        });
        return `Task ${task_id} pause requested.`;
      },
    }),

    resume_task: tool({
      description: 'Resume a paused task.',
      parameters: z.object({ task_id: z.string().describe('The task ID to resume') }),
      execute: async ({ task_id }) => {
        writeIpcFile(TASKS_DIR, {
          type: 'resume_task',
          taskId: task_id,
          groupFolder: ctx.groupFolder,
          isMain: ctx.isMain,
          timestamp: new Date().toISOString(),
        });
        return `Task ${task_id} resume requested.`;
      },
    }),

    cancel_task: tool({
      description: 'Cancel and delete a scheduled task.',
      parameters: z.object({ task_id: z.string().describe('The task ID to cancel') }),
      execute: async ({ task_id }) => {
        writeIpcFile(TASKS_DIR, {
          type: 'cancel_task',
          taskId: task_id,
          groupFolder: ctx.groupFolder,
          isMain: ctx.isMain,
          timestamp: new Date().toISOString(),
        });
        return `Task ${task_id} cancellation requested.`;
      },
    }),

    update_task: tool({
      description: 'Update an existing scheduled task. Only provided fields are changed.',
      parameters: z.object({
        task_id: z.string().describe('The task ID to update'),
        prompt: z.string().optional().describe('New prompt for the task'),
        schedule_type: z.enum(['cron', 'interval', 'once']).optional(),
        schedule_value: z.string().optional(),
      }),
      execute: async ({ task_id, prompt, schedule_type, schedule_value }) => {
        const data: Record<string, string | undefined> = {
          type: 'update_task',
          taskId: task_id,
          groupFolder: ctx.groupFolder,
          isMain: String(ctx.isMain),
          timestamp: new Date().toISOString(),
        };
        if (prompt !== undefined) data.prompt = prompt;
        if (schedule_type !== undefined) data.schedule_type = schedule_type;
        if (schedule_value !== undefined) data.schedule_value = schedule_value;
        writeIpcFile(TASKS_DIR, data);
        return `Task ${task_id} update requested.`;
      },
    }),
  };
}
