import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const versionKind = v.union(
  v.literal("initial"),
  v.literal("auto"),
  v.literal("manual"),
  v.literal("ai-before"),
  v.literal("ai-after"),
  v.literal("before-restore"),
  v.literal("restore"),
);

export const aiStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("error"),
  v.literal("cancelled"),
);

export default defineSchema({
  users: defineTable({
    name: v.string(),
    color: v.string(),
  }),

  docs: defineTable({
    title: v.string(),
    createdBy: v.id("users"),
    updatedAt: v.number(),
    lastEditedBy: v.optional(v.id("users")),
    trashed: v.boolean(),
    // Set whenever the content changes; the snapshot cron compares it with
    // lastSnapshotAt to find documents that need a new version.
    lastChangedAt: v.number(),
    lastSnapshotAt: v.number(),
    lastSnapshotVersion: v.number(),
    // People who edited since the last snapshot, credited on the next one.
    pendingAuthors: v.array(v.id("users")),
    // Claude Agent SDK session, so follow-up requests keep their context.
    aiSessionId: v.optional(v.string()),
    // "New conversation" moves this forward; the chat panel hides older requests.
    conversationStartedAt: v.optional(v.number()),
    // Start of the text, for previews on the home screen.
    snippet: v.optional(v.string()),
  }).index("by_trashed_updated", ["trashed", "updatedAt"]),

  versions: defineTable({
    docId: v.id("docs"),
    kind: versionKind,
    label: v.optional(v.string()),
    title: v.string(),
    content: v.string(), // ProseMirror JSON
    markdown: v.string(),
    pmVersion: v.number(),
    authors: v.array(v.id("users")),
    byAi: v.boolean(),
    aiRequestId: v.optional(v.id("aiRequests")),
    words: v.number(),
    added: v.number(),
    removed: v.number(),
  }).index("by_doc", ["docId"]),

  aiRequests: defineTable({
    docId: v.id("docs"),
    prompt: v.string(),
    selection: v.optional(v.string()),
    requestedBy: v.id("users"),
    status: aiStatus,
    response: v.string(),
    // Short human-readable log of what Claude is doing ("Reading the document").
    activity: v.array(v.string()),
    editCount: v.number(),
    // The version to go back to if this request's changes are undone.
    beforeVersionId: v.optional(v.id("versions")),
    // Where Claude's latest edit landed, so editors can briefly highlight it.
    lastEdit: v.optional(v.object({ from: v.number(), to: v.number(), at: v.number() })),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_doc", ["docId"]),

  // Heartbeat from the AI worker process, so the UI can show if Claude is reachable.
  workers: defineTable({
    name: v.string(),
    lastSeen: v.number(),
  }).index("by_name", ["name"]),

  presence: defineTable({
    docId: v.id("docs"),
    sessionId: v.string(),
    userId: v.id("users"),
    lastSeen: v.number(),
    cursor: v.optional(v.object({ anchor: v.number(), head: v.number() })),
  })
    .index("by_doc", ["docId"])
    .index("by_session", ["sessionId"])
    .index("by_lastSeen", ["lastSeen"]),
});
