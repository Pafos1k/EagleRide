-- Preserve cancelled rides and departed memberships; active occupancy is derived.
ALTER TABLE rides ADD COLUMN cancelled_at timestamptz;
ALTER TABLE ride_participants ADD COLUMN left_at timestamptz;
CREATE INDEX ride_participants_active_user ON ride_participants(user_id, ride_id) WHERE left_at IS NULL;
