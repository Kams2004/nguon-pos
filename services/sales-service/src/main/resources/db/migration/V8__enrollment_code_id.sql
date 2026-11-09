-- A public id for enrollment codes, so the back office can list the codes
-- still waiting for their till and cancel one. The code itself stays
-- hashed and is shown only once, when created.
ALTER TABLE enrollment_code ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE enrollment_code ADD CONSTRAINT enrollment_code_id_key UNIQUE (id);
