-- Departure membership is historical eligibility, not independently verified attendance.
CREATE VIEW reputation_memberships AS
SELECT p.ride_id, p.user_id,
  CASE WHEN p.left_at IS NULL OR p.left_at >= r.departure_at THEN 'joined'
       WHEN p.left_at >= r.departure_at - interval '2 hours' THEN 'late_cancellation'
       ELSE NULL END AS eligibility
FROM ride_participants p JOIN rides r ON r.id=p.ride_id
WHERE p.joined_at <= r.departure_at;

CREATE TABLE reliability_ratings (
  ride_id uuid NOT NULL,
  rater_user_id text NOT NULL,
  recipient_user_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('reliable','issue')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (ride_id,rater_user_id,recipient_user_id),
  FOREIGN KEY (ride_id,rater_user_id) REFERENCES ride_participants(ride_id,user_id),
  FOREIGN KEY (ride_id,recipient_user_id) REFERENCES ride_participants(ride_id,user_id),
  CHECK (rater_user_id <> recipient_user_id),
  CHECK ((outcome='reliable' AND reason IS NULL) OR
         (outcome='issue' AND reason IS NOT NULL AND reason IN ('no_show','significantly_late','late_cancellation')))
);
CREATE INDEX reliability_ratings_recipient ON reliability_ratings(recipient_user_id);
CREATE FUNCTION prevent_rating_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Reliability ratings are immutable'; END;
$$;
CREATE TRIGGER reliability_ratings_immutable BEFORE UPDATE OR DELETE ON reliability_ratings
FOR EACH ROW EXECUTE FUNCTION prevent_rating_update();
