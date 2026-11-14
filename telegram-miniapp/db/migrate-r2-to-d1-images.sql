-- Run ONLY if the original db/schema.sql was already executed BEFORE switching from R2 to D1 photos.
-- If you have not initialized the database yet, run the current db/schema.sql instead.
ALTER TABLE images ADD COLUMN image_blob BLOB;
