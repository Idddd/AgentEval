CREATE TYPE tasklattice.identity_type AS ENUM ('local', 'oidc');
CREATE TYPE tasklattice.system_role AS ENUM ('user', 'super_administrator');
CREATE TYPE tasklattice.user_status AS ENUM ('active', 'disabled');

ALTER TABLE tasklattice.users
  ADD COLUMN system_role tasklattice.system_role NOT NULL DEFAULT 'user',
  ADD COLUMN status tasklattice.user_status NOT NULL DEFAULT 'active';

UPDATE tasklattice.users
SET system_role = 'super_administrator'
WHERE id = 'local-admin';

CREATE TABLE tasklattice.user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES tasklattice.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  type tasklattice.identity_type NOT NULL,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  username TEXT,
  email TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_identities_issuer_subject_key UNIQUE (issuer, subject),
  CONSTRAINT user_identities_type_username_key UNIQUE (type, username)
);

CREATE INDEX user_identities_user_id_idx
  ON tasklattice.user_identities(user_id);

CREATE TABLE tasklattice.local_credentials (
  identity_id TEXT PRIMARY KEY REFERENCES tasklattice.user_identities(id) ON DELETE CASCADE ON UPDATE CASCADE,
  password_hash TEXT NOT NULL,
  changed_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tasklattice.user_identities
  (id, user_id, type, issuer, subject, username, email)
SELECT
  'identity-' || id,
  id,
  CASE WHEN auth_provider = 'sso'
    THEN 'oidc'::tasklattice.identity_type
    ELSE 'local'::tasklattice.identity_type
  END,
  CASE WHEN auth_provider = 'sso' THEN 'legacy:sso' ELSE 'tasklattice:local' END,
  CASE WHEN auth_provider = 'sso' THEN COALESCE(external_subject, id) ELSE username END,
  username,
  email
FROM tasklattice.users;

INSERT INTO tasklattice.local_credentials (identity_id, password_hash)
SELECT 'identity-' || id, password_hash
FROM tasklattice.users
WHERE password_hash IS NOT NULL
  AND auth_provider <> 'sso';

ALTER TABLE tasklattice.users
  DROP COLUMN auth_provider,
  DROP COLUMN external_subject,
  DROP COLUMN password_hash;
