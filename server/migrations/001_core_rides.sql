CREATE TABLE users (
  id text PRIMARY KEY,
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 200),
  bc_email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id text NOT NULL REFERENCES users(id),
  origin_name text NOT NULL CHECK (length(btrim(origin_name)) BETWEEN 1 AND 200),
  origin_address text CHECK (length(btrim(origin_address)) BETWEEN 1 AND 500),
  origin_terminal text CHECK (origin_terminal IN ('A', 'B', 'C', 'E')),
  destination_name text NOT NULL CHECK (length(btrim(destination_name)) BETWEEN 1 AND 200),
  destination_address text CHECK (length(btrim(destination_address)) BETWEEN 1 AND 500),
  destination_terminal text CHECK (destination_terminal IN ('A', 'B', 'C', 'E')),
  departure_at timestamptz NOT NULL,
  seats_total smallint NOT NULL CHECK (seats_total BETWEEN 1 AND 4),
  luggage_type text NOT NULL CHECK (luggage_type IN ('CARRY_ON_ONLY', 'ONE_SUITCASE', 'MULTIPLE')),
  flexibility text NOT NULL CHECK (flexibility IN ('EXACT', 'PLUS_MINUS_30', 'PLUS_MINUS_60')),
  estimated_total_cost_cents integer NOT NULL CHECK (estimated_total_cost_cents BETWEEN 0 AND 1000000),
  host_note text CHECK (length(btrim(host_note)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rides_departure_idx ON rides(departure_at, id);

CREATE TABLE ride_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, user_id)
);
CREATE INDEX ride_participants_user_idx ON ride_participants(user_id);

-- Temporary acting identity matches the existing CURRENT_USER. No authentication.
INSERT INTO users (id, full_name, bc_email) VALUES ('u1', 'Baldwin Eagle', 'baldwin@bc.edu');
