ALTER TABLE resources DROP CONSTRAINT resource_name_kind;
UPDATE resources SET name=COALESCE(data->>'domain',id) WHERE kind='route';
ALTER TABLE resources ALTER COLUMN name SET NOT NULL;
