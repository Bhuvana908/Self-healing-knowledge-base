import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";

import { ApiError, getStoredSessionUser } from "@/lib/api";
import type { DatasetImportResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Labeled-dataset import: multipart upload, so it bypasses the JSON fetch helpers.
async function uploadDataset(file: File): Promise<DatasetImportResult> {
  const form = new FormData();
  form.append("file", file);
  const sessionUser = getStoredSessionUser();
  const res = await fetch("/api/admin/dataset/import", {
    method: "POST",
    credentials: "include",
    headers: sessionUser ? { "X-Session-User": sessionUser } : undefined,
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return (await res.json()) as DatasetImportResult;
}

export function DatasetImportCard() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  const upload = useMutation({
    mutationFn: uploadDataset,
    onSuccess: (r) => {
      toast.success(`Imported ${r.rows} rows — ${r.ingested} new documents, ${r.labels} labels`, {
        description: `Splits: ${r.splits.tune} tune / ${r.splits.validate} validate / ${r.splits.test} test. Run the evaluation to score them.`,
      });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["evaluation"] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? (e.body as { detail?: string } | null)?.detail : null;
      toast.error(detail ?? "Import failed");
    },
  });

  const result = upload.data;

  return (
    <Card data-testid="dataset-import-card">
      <CardHeader>
        <CardTitle className="text-base">Labeled dataset import</CardTitle>
        <CardDescription>
          Score the engine against your own documents. CSV or JSON with columns{" "}
          <code className="font-mono text-xs">title, text, source_type, doc_date, label, pair_title</code>.
          Labels: contradiction, duplicate, stale (need a pair_title), unsupported, injection, benign, clean.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/admin/dataset/template"
            download
            data-testid="btn-download-template"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Download template
          </a>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            data-testid="dataset-file-input"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFileName(f.name);
                upload.mutate(f);
              }
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            data-testid="btn-upload-dataset"
            disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" /> {upload.isPending ? "Importing…" : "Upload CSV / JSON"}
          </Button>
          {fileName && <span className="text-xs text-slate-500">{fileName}</span>}
        </div>

        {result && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm" data-testid="dataset-import-result">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><span className="text-slate-500">Rows</span><div className="font-semibold">{result.rows}</div></div>
              <div><span className="text-slate-500">Ingested</span><div className="font-semibold">{result.ingested}</div></div>
              <div><span className="text-slate-500">Quarantined</span><div className="font-semibold text-rose-700">{result.quarantined}</div></div>
              <div><span className="text-slate-500">Labels</span><div className="font-semibold">{result.labels}</div></div>
            </div>
            <div className="text-xs text-slate-600">
              Deterministic 60/20/20 split — tune {result.splits.tune} · validate {result.splits.validate} · test{" "}
              {result.splits.test} (the test slice is never used for tuning).
            </div>
            {result.warnings.length > 0 && (
              <ul className="list-inside list-disc text-xs text-amber-700" data-testid="dataset-import-warnings">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
