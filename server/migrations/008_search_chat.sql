ALTER TABLE rides ADD COLUMN departure_mode text NOT NULL DEFAULT 'scheduled' CHECK (departure_mode IN ('scheduled','now'));
ALTER TABLE rides ADD COLUMN chat_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN client_message_id uuid;
CREATE UNIQUE INDEX messages_client_id ON messages(sender_user_id, client_message_id) WHERE client_message_id IS NOT NULL;
CREATE TABLE message_reactions (
  message_id bigint NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id),
  emoji text NOT NULL CHECK (emoji IN ('👍','❤️','😂','🎉','👀')),
  PRIMARY KEY(message_id,user_id,emoji)
);
CREATE FUNCTION notify_ride_chat() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
  IF TG_TABLE_NAME='message_reactions' THEN
    SELECT ride_id INTO target FROM messages WHERE id=COALESCE(NEW.message_id,OLD.message_id);
  ELSIF TG_TABLE_NAME='rides' THEN target:=COALESCE(NEW.id,OLD.id);
  ELSE target:=COALESCE(NEW.ride_id,OLD.ride_id); END IF;
  IF target IS NOT NULL THEN
    UPDATE rides SET chat_revision=chat_revision+1 WHERE id=target;
    PERFORM pg_notify('ride_chat',target::text);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER messages_notify AFTER INSERT OR DELETE ON messages FOR EACH ROW EXECUTE FUNCTION notify_ride_chat();
CREATE TRIGGER reactions_notify AFTER INSERT OR DELETE ON message_reactions FOR EACH ROW EXECUTE FUNCTION notify_ride_chat();
CREATE TRIGGER membership_notify AFTER INSERT OR UPDATE OR DELETE ON ride_participants FOR EACH ROW EXECUTE FUNCTION notify_ride_chat();
CREATE TRIGGER cancellation_notify AFTER UPDATE OF cancelled_at ON rides FOR EACH ROW EXECUTE FUNCTION notify_ride_chat();
