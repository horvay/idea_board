import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { EMPTY_DOC } from "../shared/extensions";
import { prosemirrorSync } from "./sync";
import { takeSnapshot } from "./snapshots";

export const list = query({
  args: { trashed: v.optional(v.boolean()) },
  handler: async (ctx, { trashed }) => {
    const docs = await ctx.db
      .query("docs")
      .withIndex("by_trashed_updated", (q) => q.eq("trashed", trashed ?? false))
      .order("desc")
      .collect();
    return docs.map((d) => ({
      _id: d._id,
      _creationTime: d._creationTime,
      title: d.title,
      updatedAt: d.updatedAt,
      lastEditedBy: d.lastEditedBy,
      snippet: d.snippet ?? "",
    }));
  },
});

export const get = query({
  args: { docId: v.string() },
  handler: async (ctx, { docId }) => {
    const id = ctx.db.normalizeId("docs", docId);
    if (!id) return null;
    const doc = await ctx.db.get(id);
    if (!doc) return null;
    return {
      _id: doc._id,
      _creationTime: doc._creationTime,
      title: doc.title,
      trashed: doc.trashed,
      updatedAt: doc.updatedAt,
      createdBy: doc.createdBy,
      hasAiConversation: !!doc.aiSessionId,
      conversationStartedAt: doc.conversationStartedAt ?? 0,
    };
  },
});

export const create = mutation({
  args: { userId: v.id("users"), title: v.optional(v.string()) },
  handler: async (ctx, { userId, title }) => {
    const now = Date.now();
    const docId = await ctx.db.insert("docs", {
      title: title ?? "",
      createdBy: userId,
      updatedAt: now,
      lastEditedBy: userId,
      trashed: false,
      lastChangedAt: now,
      lastSnapshotAt: 0,
      lastSnapshotVersion: -1,
      pendingAuthors: [userId],
    });
    await prosemirrorSync.create(ctx, docId, EMPTY_DOC);
    await takeSnapshot(ctx, docId, "initial", { authors: [userId] });
    return docId;
  },
});

export const rename = mutation({
  args: { docId: v.id("docs"), userId: v.id("users"), title: v.string() },
  handler: async (ctx, { docId, userId, title }) => {
    const doc = await ctx.db.get(docId);
    if (!doc || doc.title === title) return;
    const now = Date.now();
    await ctx.db.patch(docId, {
      title: title.slice(0, 200),
      updatedAt: now,
      lastChangedAt: now,
      lastEditedBy: userId,
      pendingAuthors: doc.pendingAuthors.includes(userId)
        ? doc.pendingAuthors
        : [...doc.pendingAuthors, userId],
    });
  },
});

/** Called (throttled) by clients while their user is typing. */
export const touch = mutation({
  args: { docId: v.id("docs"), userId: v.id("users") },
  handler: async (ctx, { docId, userId }) => {
    const doc = await ctx.db.get(docId);
    if (!doc) return;
    const now = Date.now();
    await ctx.db.patch(docId, {
      updatedAt: now,
      lastChangedAt: now,
      lastEditedBy: userId,
      pendingAuthors: doc.pendingAuthors.includes(userId)
        ? doc.pendingAuthors
        : [...doc.pendingAuthors, userId],
    });
  },
});

export const setTrashed = mutation({
  args: { docId: v.id("docs"), trashed: v.boolean() },
  handler: async (ctx, { docId, trashed }) => {
    await ctx.db.patch(docId, { trashed });
  },
});

export const deleteForever = mutation({
  args: { docId: v.id("docs") },
  handler: async (ctx, { docId }) => {
    const doc = await ctx.db.get(docId);
    if (!doc?.trashed) throw new Error("Only trashed documents can be deleted");
    for (const table of ["versions", "aiRequests", "presence"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_doc", (q) => q.eq("docId", docId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await ctx.db.delete(docId);
  },
});
