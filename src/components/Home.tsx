import { useQuery } from "convex/react";
import { CornerDownRight, PanelLeft, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { categoryTint, useCategories } from "../lib/categories";
import { useMe } from "../lib/identity";
import { cn, useNow } from "../lib/hooks";
import { relativeTime } from "../lib/time";
import { Avatar } from "./Avatar";
import { useShell } from "./Shell";
import { useCreateDoc } from "./useCreateDoc";

export function Home() {
  const me = useMe();
  const now = useNow();
  const docs = useQuery(api.docs.list, {});
  const users = useQuery(api.users.list);
  const { list: categories, byId, children, path, subtree, pathLabel } = useCategories();
  const [filter, setFilter] = useHomeFilter();
  const createDoc = useCreateDoc();
  const { sidebarOpen, toggleSidebar } = useShell();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // "none" is the Uncategorized group; documents whose category was just deleted count as that too.
  const groupOf = (d: { categoryId: Id<"categories"> | null }) =>
    d.categoryId && byId.has(d.categoryId) ? d.categoryId : "none";
  // A filter for a category someone deleted falls back to everything.
  const active = filter === "all" || filter === "none" || byId.has(filter as Id<"categories">) ? filter : "all";
  const activeCategory = byId.get(active as Id<"categories">);
  const activePath = activeCategory ? path(activeCategory._id) : [];
  // A category's filter and count include everything in its subcategories.
  const within = (key: string, d: { categoryId: Id<"categories"> | null }) => {
    const g = groupOf(d);
    if (key === "all") return true;
    if (key === "none" || g === "none") return key === g;
    return subtree(key as Id<"categories">).has(g);
  };
  const shown = (docs ?? []).filter((d) => within(active, d));
  const count = (key: string) => (docs ?? []).filter((d) => within(key, d)).length;
  // Picking a category with subcategories opens a row of them underneath, and so on down.
  const subRows = activePath.filter((c) => children(c._id).length > 0);

  return (
    <div className="scroll-thin h-full overflow-y-auto [scrollbar-gutter:stable]">
      <header className="flex h-14 items-center px-3">
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Show sidebar"
          >
            <PanelLeft size={18} />
          </button>
        )}
      </header>
      <div className="mx-auto max-w-4xl px-5 pt-[6vh] pb-16 sm:px-8">
        <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
          {greeting}, {me.name.split(" ")[0]}.
        </h1>
        <p className="mt-2 text-muted">What are we working on?</p>

        {!!categories?.length && (
          <div className="no-scrollbar -mx-5 mt-7 flex gap-1.5 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
            <FilterChip selected={active === "all"} onClick={() => setFilter("all")} label="All" />
            {children(null).map((c) => (
              <FilterChip
                key={c._id}
                selected={activePath[0]?._id === c._id}
                ancestor={activePath[0]?._id === c._id && active !== c._id}
                onClick={() => setFilter(c._id)}
                label={c.name}
                color={c.color}
                count={count(c._id)}
              />
            ))}
            {count("none") > 0 && (
              <FilterChip
                selected={active === "none"}
                onClick={() => setFilter("none")}
                label="Uncategorized"
                count={count("none")}
              />
            )}
          </div>
        )}
        {subRows.map((parent, i) => (
          <div
            key={parent._id}
            className="no-scrollbar -mx-5 mt-2 flex items-center gap-1.5 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0"
          >
            <CornerDownRight size={15} className="mr-0.5 shrink-0 text-muted" style={{ marginLeft: 8 + i * 16 }} />
            <FilterChip
              small
              selected={active === parent._id}
              onClick={() => setFilter(parent._id)}
              label={`All in ${parent.name}`}
            />
            {children(parent._id).map((c) => (
              <FilterChip
                key={c._id}
                small
                selected={activePath[i + 1]?._id === c._id}
                ancestor={activePath[i + 1]?._id === c._id && active !== c._id}
                onClick={() => setFilter(c._id)}
                label={c.name}
                color={c.color}
                count={count(c._id)}
              />
            ))}
          </div>
        ))}

        <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", categories?.length ? "mt-4" : "mt-8")}>
          <button
            onClick={() => createDoc(activeCategory?._id)}
            className="group flex min-h-30 flex-col items-start justify-between rounded-2xl border border-dashed border-line-strong p-4 text-left transition hover:border-ink-2 hover:bg-surface"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-ink text-bg transition group-hover:scale-105">
              <Plus size={18} />
            </span>
            <span>
              <span className="block font-medium">New document</span>
              <span className="text-sm text-muted">
                {activeCategory ? `In ${pathLabel(activeCategory._id)}` : "Idea, article, script…"}
              </span>
            </span>
          </button>
          {/* "All" shows the most recent; a category shows everything in it. */}
          {(active === "all" ? shown.slice(0, 11) : shown).map((d) => {
            const editor = users?.find((u) => u._id === d.lastEditedBy);
            const category = d.categoryId ? byId.get(d.categoryId) : undefined;
            // Inside a filter, the badge shows only the part of the path below it.
            const badge =
              category && category._id !== activeCategory?._id
                ? path(category._id)
                    .slice(activePath.length)
                    .map((c) => c.name)
                    .join(" / ")
                : "";
            return (
              <Link
                key={d._id}
                href={`/d/${d._id}`}
                className="flex min-h-30 flex-col rounded-2xl border border-line bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-float"
              >
                {category && badge && (
                  <span
                    className="mb-2 inline-flex max-w-full items-center gap-1.5 self-start rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={categoryTint(category.color)}
                  >
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: category.color }} />
                    <span className="truncate">{badge}</span>
                  </span>
                )}
                <div className={d.title ? "line-clamp-2 font-serif text-lg leading-snug font-medium" : "font-serif text-lg text-muted"}>
                  {d.title || "Untitled"}
                </div>
                {d.snippet && (
                  <p className="mt-1.5 line-clamp-2 font-serif text-sm leading-relaxed text-muted">{d.snippet}</p>
                )}
                <div className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-muted">
                  {editor && <Avatar name={editor.name} color={editor.color} size={16} />}
                  {editor && editor._id !== me._id ? `${editor.name} · ` : ""}
                  {relativeTime(d.updatedAt, now)}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** `ancestor`: a category whose subcategory is the one selected; it stays outlined to show the path. */
function FilterChip({
  selected,
  ancestor,
  small,
  onClick,
  label,
  color,
  count,
}: {
  selected: boolean;
  ancestor?: boolean;
  small?: boolean;
  onClick: () => void;
  label: string;
  color?: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border font-medium transition",
        small ? "h-7 px-2.5 text-[13px]" : "h-8 px-3 text-sm",
        ancestor
          ? "border-ink bg-surface text-ink"
          : selected
            ? "border-ink bg-ink text-bg"
            : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {label}
      {count !== undefined && (
        <span className={cn("text-xs tabular-nums", selected && !ancestor ? "opacity-70" : "text-muted")}>{count}</span>
      )}
    </button>
  );
}

const FILTER_KEY = "ideaboard.homeFilter";

/** "all", "none" (uncategorized) or a category id; remembered per browser. */
function useHomeFilter() {
  const [filter, setFilterState] = useState<string>(() => {
    try {
      return localStorage.getItem(FILTER_KEY) ?? "all";
    } catch {
      return "all";
    }
  });
  const setFilter = (f: string) => {
    setFilterState(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {}
  };
  return [filter, setFilter] as const;
}
