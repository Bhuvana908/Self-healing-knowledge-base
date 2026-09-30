import { wordDiff } from "@/lib/diff";
import { cn } from "@/lib/utils";

// Side-by-side word-level diff viewer. Deletions highlighted red on the left pane,
// additions green on the right pane.
export function WordDiff({
  before,
  after,
  beforeLabel,
  afterLabel,
  testId,
}: {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  testId?: string;
}) {
  const { left, right } = wordDiff(before, after);
  const render = (ops: { type: string; word: string }[]) =>
    ops.map((op, idx) => (
      <span
        key={idx}
        className={cn(
          op.type === "del" && "bg-rose-100 text-rose-800 rounded-sm",
          op.type === "add" && "bg-emerald-100 text-emerald-800 rounded-sm",
        )}
      >
        {op.word}
      </span>
    ));
  return (
    <div data-testid={testId ?? "word-diff-container"} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 mb-2">{beforeLabel}</div>
        <p className="text-sm leading-6 text-slate-800 whitespace-pre-wrap break-words">{render(left)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 mb-2">{afterLabel}</div>
        <p className="text-sm leading-6 text-slate-800 whitespace-pre-wrap break-words">{render(right)}</p>
      </div>
    </div>
  );
}
