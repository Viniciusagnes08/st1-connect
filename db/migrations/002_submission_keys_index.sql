-- Também aplicada pelo histórico gerenciado Supabase: index_submission_keys_request_id.
CREATE INDEX IF NOT EXISTS submission_keys_request_id_idx
  ON st1_bi.submission_keys (request_id);
