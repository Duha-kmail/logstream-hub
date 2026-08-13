CREATE TABLE IF NOT EXISTS minute_dimension_totals (
  bucket_start TIMESTAMPTZ NOT NULL,
  source_name TEXT NOT NULL,
  severity TEXT NOT NULL,
  event_count BIGINT NOT NULL CHECK (event_count >= 0),
  PRIMARY KEY (bucket_start, source_name, severity),
  CHECK (severity IN ('debug', 'info', 'warn', 'error'))
);

INSERT INTO minute_dimension_totals (bucket_start, source_name, severity, event_count)
SELECT
  date_bin('1 minute', occurred_at, '1970-01-01T00:00:00Z'::timestamptz),
  source_name,
  severity,
  COUNT(*)
FROM log_events
GROUP BY 1, 2, 3
ON CONFLICT (bucket_start, source_name, severity) DO UPDATE
SET event_count = EXCLUDED.event_count;

DROP TABLE IF EXISTS hourly_source_totals;
