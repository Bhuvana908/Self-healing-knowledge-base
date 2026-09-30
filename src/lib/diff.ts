// Word-level diff (LCS) for the side-by-side Compare tab and ledger version diffs.

export type DiffOpType = "same" | "add" | "del";
export interface DiffOp {
  type: DiffOpType;
  word: string;
}

function tokenize(s: string): string[] {
  return s.match(/\S+|\s+/g) ?? [];
}

export function wordDiff(a: string, b: string): { left: DiffOp[]; right: DiffOp[] } {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = A.length;
  const m = B.length;
  // LCS table (sentences are short; O(n*m) is fine)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const left: DiffOp[] = [];
  const right: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      left.push({ type: "same", word: A[i] });
      right.push({ type: "same", word: B[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      left.push({ type: "del", word: A[i] });
      i++;
    } else {
      right.push({ type: "add", word: B[j] });
      j++;
    }
  }
  while (i < n) {
    left.push({ type: "del", word: A[i] });
    i++;
  }
  while (j < m) {
    right.push({ type: "add", word: B[j] });
    j++;
  }
  return { left, right };
}
