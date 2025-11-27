-- migrations/create_tables.sql

-- users: cada usuário tem (id, pubkey, ciphertext, iv, salt opcional, created_at)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  salt TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- activities: histórico de operações por usuário
CREATE TABLE activities (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  txid TEXT,
  type TEXT,
  mint_from TEXT,
  mint_to TEXT,
  amount NUMERIC,
  status TEXT,
  meta JSONB,
  created_at TIMESTAMP DEFAULT now()
);

-- tokens (opcional): catálogo de tokens suportados
CREATE TABLE IF NOT EXISTS tokens (
  mint TEXT PRIMARY KEY,
  symbol TEXT,
  decimals INT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- index to speedup activity queries per user
CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id);
