-- Separate public ride invalidations from participant-only chat notifications.
-- NOTIFY is delivered only after commit; the ride ID stays on the server.
CREATE FUNCTION notify_ride_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
  IF TG_TABLE_NAME='rides' THEN target:=COALESCE(NEW.id,OLD.id);
  ELSE target:=COALESCE(NEW.ride_id,OLD.ride_id); END IF;
  PERFORM pg_notify('ride_state',target::text);
  RETURN NULL;
END $$;
CREATE TRIGGER membership_state_notify AFTER INSERT OR UPDATE OR DELETE ON ride_participants
FOR EACH ROW EXECUTE FUNCTION notify_ride_state();
CREATE TRIGGER cancellation_state_notify AFTER UPDATE OF cancelled_at ON rides
FOR EACH ROW WHEN (OLD.cancelled_at IS DISTINCT FROM NEW.cancelled_at)
EXECUTE FUNCTION notify_ride_state();
