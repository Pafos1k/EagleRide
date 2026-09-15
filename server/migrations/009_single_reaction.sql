-- Old rows have no reaction timestamp. Keep one deterministic existing emoji
-- per user/message when migrating stacked reactions, without inventing recency.
DELETE FROM message_reactions discarded USING message_reactions kept
WHERE discarded.message_id=kept.message_id AND discarded.user_id=kept.user_id
  AND discarded.emoji > kept.emoji;
ALTER TABLE message_reactions DROP CONSTRAINT message_reactions_pkey;
ALTER TABLE message_reactions ADD PRIMARY KEY(message_id,user_id);
-- Preserve legacy reactions while offering the new quick-reaction set.
ALTER TABLE message_reactions DROP CONSTRAINT message_reactions_emoji_check;
ALTER TABLE message_reactions ADD CHECK (emoji IN ('👍','❤️','😂','🎉','👀','😮','😢'));
-- Replacements must notify connected viewers just like additions/removals.
DROP TRIGGER reactions_notify ON message_reactions;
CREATE TRIGGER reactions_notify AFTER INSERT OR UPDATE OR DELETE ON message_reactions
FOR EACH ROW EXECUTE FUNCTION notify_ride_chat();
