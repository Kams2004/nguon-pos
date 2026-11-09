-- Desktop till releases. Files are uploaded to the VPS (served by nginx
-- under /releases/) and registered here by deploy/release/publish-release.sh;
-- each file carries its SHA-256 and an Ed25519 signature that the tills
-- check against the release key built into them.
CREATE TABLE release (
    version    VARCHAR(40) PRIMARY KEY,
    notes      TEXT,
    files      TEXT NOT NULL,          -- JSON: [{platform, url, sha256, signature, size}]
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which version the establishment's tills should run. NULL = frozen: tills
-- keep their version (e.g. during the festival).
CREATE TABLE release_policy (
    establishment_id   UUID PRIMARY KEY,
    target_version     VARCHAR(40) REFERENCES release (version),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id UUID
);
