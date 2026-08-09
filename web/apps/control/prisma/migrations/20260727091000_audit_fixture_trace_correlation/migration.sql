UPDATE tasklattice.audit_logs
SET
  trace_id = CASE
    WHEN id LIKE '%001' THEN '6e7f1c9a4c824b1aa7a5e68a0b134101'
    WHEN id LIKE '%004' THEN '903fca7d2c204964bd1af2107062fdb4'
    WHEN id LIKE '%005' THEN 'b2884545403a40b3a9c5d6be1c68068f'
    ELSE trace_id
  END,
  span_id = CASE
    WHEN id LIKE '%001' THEN '8a6cb93f82c6461a'
    WHEN id LIKE '%004' THEN 'e35b0b754d4f1f7c'
    WHEN id LIKE '%005' THEN '9ab3cb2a72c7a1fd'
    ELSE span_id
  END
WHERE (
    id LIKE '%001'
    OR id LIKE '%004'
    OR id LIKE '%005'
  )
  AND trace_id IS NULL;
