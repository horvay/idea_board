import { useMutation, useQuery } from "convex/react";
import { FileText, PanelLeftClose, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useMe } from "../lib/identity";
import { cn, useNow } from "../lib/hooks";
import { relativeTime } from "../lib/time";
import { Avatar } from "./Avatar";
import { ProfileDialog } from "./ProfileDialog";
import { useShell } from "./Shell";
import { useCreateDoc } from "./useCreateDoc";

const ONLINE_MS = 30_000;

export function Sidebar({ onSwitchUser }: { onSwitchUser: () => void }) {
  const me = useMe();
  const now = useNow(10_000);
  const { toggleSidebar } = useShell();
  const [showTrash, setShowTrash] = useState(false);
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const docs = useQuery(api.docs.list, { trashed: showTrash });
  const users = useQuery(api.users.list);
  const online = useQuery(api.presence.online);
  const worker = useQuery(api.ai.workerStatus);
  const createDoc = useCreateDoc();
  const [, params] = useRoute("/d/:id");

  const userById = useMemo(() => new Map(users?.map((u) => [u._id, u]) ?? []), [users]);
  const viewers = useMemo(() => {
    const m = new Map<string, { userId: Id<"users">; name: string; color: string }[]>();
    for (const p of online ?? []) {
      if (now - p.lastSeen > ONLINE_MS || p.userId === me._id) continue;
      const list = m.get(p.docId) ?? [];
      if (!list.some((x) => x.userId === p.userId)) list.push(p);
      m.set(p.docId, list);
    }
    return m;
  }, [online, now, me._id]);

  const filtered = (docs ?? []).filter((d) =>
    (d.title || "Untitled").toLowerCase().includes(search.trim().toLowerCase()),
  );
  const claudeOffline = worker !== undefined && (!worker || now - worker.lastSeen > 35_000);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="grid size-7 place-items-center rounded-lg bg-ink font-serif text-sm font-bold text-bg">
          I
        </div>
        <span className="font-semibold tracking-tight">Idea Board</span>
        <button
          onClick={toggleSidebar}
          className="ml-auto grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
          aria-label="Hide sidebar"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      {showTrash ? (
        <div className="flex items-center justify-between px-4 pt-1 pb-2">
          <span className="text-sm font-semibold">Trash</span>
          <button
            onClick={() => setShowTrash(false)}
            className="rounded-lg px-2.5 py-1 text-sm font-medium text-accent hover:bg-surface-2"
          >
            Done
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2 px-3">
            <button
              onClick={() => createDoc()}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium text-ink shadow-soft transition hover:border-line-strong"
            >
              <Plus size={17} /> New document
            </button>
            <label className="flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm focus-within:border-line-strong">
              <Search size={15} className="text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                aria-label="Search documents"
                className="w-full bg-transparent outline-none placeholder:text-muted"
              />
            </label>
          </div>
          <div className="mt-3 px-4 pb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
            Documents
          </div>
        </>
      )}

      <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {docs === undefined && <p className="px-3 py-2 text-sm text-muted">Loading…</p>}
        {docs && filtered.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted">
            {showTrash ? "Trash is empty." : search ? "No matches." : "No documents yet."}
          </p>
        )}
        {(showTrash ? (docs ?? []) : filtered).map((d) =>
          showTrash ? (
            <TrashRow key={d._id} docId={d._id} title={d.title} onRestored={() => setShowTrash(false)} />
          ) : (
            <Link
              key={d._id}
              href={`/d/${d._id}`}
              className={cn(
                "group flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition",
                params?.id === d._id ? "bg-surface shadow-soft" : "hover:bg-surface-2/70",
              )}
            >
              <FileText size={16} className="mt-0.5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <div className={cn("truncate text-sm font-medium", !d.title && "text-muted")}>
                  {d.title || "Untitled"}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {d.lastEditedBy && d.lastEditedBy !== me._id && userById.get(d.lastEditedBy)
                    ? `${userById.get(d.lastEditedBy)!.name} · `
                    : ""}
                  {relativeTime(d.updatedAt, now)}
                </div>
              </div>
              <div className="flex -space-x-1.5 pt-0.5">
                {viewers.get(d._id)?.map((v) => (
                  <Avatar key={v.userId} name={v.name} color={v.color} size={20} ring title={`${v.name} is here`} />
                ))}
              </div>
            </Link>
          ),
        )}
      </nav>

      <div className="space-y-1 border-t border-line p-2">
        {!showTrash && (
          <button
            onClick={() => setShowTrash(true)}
            className="flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-sm text-ink-2 hover:bg-surface-2"
          >
            <Trash2 size={16} className="text-muted" /> Trash
          </button>
        )}
        {claudeOffline && (
          <div
            className="mx-1 flex items-center gap-2 rounded-lg bg-amber-500/12 px-2.5 py-2 text-xs text-amber-600"
            title="Start the app with `bun run dev` to run the AI worker"
          >
            <span className="size-1.5 rounded-full bg-amber-500" /> Claude is offline
          </div>
        )}
        <button
          onClick={() => setProfileOpen(true)}
          className="flex h-11 w-full items-center gap-2.5 rounded-xl px-2 hover:bg-surface-2"
          aria-label="Profile and settings"
        >
          <Avatar name={me.name} color={me.color} size={28} />
          <span className="truncate text-sm font-medium">{me.name}</span>
        </button>
      </div>
      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} onSwitchUser={onSwitchUser} />}
    </div>
  );
}

function TrashRow({ docId, title, onRestored }: { docId: Id<"docs">; title: string; onRestored: () => void }) {
  const setTrashed = useMutation(api.docs.setTrashed);
  const deleteForever = useMutation(api.docs.deleteForever);
  const [, navigate] = useLocation();
  const [confirming, setConfirming] = useState(false);
  const btn = "rounded-lg px-2 py-1 text-xs font-medium hover:bg-surface";
  return (
    <div className="rounded-xl px-2.5 py-2 hover:bg-surface-2/70">
      <div className={cn("truncate text-sm", !title && "text-muted")}>{title || "Untitled"}</div>
      {confirming ? (
        <div className="mt-1 flex items-center gap-1 text-xs">
          <span className="mr-auto text-danger">Delete forever, with its history?</span>
          <button onClick={() => setConfirming(false)} className={btn}>
            Cancel
          </button>
          <button onClick={() => deleteForever({ docId })} className={cn(btn, "text-danger")}>
            Delete
          </button>
        </div>
      ) : (
        <div className="mt-1 flex gap-1">
          <button
            onClick={async () => {
              await setTrashed({ docId, trashed: false });
              onRestored();
              navigate(`/d/${docId}`);
            }}
            className={cn(btn, "-ml-2 text-accent")}
          >
            Restore
          </button>
          <button onClick={() => setConfirming(true)} className={cn(btn, "text-muted hover:text-danger")}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
