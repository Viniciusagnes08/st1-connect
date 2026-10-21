-- ST1 Connect: primeira base compartilhada de trabalho do Squad BI.
-- Executar com db/migrate.mjs, nunca via browser nem por solicitante.
CREATE SEQUENCE IF NOT EXISTS request_protocol_seq;

CREATE TABLE IF NOT EXISTS request_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol text NOT NULL UNIQUE,
  requester_user_id text,
  requester_email text,
  guest_invite_id uuid,
  scope text NOT NULL CHECK (scope IN ('BI', 'REVIEW', 'EXTERNAL')),
  topic_key text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 6 AND 160),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requester_identity_required CHECK (
    requester_user_id IS NOT NULL OR guest_invite_id IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS request_owner_recency
  ON request_records (requester_user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS request_scope_recency
  ON request_records (scope, created_at DESC, id DESC);

-- BI membership é explícito: perfil "Técnico" não torna alguém membro do BI.
CREATE TABLE IF NOT EXISTS bi_memberships (
  user_id text PRIMARY KEY,
  bi_role text NOT NULL CHECK (bi_role IN ('manager', 'analyst')),
  active boolean NOT NULL DEFAULT true,
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bi_tickets (
  request_id uuid PRIMARY KEY REFERENCES request_records(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'Novo'
    CHECK (state IN ('Novo', 'Em atendimento', 'Pendente', 'Resolvido', 'Fechado')),
  priority text
    CHECK (priority IN ('Crítica', 'Alta', 'Média', 'Baixa')),
  assignee_user_id text,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bi_ticket_states ON bi_tickets (state, updated_at DESC);

CREATE TABLE IF NOT EXISTS request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES request_records(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_user_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS request_event_timeline
  ON request_events (request_id, created_at, id);

CREATE TABLE IF NOT EXISTS submission_keys (
  actor_key text NOT NULL,
  idempotency_key text NOT NULL,
  request_id uuid NOT NULL REFERENCES request_records(id) ON DELETE RESTRICT,
  payload_hash text NOT NULL CHECK (char_length(payload_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_key, idempotency_key)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_user_id text,
  action text NOT NULL,
  target_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_recent ON audit_log (created_at DESC);
