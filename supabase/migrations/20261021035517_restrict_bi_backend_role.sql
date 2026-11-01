-- Backend ST1 Connect: autorização de usuário permanece na API.
-- A role começa sem login; a credencial só será criada ao configurar a conexão.
CREATE ROLE st1_connect_preview NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE postgres TO st1_connect_preview;
GRANT USAGE ON SCHEMA st1_bi TO st1_connect_preview;
GRANT SELECT, INSERT, UPDATE ON st1_bi.request_records, st1_bi.bi_tickets, st1_bi.bi_memberships TO st1_connect_preview;
GRANT SELECT, INSERT ON st1_bi.request_events, st1_bi.submission_keys TO st1_connect_preview;
GRANT INSERT ON st1_bi.audit_log TO st1_connect_preview;
GRANT USAGE, SELECT ON SEQUENCE st1_bi.request_protocol_seq, st1_bi.audit_log_id_seq TO st1_connect_preview;
ALTER ROLE st1_connect_preview SET search_path = st1_bi, pg_catalog;
DO $policies$
DECLARE target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['request_records','bi_tickets','bi_memberships','request_events','submission_keys','audit_log']
  LOOP
    EXECUTE format('ALTER TABLE st1_bi.%I ENABLE ROW LEVEL SECURITY',target_table);
    EXECUTE format('CREATE POLICY st1_connect_backend ON st1_bi.%I TO st1_connect_preview USING (true) WITH CHECK (true)',target_table);
  END LOOP;
END $policies$;
