UPDATE tasklattice.skills
SET payload = payload - 'bindings'
WHERE payload ? 'bindings';
