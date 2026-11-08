-- Activity journal — same shape in every service schema (see sales-service's AuditQueryController).
CREATE TABLE audit_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    service       VARCHAR(20) NOT NULL,
    category      VARCHAR(30) NOT NULL,
    action        VARCHAR(60) NOT NULL,
    actor_user_id UUID,
    actor_name    VARCHAR(200),
    entity_type   VARCHAR(40),
    entity_id     VARCHAR(100),
    summary       TEXT NOT NULL
);
CREATE INDEX idx_audit_log_occurred ON audit_log (occurred_at DESC);

-- What the printed entry ticket and till receipt say, editable by the
-- Super Admin instead of hardcoded in the app. NULL = the app's default text.
ALTER TABLE establishment
    ADD COLUMN ticket_title          VARCHAR(100),
    ADD COLUMN ticket_subtitle       VARCHAR(100),
    ADD COLUMN ticket_tagline        VARCHAR(200),
    ADD COLUMN ticket_location       VARCHAR(200),
    ADD COLUMN ticket_footer         VARCHAR(300),
    ADD COLUMN ticket_banner_url     TEXT,
    ADD COLUMN receipt_footer        VARCHAR(300),
    ADD COLUMN login_background_url  TEXT;

ALTER TABLE ticket_type ADD COLUMN image_url TEXT;

-- Images uploaded to object storage (MinIO). The file itself lives in the
-- bucket; this row is the library entry the admin picks from.
CREATE TABLE media (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID NOT NULL REFERENCES establishment (id),
    object_key       VARCHAR(300) NOT NULL UNIQUE,
    original_name    VARCHAR(300) NOT NULL,
    content_type     VARCHAR(100) NOT NULL,
    size_bytes       BIGINT NOT NULL,
    url              TEXT NOT NULL,
    uploaded_by_name VARCHAR(200),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_establishment ON media (establishment_id, created_at DESC);
