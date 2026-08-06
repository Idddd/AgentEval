ALTER TABLE tasklattice.audit_logs
  ADD COLUMN trace_id TEXT,
  ADD COLUMN span_id TEXT;

CREATE INDEX audit_logs_project_trace_idx
  ON tasklattice.audit_logs(project_id, trace_id);

UPDATE tasklattice.audit_logs
SET
  trace_id = CASE id
    WHEN 'audit-001' THEN '6e7f1c9a4c824b1aa7a5e68a0b134101'
    WHEN 'audit-004' THEN '903fca7d2c204964bd1af2107062fdb4'
    WHEN 'audit-005' THEN 'b2884545403a40b3a9c5d6be1c68068f'
    ELSE trace_id
  END,
  span_id = CASE id
    WHEN 'audit-001' THEN '8a6cb93f82c6461a'
    WHEN 'audit-004' THEN 'e35b0b754d4f1f7c'
    WHEN 'audit-005' THEN '9ab3cb2a72c7a1fd'
    ELSE span_id
  END
WHERE id IN ('audit-001', 'audit-004', 'audit-005');
