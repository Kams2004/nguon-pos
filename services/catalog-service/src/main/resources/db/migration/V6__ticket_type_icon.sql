-- Till tiles show an icon + colour per ticket type instead of a photo
-- (clearer at a glance, and nothing to download on a slow connection).
-- image_url was only introduced in V5 and never used in production.
ALTER TABLE ticket_type DROP COLUMN image_url;
ALTER TABLE ticket_type
    ADD COLUMN icon  VARCHAR(40),
    ADD COLUMN color VARCHAR(20);
