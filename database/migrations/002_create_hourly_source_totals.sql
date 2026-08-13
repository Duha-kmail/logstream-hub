CREATE TABLE IF NOT EXISTS hourly_source_totals (
  bucket_start TIMESTAMPTZ NOT NULL,
  source_name TEXT NOT NULL,
  event_count BIGINT NOT NULL CHECK (event_count >= 0),
  PRIMARY KEY (bucket_start, source_name)
);

INSERT INTO hourly_source_totals (bucket_start, source_name, event_count)
SELECT
  date_bin('1 hour', occurred_at, '1970-01-01T00:00:00Z'::timestamptz),
  source_name,
  COUNT(*)
FROM log_events
GROUP BY 1, 2
ON CONFLICT (bucket_start, source_name) DO UPDATE
SET event_count = EXCLUDED.event_count;
