CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS log_events (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY,
  occurred_at TIMESTAMPTZ NOT NULL,
  severity TEXT NOT NULL,
  source_name TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  searchable_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (occurred_at, event_id),
  CHECK (severity IN ('debug', 'info', 'warn', 'error')),
  CHECK (length(source_name) > 0),
  CHECK (length(content) > 0),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (jsonb_typeof(searchable_metadata) = 'object')
) PARTITION BY RANGE (occurred_at);

CREATE INDEX IF NOT EXISTS log_events_source_time_idx
  ON log_events (source_name, occurred_at DESC, event_id DESC);

CREATE INDEX IF NOT EXISTS log_events_severity_time_idx
  ON log_events (severity, occurred_at DESC, event_id DESC);

CREATE INDEX IF NOT EXISTS log_events_metadata_idx
  ON log_events USING GIN (searchable_metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS log_events_content_search_idx
  ON log_events USING GIN (lower(content) gin_trgm_ops);
