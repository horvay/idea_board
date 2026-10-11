import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { COMEDY_STYLES } from "../shared/comedy";

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

// How hard Claude thinks before answering; picked with the slider in the Claude panel.
export const aiEffort = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));

// Optional comedy style for a request; picked from the dropdown in the Claude panel.
export const aiComedyStyle = v.union(...COMEDY_STYLES.map((s) => v.literal(s.id)));

// A passage of a document quoted in its chat. `from`/`to` are where it was
// when quoted; clients find it again by its text as the document changes.
export const chatQuote = v.object({ text: v.string(), from: v.number(), to: v.number() });

export default defineSchema({
  users: defineTable({
    name: v.string(),
    color: v.string(),
  }),

  // Sections that documents are filed under in the sidebar. A document is in
  // at most one. Categories nest; deleting one moves its documents and
  // subcategories up a level.
  categories: defineTable({
    name: v.string(),
    color: v.string(),
    // Missing for top-level categories.
    parentId: v.optional(v.id("categories")),
    // Position among its siblings, lowest first. Rewritten when people reorder.
    order: v.number(),
    createdBy: v.id("users"),
  }).index("by_order", ["order"]),

  docs: defineTable({
    title: v.string(),
    categoryId: v.optional(v.id("categories")),
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
  })
    .index("by_trashed_updated", ["trashed", "updatedAt"])
    .index("by_category", ["categoryId"]),

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
    // Missing on requests made before the effort slider existed.
    effort: v.optional(aiEffort),
    comedyStyle: v.optional(aiComedyStyle),
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

  // The people's chat beside each document (the Chat panel).
  chatMessages: defineTable({
    docId: v.id("docs"),
    authorId: v.id("users"),
    // Empty when the message is only a quoted passage.
    text: v.string(),
    quote: v.optional(chatQuote),
    // The message this one answers.
    replyTo: v.optional(v.id("chatMessages")),
    // Made by the sender's browser, so its optimistic copy and the saved one
    // are the same message on screen.
    clientId: v.optional(v.string()),
    // Set when its author deletes it. The row stays so replies to it can say
    // what they answered, and so "Undo" can bring it back.
    deletedAt: v.optional(v.number()),
  }).index("by_doc", ["docId"]),

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
    // Last keystroke in the chat box, for "… is typing".
    typingAt: v.optional(v.number()),
  })
    .index("by_doc", ["docId"])
    .index("by_session", ["sessionId"])
    .index("by_lastSeen", ["lastSeen"]),
});
