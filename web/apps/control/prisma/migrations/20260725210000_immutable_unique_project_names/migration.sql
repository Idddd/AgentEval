CREATE UNIQUE INDEX IF NOT EXISTS projects_name_key
  ON tasklattice.projects (name);

CREATE OR REPLACE FUNCTION tasklattice.prevent_project_name_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    RAISE EXCEPTION 'Project names are immutable after creation.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_name_immutable ON tasklattice.projects;

CREATE TRIGGER projects_name_immutable
  BEFORE UPDATE OF name ON tasklattice.projects
  FOR EACH ROW
  EXECUTE FUNCTION tasklattice.prevent_project_name_change();
