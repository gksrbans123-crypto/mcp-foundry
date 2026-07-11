-- Add the "disabled" server status (dashboard enable/disable toggle).
-- The spec file stays deployed; runtime-host serves only "active" servers, so
-- a disabled server 404s until re-enabled.
ALTER TABLE servers DROP CONSTRAINT IF EXISTS servers_status_check;
ALTER TABLE servers ADD CONSTRAINT servers_status_check
  CHECK (status IN ('active', 'building', 'failed', 'deleted', 'disabled'));
