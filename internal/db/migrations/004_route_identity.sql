ALTER TABLE resources ALTER COLUMN name DROP NOT NULL;
UPDATE resources SET name=NULL WHERE kind='route';
ALTER TABLE resources ADD CONSTRAINT resource_name_kind CHECK ((kind='route' AND name IS NULL) OR (kind<>'route' AND name IS NOT NULL));
