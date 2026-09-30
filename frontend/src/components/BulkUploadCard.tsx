import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderUp } from "lucide-react";

import { ApiError } from "@/lib/api";
import type { BulkUploadResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Bulk document upload: multipart, so it bypasses the JSON fetch helpers.
async function uploadDocuments(file: File): Promise<BulkUploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/documents/bulk", { method: "POST", body: form });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return (await res.json()) as BulkUploadResult;
}

export function BulkUploadCard() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  const upload = useMutation({
    mutationFn: uploadDocuments,
    onSuccess: (r) => {
      toast.success(`${r.ingested} of ${r.found} documents ingested`, {
        description: `${r.quarantined} quarantined by the injection scan · ${r.skipped_duplicate_titles} skipped (title already in the KB) · ${r.docs_total} documents total. Run a scan to detect faults.`,
      });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["ledger", "verify"] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? (e.body as { detail?: string } | null)?.detail : null;
      toast.error(detail ?? "Upload failed");
    },
  });

  return (
    <Card data-testid="bulk-upload-card">
      <CardHeader>
        <CardTitle className="text-base">Upload your own documents</CardTitle>
        <CardDescription>
          Bring your real knowledge base in: CSV, JSON, JSON Lines, .txt or .md. Every file goes
          through the same pipeline — the injection scan runs before anything is indexed.
          Columns/keys: <code className="font-mono text-xs">title</code>,{" "}
          <code className="font-mono text-xs">text</code> (optional{" "}
          <code className="font-mono text-xs">source_type</code>,{" "}
          <code className="font-mono text-xs">doc_date</code>). No labels needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json,.jsonl,.ndjson,.txt,.md"
          className="hidden"
          data-testid="bulk-upload-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setFileName(f.name);
            upload.mutate(f);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          data-testid="bulk-upload-choose-button"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          <FolderUp className="mr-2 h-4 w-4" />
          {upload.isPending ? "Uploading…" : "Choose file"}
        </Button>
        <span className="text-xs text-slate-500" data-testid="bulk-upload-filename">
          {fileName || "No file selected"}
        </span>
        {upload.data && (
          <span className="text-xs font-medium text-emerald-700" data-testid="bulk-upload-result">
            {upload.data.ingested} ingested · {upload.data.quarantined} quarantined ·{" "}
            {upload.data.skipped_duplicate_titles} skipped
          </span>
        )}
      </CardContent>
    </Card>
  );
}
