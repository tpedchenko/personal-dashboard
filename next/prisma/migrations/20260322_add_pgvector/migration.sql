-- pgvector extension must be created by superuser before running this migration
-- Run: docker exec pg psql -U postgres pd_dev -c "CREATE EXTENSION IF NOT EXISTS vector;"
-- Run: docker exec pg psql -U postgres pd_prod -c "CREATE EXTENSION IF NOT EXISTS vector;"

CREATE TABLE IF NOT EXISTS embeddings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  source_table VARCHAR(50) NOT NULL,
  source_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding vector(384),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(source_table, source_id)
);

-- IVFFlat index requires at least 100 rows to be effective.
-- For initial setup with few rows, use HNSW index instead (no training needed).
CREATE INDEX IF NOT EXISTS idx_embeddings_cosine ON embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_embeddings_user ON embeddings (user_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings (source_table, source_id);
