-- Initial schema for MCP Foundry (plan §7 data model).
-- gen_random_uuid() is built into PostgreSQL core (>=13), no extension needed.

CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  auth_ref TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE servers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  public_url TEXT,
  mcp_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'building', 'failed', 'deleted')),
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  probe_result JSONB,
  deploy_ref TEXT,
  -- sha256(parsed_spec) copied from the originating job at deploy time; the
  -- UNIQUE constraint is what actually enforces the R5 deploy idempotency
  -- invariant (no two active servers can be created from the same spec).
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_servers_user_id ON servers(user_id);
CREATE INDEX idx_servers_status ON servers(status);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id TEXT REFERENCES servers(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('create', 'refine', 'redeploy', 'delete')),
  input JSONB NOT NULL,
  parsed_spec JSONB,
  stage TEXT NOT NULL CHECK (
    stage IN (
      'queued', 'generating', 'building', 'validating',
      'probing', 'deploying', 'active', 'failed'
    )
  ),
  status TEXT NOT NULL CHECK (
    status IN (
      'queued', 'generating', 'building', 'validating',
      'probing', 'deploying', 'active', 'failed'
    )
  ),
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supports PgQueue's atomic SKIP LOCKED claim: cheap lookup of unlocked,
-- non-terminal jobs ordered oldest-first.
CREATE INDEX idx_jobs_claimable ON jobs(created_at)
  WHERE locked_at IS NULL AND stage NOT IN ('active', 'failed');
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_server_id ON jobs(server_id);

CREATE TABLE status_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_events_job_id ON status_events(job_id, at);
