DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM resource_grants WHERE cardinality(hostname_patterns) > 0) THEN
        RAISE EXCEPTION 'Remove scoped hostname grants before downgrading';
    END IF;
END;
$$;
ALTER TABLE resource_grants DROP COLUMN hostname_patterns;
