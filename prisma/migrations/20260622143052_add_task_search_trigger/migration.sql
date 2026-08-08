-- Task full-text search trigger
CREATE OR REPLACE FUNCTION update_task_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW."searchVector" := to_tsvector(
    'english',
    COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.description, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_search_vector_update
BEFORE INSERT OR UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION update_task_search_vector();

-- Mevcut task'ları güncelle
UPDATE tasks SET "searchVector" = to_tsvector(
  'english',
  COALESCE(title, '') || ' ' || COALESCE(description, '')
);