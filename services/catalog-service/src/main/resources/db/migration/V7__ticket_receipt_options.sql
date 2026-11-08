-- Layout/visibility options for the printed entry ticket and till receipt
-- (colours, which blocks to show, paper width, header & legal lines…), as
-- JSON documents owned by the PWA's design editor. JSON rather than one
-- column per option: options will keep evolving with the printers in use,
-- and old documents simply fall back to defaults for keys they lack.
ALTER TABLE establishment
    ADD COLUMN ticket_options  TEXT,
    ADD COLUMN receipt_options TEXT;
