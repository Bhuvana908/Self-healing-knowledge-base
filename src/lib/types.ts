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
  kind: "replace" | "remove" | "synthesize" | string;
  doc_id?: string | null;
  old_sentence?: string | null;
  new_sentence?: string | null;
}

export interface SplitBefore {
  originalContent: string;
  problemDescription: string;
  conflictingSource: string;
  contradictionExcerpt: string;
}

export interface SplitAfter {
  proposedContent: string;
  changeSummary: string;
  evidence: string;
  sources: Array<{ title: string; type: string; date: string; trust: number }>;
  confidence: number;
  rationale: string;
}

export type ConflictType = "contradiction" | "duplicate" | "stale" | "unsupported" | "policy_conflict";
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
  before?: SplitBefore;
  after?: SplitAfter;
}

export interface HealthFactor {
  score: number;
  issuesCount: number;
  weight: string;
  description: string;
  details: string[];
}

export interface ExplainabilityItem {
  id: string;
  title: string;
  whatDetected: string;
  whyDetected: string;
  affectedDocuments: string[];
  confidence: number;
  evidence: string;
  recommendedAction: string;
  scoreImpact: string;
}

export interface HealthScoreResponse {
  overallScore: number;
  status: "EXCELLENT" | "GOOD" | "DEGRADED" | "CRITICAL";
  timestamp: string;
  metrics: {
    totalDocuments: number;
    activeDocuments: number;
    quarantinedDocuments: number;
    openConflicts: number;
    criticalVulnerabilities: number;
    highVulnerabilities: number;
    ledgerBlocksVerified: number;
  };
  breakdown: Record<string, HealthFactor>;
  explainability: ExplainabilityItem[];
}

export interface RedTeamFinding {
  id: string;
  title: string;
  category: "Contradiction" | "Unsupported Claim" | "Outdated Policy" | "Prompt Injection" | "Hidden Content" | "Unverified Mutation" | "Dangling Dependency";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  affectedDocId: string;
  affectedDocTitle: string;
  contentSnippet: string;
  evidence: string;
  explanation: string;
  remediation: string;
  status: "OPEN" | "REMEDIATED" | "QUARANTINED";
  detectedAt: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: "document" | "claim" | "entity" | "policy" | "source" | "requirement" | "conflict";
  group: string;
  trust?: number;
  status?: string;
  details?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: "references" | "impacts" | "conflicts_with" | "supersedes" | "verifies" | "requires";
  weight?: number;
  isMultiHop?: boolean;
}

export interface MultiHopPath {
  id: string;
  title: string;
  summary: string;
  hops: Array<{
    step: number;
    from: string;
    to: string;
    relation: string;
    explanation: string;
  }>;
  rootDoc: string;
  conflictingDoc: string;
  impactScore: number;
  status: "ACTIVE_CONFLICT" | "RESOLVED";
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  multiHopPaths: MultiHopPath[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    policyNodes: number;
    requirementNodes: number;
    documentNodes: number;
    conflictNodes: number;
    multiHopChainsDetected: number;
  };
}

export interface LedgerBlock {
  seq: number;
  id: string;
  ts: string;
  actor: string;
  type: string;
  doc_id?: string;
  target: string;
  detail: Record<string, unknown>;
  prev_hash: string;
  hash: string;
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

export interface BulkUploadResult {
  found: number;
  ingested: number;
  quarantined: number;
  skipped_duplicate_titles: number;
  docs_total: number;
}

export interface CorpusState {
  active: "demo" | "real" | null;
  loaded_at: string | null;
  documents: number;
  scanned: boolean;
}

export interface CorpusLoadResult {
  corpus: string;
  label: string;
  replaced: boolean;
  cleared_documents: number;
  ingested: number;
  quarantined: number;
  labels: number;
  unlabeled?: number;
  docs_total: number;
  loaded_at: string;
}

export interface EvalCoverage {
  total_docs: number;
  labeled_docs: number;
  unlabeled_docs: number;
}

export interface Stats {
  documents: number;
  quarantined: number;
  awaiting_human: number;
  auto_resolved: number;
  ledger_versions: number;
  pipeline: PipelineStrip;
  findings_by_type: Record<string, number>;
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
  coverage?: EvalCoverage;
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
