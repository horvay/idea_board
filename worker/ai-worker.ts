// AI worker: watches Convex for queued AI requests and runs each one through
// Claude Code (Agent SDK), using the Claude login already on this machine.
// Claude edits the document through tools that call Convex mutations, so every
// change streams live to everyone who has the document open.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  createSdkMcpServer,
  query,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { ConvexClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const CONVEX_URL = process.env.VITE_CONVEX_URL;
if (!CONVEX_URL) throw new Error("VITE_CONVEX_URL is not set (run `bun run dev` once to create .env.local)");

const MODEL = process.env.AI_MODEL || "claude-fable-5-1";
const MAX_CONCURRENT = 3;
const INLINE_DOC_LIMIT = 60_000; // characters of markdown to include in the prompt
const WORKSPACE = resolve(import.meta.dir, "../.ai-workspace");
mkdirSync(WORKSPACE, { recursive: true });

const convex = new ConvexClient(CONVEX_URL);
const active = new Map<string, Id<"docs"> | null>(); // requestId -> docId

const SYSTEM_PROMPT = `You are Claude, a writing partner built into "Idea Board", a shared document editor a small team (often a couple) uses to develop ideas, articles, scripts and plans together.

Several people may be looking at and typing in the document while you work. Your edits appear on their screens live, and a version is saved before and after you make changes, so they can always roll back. Work with that in mind:
- Make the change that was asked for. Don't rewrite or "improve" parts nobody asked about.
- Prefer edit_document with small, precise find/replace edits; use rewrite_document only for sweeping changes (restructuring, drafting from scratch, translating everything).
- The document is shown to you as Markdown. Supported formatting: headings (#, ##, ###), **bold**, *italic*, ~~strike~~, ==highlight==, \`code\`, links, bullet/numbered lists, task lists (- [ ] / - [x]), > quotes, fenced code blocks, and --- dividers. Don't use tables, images or HTML.
- If an edit fails because the text wasn't found, someone probably just changed it: call read_document and try again.
- If the request is a question or asks for feedback rather than changes, answer in chat and leave the document alone.
- Use web search/fetch when facts or research would help.

Your chat reply appears in a narrow side panel. Keep it short: say what you changed (or answer the question) in a few sentences. Never paste the whole document into the chat.`;

function errorText(err: unknown): string {
  if (err instanceof ConvexError) return String(err.data);
  if (err instanceof Error) return err.message;
  return String(err);
}

function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "mcp__doc__read_document":
      return "Read the document";
    case "mcp__doc__edit_document": {
      const n = Array.isArray(input.edits) ? input.edits.length : 1;
      return `Edited the document (${n} change${n === 1 ? "" : "s"})`;
    }
    case "mcp__doc__rewrite_document":
      return "Rewrote the document";
    case "mcp__doc__set_title":
      return `Set the title to “${String(input.title ?? "")}”`;
    case "WebSearch":
      return `Searched the web: ${String(input.query ?? "")}`;
    case "WebFetch":
      return `Read ${String(input.url ?? "a web page")}`;
    default:
      return `Used ${name}`;
  }
}

function docTools(requestId: Id<"aiRequests">) {
  const run = async (fn: () => Promise<string>) => {
    try {
      return { content: [{ type: "text" as const, text: await fn() }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: errorText(err) }], isError: true };
    }
  };

  return createSdkMcpServer({
    name: "doc",
    version: "1.0.0",
    tools: [
      tool(
        "read_document",
        "Read the current title and full content (Markdown) of the shared document. Others may have edited it since you last looked.",
        {},
        () =>
          run(async () => {
            const { title, markdown } = await convex.mutation(api.ai.readDoc, { requestId });
            return `Title: ${title || "(untitled)"}\n\n${markdown || "(the document is empty)"}`;
          }),
      ),
      tool(
        "edit_document",
        "Apply one or more find/replace edits to the document's Markdown. Each `find` must match exactly once (include enough surrounding text to be unique). Edits are applied in order, atomically.",
        {
          edits: z
            .array(
              z.object({
                find: z.string().describe("Exact Markdown text currently in the document"),
                replace: z.string().describe("Markdown to put in its place (may be empty to delete)"),
              }),
            )
            .min(1),
        },
        ({ edits }) =>
          run(async () => {
            await convex.mutation(api.ai.editDoc, { requestId, edits });
            return `Applied ${edits.length} edit${edits.length === 1 ? "" : "s"}.`;
          }),
      ),
      tool(
        "rewrite_document",
        "Replace the entire document body with new Markdown. Unchanged paragraphs are preserved as-is. Use for large restructures or first drafts.",
        { markdown: z.string() },
        ({ markdown }) =>
          run(async () => {
            await convex.mutation(api.ai.rewriteDoc, { requestId, markdown });
            return "Document rewritten.";
          }),
      ),
      tool(
        "set_title",
        "Set the document's title (shown above the body; don't repeat it as a heading in the body).",
        { title: z.string() },
        ({ title }) =>
          run(async () => {
            await convex.mutation(api.ai.setTitle, { requestId, title });
            return "Title updated.";
          }),
      ),
    ],
  });
}

const ALLOWED_TOOLS = [
  "mcp__doc__read_document",
  "mcp__doc__edit_document",
  "mcp__doc__rewrite_document",
  "mcp__doc__set_title",
  "WebSearch",
  "WebFetch",
];

