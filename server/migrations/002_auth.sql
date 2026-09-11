-- Legacy users/ride ownership remain intact; only verified provider identities can log in.
ALTER TABLE users ADD COLUMN auth_subject uuid UNIQUE;
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
ALTER TABLE users ADD CONSTRAINT authenticated_bc_email CHECK (
  auth_subject IS NULL OR (
    email_verified_at IS NOT NULL AND
    bc_email ~* '^[^@[:space:]]+@bc\.edu$'
  )
);
