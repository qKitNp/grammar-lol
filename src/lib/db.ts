import Database from "@tauri-apps/plugin-sql";

export type ProofStatus = "pending" | "success" | "failure";

export type Proof = {
  id: string;
  ts: Date;
  sourceApp: string;
  before: string;
  after: string;
  status: ProofStatus;
  error?: string;
  completedTs?: Date;
};

type Row = {
  id: string;
  ts: number;
  source_app: string;
  before_text: string;
  after_text: string | null;
  status: ProofStatus;
  error: string | null;
  completed_ts: number | null;
};

let dbPromise: Promise<Database> | null = null;
const db = () => (dbPromise ??= Database.load("sqlite:proofs.db"));

const rowToProof = (r: Row): Proof => ({
  id: r.id,
  ts: new Date(r.ts),
  sourceApp: r.source_app,
  before: r.before_text,
  after: r.after_text ?? "",
  status: r.status,
  error: r.error ?? undefined,
  completedTs: r.completed_ts != null ? new Date(r.completed_ts) : undefined,
});

export async function insertPending(args: {
  id: string;
  sourceApp: string;
  before: string;
}): Promise<Proof> {
  const ts = Date.now();
  const d = await db();
  await d.execute(
    "INSERT INTO proofs (id, ts, source_app, before_text, status) VALUES ($1, $2, $3, $4, 'pending')",
    [args.id, ts, args.sourceApp, args.before],
  );
  return {
    id: args.id,
    ts: new Date(ts),
    sourceApp: args.sourceApp,
    before: args.before,
    after: "",
    status: "pending",
  };
}

export async function markSuccess(id: string, after: string): Promise<Date> {
  const completedTs = Date.now();
  const d = await db();
  await d.execute(
    "UPDATE proofs SET after_text = $1, status = 'success', error = NULL, completed_ts = $2 WHERE id = $3",
    [after, completedTs, id],
  );
  return new Date(completedTs);
}

export async function markFailure(id: string, error: string): Promise<Date> {
  const completedTs = Date.now();
  const d = await db();
  await d.execute(
    "UPDATE proofs SET status = 'failure', error = $1, completed_ts = $2 WHERE id = $3",
    [error, completedTs, id],
  );
  return new Date(completedTs);
}

export async function listProofs(): Promise<Proof[]> {
  const d = await db();
  const rows = await d.select<Row[]>(
    "SELECT id, ts, source_app, before_text, after_text, status, error, completed_ts FROM proofs ORDER BY ts DESC",
  );
  return rows.map(rowToProof);
}
