CREATE TABLE tasklattice.skill_artifacts (
  id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  version TEXT NOT NULL,
  digest TEXT NOT NULL,
  archive_format TEXT NOT NULL,
  content_type TEXT NOT NULL,
  archive BYTEA NOT NULL,
  compressed_size_bytes INTEGER NOT NULL,
  unpacked_size_bytes INTEGER NOT NULL,
  file_count INTEGER NOT NULL,
  manifest JSONB NOT NULL,
  source_path TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT skill_artifacts_pkey PRIMARY KEY (id),
  CONSTRAINT skill_artifacts_digest_key UNIQUE (digest),
  CONSTRAINT skill_artifacts_skill_version_key UNIQUE (skill_id, version),
  CONSTRAINT skill_artifacts_sizes_check CHECK (
    compressed_size_bytes > 0
    AND compressed_size_bytes <= 10485760
    AND unpacked_size_bytes > 0
    AND unpacked_size_bytes <= 52428800
  ),
  CONSTRAINT skill_artifacts_file_count_check CHECK (
    file_count > 0 AND file_count <= 500
  ),
  CONSTRAINT skill_artifacts_archive_format_check CHECK (
    archive_format IN ('tar+gzip')
  )
);

CREATE INDEX skill_artifacts_skill_id_idx
  ON tasklattice.skill_artifacts (skill_id);
