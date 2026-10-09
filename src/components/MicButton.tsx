import { LoaderCircle, Mic, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "../lib/hooks";
import type { Dictation } from "../lib/useDictation";

const SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘⇧Space" : "Ctrl+Shift+Space";

/** Starts and stops a dictation; while recording, its ring follows your voice. */
export function MicButton({
  dictation,
  shortcut,
  className,
  iconSize = 17,
}: {
  dictation: Dictation;
  shortcut?: boolean;
  className?: string;
  iconSize?: number;
}) {
  const { phase, level, toggle } = dictation;
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (phase !== "recording") return;
    let frame = 0;
    const tick = () => {
      ref.current?.style.setProperty("--level", level().toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [phase, level]);

  const label =
    phase === "recording"
      ? "Stop and insert (Esc cancels)"
      : phase === "transcribing"
        ? "Transcribing… (Esc cancels)"
        : phase === "starting"
          ? "Starting the microphone…"
          : `Dictate${shortcut ? ` (${SHORTCUT})` : ""}`;

  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={phase === "recording"}
      aria-busy={phase === "transcribing" || phase === "starting"}
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggle}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg transition",
        phase === "recording"
          ? "mic-live bg-danger text-white"
          : phase === "idle"
            ? "text-ink-2 hover:bg-surface-2 hover:text-ink"
            : "cursor-default text-ink-2",
        className,
      )}
    >
      {phase === "recording" ? (
        <Square size={iconSize - 4} fill="currentColor" />
      ) : phase === "transcribing" ? (
        <LoaderCircle size={iconSize} className="animate-spin" />
      ) : (
        <Mic size={iconSize} className={cn(phase === "starting" && "animate-pulse")} />
      )}
    </button>
  );
}