function buildPrompt(job: {
  prompt: string;
  selection?: string;
  requesterName: string;
  title: string;
  markdown: string;
}): string {
  const parts = [`${job.requesterName} asks:\n${job.prompt}`];
  if (job.selection) {
    parts.push(
      `They have this passage selected (the request most likely refers to it):\n<selection>\n${job.selection}\n</selection>`,
    );
  }
  if (job.markdown.length <= INLINE_DOC_LIMIT) {
    parts.push(
      `Current document (as of this request):\n<document title="${job.title.replace(/"/g, "'") || "untitled"}">\n${job.markdown || "(empty)"}\n</document>`,
    );
  } else {
    parts.push("The document is long; call read_document to see it.");
  }
  return parts.join("\n\n");
}

async function runRequest(requestId: Id<"aiRequests">) {
  const job = await convex.mutation(api.ai.claim, { requestId });
  if (!job) {
    active.delete(requestId);
    return;
  }
  console.log(`[ai] ${job.requesterName} (${job.effort} effort): ${job.prompt.slice(0, 80)}`);

  const abort = new AbortController();
  const unsubscribe = convex.onUpdate(api.ai.status, { requestId }, (status) => {
    if (status === "cancelled") abort.abort();
  });

  let committed = "";
  let partial = "";
  let lastPush = 0;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  const current = () => [committed, partial].filter(Boolean).join("\n\n");
  const pushResponse = (force = false) => {
    const send = () => {
      lastPush = Date.now();
      pushTimer = null;
      convex.mutation(api.ai.progress, { requestId, response: current() }).catch(() => {});
    };
    if (force) {
      if (pushTimer) clearTimeout(pushTimer);
      send();
    } else if (!pushTimer) {
      pushTimer = setTimeout(send, Math.max(0, 250 - (Date.now() - lastPush)));
    }
  };
  const logActivity = (activity: string) =>
    convex.mutation(api.ai.progress, { requestId, activity }).catch(() => {});

  const attempt = async (resume: string | undefined) => {
    let sessionId: string | undefined;
    let error: string | undefined;
    const q = query({
      prompt: buildPrompt(job),
      options: {
        systemPrompt: SYSTEM_PROMPT,
        model: MODEL,
        effort: job.effort,
        cwd: WORKSPACE,
        settingSources: [],
        tools: ["WebSearch", "WebFetch"],
        // Only web tools plus our document tools exist; anything else is refused
        // rather than prompting, since nobody is at a terminal to approve it.
        allowedTools: ALLOWED_TOOLS,
        permissionMode: "dontAsk",
        mcpServers: { doc: docTools(requestId) },
        includePartialMessages: true,
        abortController: abort,
        resume,
        maxTurns: 40,
      },
    });
    for await (const msg of q) {
      if (msg.type === "stream_event") {
        const ev = msg.event;
        if (ev.type === "content_block_start" && ev.content_block.type === "text") {
          if (partial) committed = current();
          partial = "";
        } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          partial += ev.delta.text;
          pushResponse();
        }
      } else if (msg.type === "assistant") {
        partial = "";
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text.trim()) {
            committed = [committed, block.text.trim()].filter(Boolean).join("\n\n");
          } else if (block.type === "tool_use") {
            logActivity(toolLabel(block.name, (block.input ?? {}) as Record<string, unknown>));
          }
        }
        pushResponse(true);
      } else if (msg.type === "result") {
        sessionId = msg.session_id;
        if (msg.subtype !== "success") {
          error = "errors" in msg && Array.isArray(msg.errors) && msg.errors.length
            ? msg.errors.join("; ")
            : `Claude stopped early (${msg.subtype}).`;
        } else if (msg.is_error) {
          error = msg.result || "Claude reported an error.";
        }
      }
    }
    return { sessionId, error };
  };

  let outcome: { sessionId?: string; error?: string };
  try {
    try {
      outcome = await attempt(job.sessionId);
    } catch (err) {
      // A stale session (e.g. its transcript was deleted) shouldn't block the
      // request; retry once as a fresh conversation if nothing happened yet.
      if (!job.sessionId || abort.signal.aborted || committed) throw err;
      console.warn(`[ai] resume failed, starting fresh: ${errorText(err)}`);
      outcome = await attempt(undefined);
    }
  } catch (err) {
    outcome = { error: abort.signal.aborted ? undefined : errorText(err) };
  }
  if (pushTimer) clearTimeout(pushTimer);
  unsubscribe();
  active.delete(requestId);

  await convex.mutation(api.ai.finish, {
    requestId,
    response: current(),
    sessionId: outcome.sessionId,
    error: outcome.error,
  });
  if (outcome.error) console.error(`[ai] request failed: ${outcome.error}`);
  pump();
}

let queue: { _id: Id<"aiRequests">; docId: Id<"docs"> }[] = [];

function pump() {
  for (const req of queue) {
    if (active.size >= MAX_CONCURRENT) break;
    if (active.has(req._id)) continue;
    // One request per document at a time, so follow-ups see earlier edits
    // and continue the same Claude conversation.
    if ([...active.values()].includes(req.docId)) continue;
    active.set(req._id, req.docId);
    runRequest(req._id).catch((err) => {
      console.error("[ai] unexpected error", err);
      active.delete(req._id);
    });
  }
}

async function main() {
  await convex.mutation(api.ai.resetStale, {});
  await convex.mutation(api.ai.heartbeat, {});
  setInterval(() => convex.mutation(api.ai.heartbeat, {}).catch(() => {}), 10_000);
  convex.onUpdate(api.ai.queued, {}, (rows) => {
    queue = rows.map((r) => ({ _id: r._id, docId: r.docId }));
    pump();
  });
  console.log(`[ai] worker ready (model: ${MODEL})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
