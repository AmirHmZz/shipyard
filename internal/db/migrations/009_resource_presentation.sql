CREATE SEQUENCE resource_card_order;
ALTER TABLE resources ADD COLUMN sort_order bigint NOT NULL DEFAULT nextval('resource_card_order');
WITH ordered AS (SELECT id,row_number() OVER (ORDER BY created_at,id) AS position FROM resources)
UPDATE resources SET sort_order=ordered.position FROM ordered WHERE resources.id=ordered.id;
SELECT setval('resource_card_order',GREATEST(COALESCE((SELECT max(sort_order) FROM resources),0)+1,1),false);
CREATE TABLE resource_logos(resource_id text PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,revision text NOT NULL,image bytea NOT NULL);
CREATE INDEX resources_card_order ON resources(kind,parent_id,sort_order,id);
