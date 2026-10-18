ALTER TABLE resources ADD COLUMN variables jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(variables) = 'object');
