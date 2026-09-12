CREATE TABLE messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ride_id uuid NOT NULL REFERENCES rides(id),
  sender_user_id text NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX messages_ride_order ON messages(ride_id, id);
