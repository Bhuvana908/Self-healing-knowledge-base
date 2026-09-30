export function FullSplash({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 text-sm text-slate-500">
      {label}…
    </div>
  );
}
