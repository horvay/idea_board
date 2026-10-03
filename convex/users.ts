import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("users").collect(),
});

export const get = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const id = ctx.db.normalizeId("users", userId);
    return id ? ctx.db.get(id) : null;
  },
});

export const create = mutation({
  args: { name: v.string(), color: v.string() },
  handler: async (ctx, { name, color }) =>
    ctx.db.insert("users", { name: name.trim().slice(0, 40) || "Someone", color }),
});

export const update = mutation({
  args: { userId: v.id("users"), name: v.string(), color: v.string() },
  handler: async (ctx, { userId, name, color }) => {
    await ctx.db.patch(userId, { name: name.trim().slice(0, 40) || "Someone", color });
  },
});
