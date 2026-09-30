// Hand-written TS mirrors of the Pydantic models in backend/models/models.py.
// Nothing infers across the Python boundary — keep this pair in sync in the same edit.

export type Role = "viewer" | "reviewer" | "admin";

export interface User {
  username: string;
  role: Role;
  created_at?: string | null;
}

export interface NeedsSetup {
  needs_setup: boolean;
}

export interface Document {
  id: string;
  title: string;
  source_type: string;
  trust: number;
  doc_date: string;
  status: "active" | "quarantined" | string;
  quarantine_reason: string | null;
  current_version_no: number;
  created_at: string;
}

export interface VersionEntry {
  seq: number;
  id: string;
  doc_id: string;
  version_no: number;
  text: string;
  author: string;
  reason: string;
  lineage: Record<string, unknown>;
  ts: string;
  prev_hash: string;
  hash: string;
}

export interface Proposal {
  kind: "replace" | "remove" | "none" | string;
  doc_id?: string | null;
  old_sentence?: string | null;
  new_sentence?: string | null;
}

export type ConflictType = "contradiction" | "duplicate" | "stale" | "unsupported";
export type ConflictStatus =
  | "open" | "hold" | "auto_applied" | "accepted" | "synthesized"
  | "kept_both" | "rejected" | "rolled_back" | "dismissed";
export type ConflictRoute = "auto" | "human" | "dismissed";

export interface Conflict {
  id: string;
  type: ConflictType | string;
  claim_a: string;
  claim_b: string | null;
  text_a: string;
  text_b: string | null;
  doc_a: string;
  doc_b: string | null;
  sim: number | null;
  confidence: number;
  route: ConflictRoute | string;
  proposal: Proposal;
  status: ConflictStatus | string;
  explanation: string;
  tie: boolean;
  created: string;
  doc_a_title?: string | null;
  doc_b_title?: string | null;
  trust_a?: number | null;
  trust_b?: number | null;
  date_a?: string | null;
  date_b?: string | null;
}

export interface ResolveOutcome {
  conflict: Conflict;
  versions: VersionEntry[];
}

export interface SuggestOutcome {
  merged: string | null;
}

export interface ScanRun {
  id: string;
  ts: string;
  actor: string;
  claims: number;
  pairs: number;
  seconds: number;
  found: number;
  auto_fixed: number;
  awaiting_human: number;
  dismissed: number;
  reindexed_docs: number;
}

export interface VerifyChainResult {
  ok: boolean;
  message: string;
  records?: number;
}

export interface VerifyResponse {
  ok: boolean;
  versions: VerifyChainResult;
  audit: VerifyChainResult;
  checked_at: string;
}

export interface AuditEntry {
  seq: number;
  id?: string;
  ts: string;
  actor: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
  prev_hash?: string;
  hash?: string;
}

export interface PipelineStrip {
  ingested: number;
  quarantined: number;
  claims_indexed: number;
  candidate_pairs: number;
  auto_fixed: number;
  awaiting_human: number;
}

export interface ActivityEntry {
  seq: number;
  ts: string;
  actor: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
}

export interface Stats {
  documents: number;
  quarantined: number;
  awaiting_human: number;
  auto_resolved: number;
  ledger_versions: number;
  pipeline: PipelineStrip;
  findings_by_type: Record<string, number>;
  recent_activity: ActivityEntry[];
  auto_apply_enabled: boolean;
  provider: { llm: string; embeddings: string };
  last_scan: ScanRun | null;
}

export interface PoisonSpan {
  start: number;
  end: number;
  label: string;
  kind: "pattern" | "hidden" | "zero_width";
}

export interface PoisonScan {
  score: number;
  pattern_score: number;
  flagged: boolean;
  ambiguous: boolean;
  hidden_present: boolean;
  hidden_count: number;
  zero_width_count: number;
  patterns_matched: string[];
  spans: PoisonSpan[];
  llm_label?: string;
}

export interface PoisonPayload {
  id: string;
  label: string;
  text: string;
}

export interface PoisonFireResult {
  injection: PoisonScan;
  doc: Document;
  quarantined: boolean;
  claims_before: number;
  claims_after: number;
  claims_unchanged: boolean;
}

export interface Metrics {
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
  ci: { precision: [number, number]; recall: [number, number]; f1: [number, number] };
}

export interface BenchmarkResult {
  docs: number;
  claims: number;
  candidate_pairs: number;
  found: number;
  planted_duplicate_pairs: number;
  seconds: number;
  ran_at: string;
}

export interface EvalSplit {
  labels: number;
  per_type: Record<string, Metrics>;
  false_positive_rate: number;
  macro_f1: number;
}

export interface ImportedReport {
  labels: number;
  per_type: Record<string, Metrics>;
  false_positive_rate: number;
  per_split: Record<string, EvalSplit>;
  note: string;
}

export interface EvalReport {
  id: string;
  ran_at: string;
  per_type: Record<string, Metrics>;
  false_positive_rate: number;
  benchmark: BenchmarkResult | null;
  labels: number;
  imported: ImportedReport | null;
  disclaimer: string;
}

export interface DatasetImportResult {
  rows: number;
  ingested: number;
  reused: number;
  quarantined: number;
  labels: number;
  splits: { tune: number; validate: number; test: number };
  warnings: string[];
}

export interface LlmPing {
  connected: boolean;
  provider: string;
  model?: string;
  detail: string;
}

export interface EvalResponse {
  report: EvalReport | null;
  disclaimer: string;
}

export interface Settings {
  trust: Record<string, number>;
  thresholds: Record<string, number>;
  auto_apply_enabled: boolean;
}

export interface LlmStatus {
  llm: string;
  embeddings: string;
  offline_mode: boolean;
  model?: string;
  degraded?: boolean;
  degraded_seconds?: number;
}

export interface LlmPing {
  connected: boolean;
  provider: string;
  model?: string;
  throttled?: boolean;
  detail: string;
}
