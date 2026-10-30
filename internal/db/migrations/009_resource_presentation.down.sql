DROP TABLE resource_logos;
DROP INDEX resources_card_order;
ALTER TABLE resources DROP COLUMN sort_order;
DROP SEQUENCE resource_card_order;
