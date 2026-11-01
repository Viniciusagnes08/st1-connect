-- ST1 Connect: auditoria departamental append-only no backend.
-- Reversao: desativar a leitura de auditoria na API; NAO excluir registros.
CREATE TABLE IF NOT EXISTS st1_services.department_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id text NOT NULL CHECK (char_length(actor_user_id) BETWEEN 1 AND 128),
  target_user_id text NOT NULL CHECK (char_length(target_user_id) BETWEEN 1 AND 128),
  area text NOT NULL CHECK (area IN ('comercial','crm','ti','marketing','financeiro','administrativo')),
  event_type text NOT NULL CHECK (event_type IN ('granted','role_changed','revoked','reactivated')),
  previous_role text CHECK (previous_role IS NULL OR previous_role IN ('gestor','supervisor','executor')),
  next_role text NOT NULL CHECK (next_role IN ('gestor','supervisor','executor')),
  previous_active boolean,
  next_active boolean NOT NULL
);
CREATE INDEX IF NOT EXISTS department_access_audit_recent_idx
  ON st1_services.department_access_audit (occurred_at DESC, id DESC);
ALTER TABLE st1_services.department_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE st1_services.department_access_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON st1_services.department_access_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON st1_services.department_access_audit TO st1_connect_preview, st1_connect_runtime;
CREATE POLICY department_access_audit_backend_read ON st1_services.department_access_audit
  FOR SELECT TO st1_connect_preview, st1_connect_runtime USING (true);
CREATE POLICY department_access_audit_backend_append ON st1_services.department_access_audit
  FOR INSERT TO st1_connect_preview, st1_connect_runtime WITH CHECK (true);

-- Politicas ja autorizam a role privada do backend.
-- FORCE RLS passa a aplicar a verificacao tambem caso a role seja proprietaria.
ALTER TABLE st1_services.requests FORCE ROW LEVEL SECURITY;
ALTER TABLE st1_services.request_events FORCE ROW LEVEL SECURITY;
ALTER TABLE st1_services.submission_keys FORCE ROW LEVEL SECURITY;

-- Defesa de integridade para impedir atribuir pedidos confidenciais/da Ouvidoria.
ALTER TABLE st1_services.requests
  ADD CONSTRAINT service_assignment_only_nonconfidential_department
  CHECK (
    assigned_to_user_id IS NULL OR
    (confidential = false AND area IN ('comercial','crm','ti','marketing','financeiro','administrativo'))
  );
