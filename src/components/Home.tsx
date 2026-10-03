import { useQuery } from "convex/react";
import { PanelLeft, Plus } from "lucide-react";
import { Link } from "wouter";
import { api } from "../../convex/_generated/api";
import { useMe } from "../lib/identity";
import { useNow } from "../lib/hooks";
import { relativeTime } from "../lib/time";
import { Avatar } from "./Avatar";
import { useShell } from "./Shell";
import { useCreateDoc } from "./useCreateDoc";

export function Home() {
  const me = useMe();
  const now = useNow();
  const docs = useQuery(api.docs.list, {});
  const users = useQuery(api.users.list);
  const createDoc = useCreateDoc();
  const { sidebarOpen, toggleSidebar } = useShell();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="scroll-thin h-full overflow-y-auto">
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

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button
            onClick={() => createDoc()}
            className="group flex min-h-30 flex-col items-start justify-between rounded-2xl border border-dashed border-line-strong p-4 text-left transition hover:border-ink-2 hover:bg-surface"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-ink text-bg transition group-hover:scale-105">
              <Plus size={18} />
            </span>
            <span>
              <span className="block font-medium">New document</span>
              <span className="text-sm text-muted">Idea, article, script…</span>
            </span>
          </button>
          {docs?.slice(0, 11).map((d) => {
            const editor = users?.find((u) => u._id === d.lastEditedBy);
            return (
              <Link
                key={d._id}
                href={`/d/${d._id}`}
                className="flex min-h-30 flex-col rounded-2xl border border-line bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-float"
              >
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
