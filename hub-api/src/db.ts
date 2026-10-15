import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HUB_DIR = join(homedir(), ".zpond");
export const DB_PATH = join(HUB_DIR, "hub.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  site TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'rea',
  engine TEXT NOT NULL DEFAULT '',
  screenshot TEXT NOT NULL DEFAULT '',
  tokens_json TEXT NOT NULL DEFAULT '{}',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at REAL NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cards_site ON cards(site);
CREATE INDEX IF NOT EXISTS cards_created ON cards(created_at);
CREATE TABLE IF NOT EXISTS card_tags (
  card_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (card_id, tag)
);
CREATE INDEX IF NOT EXISTS card_tags_tag ON card_tags(tag);
CREATE TABLE IF NOT EXISTS card_colors (
  card_id TEXT NOT NULL,
  hex TEXT NOT NULL,
  PRIMARY KEY (card_id, hex)
);
CREATE TABLE IF NOT EXISTS card_embeddings (
  card_id TEXT PRIMARY KEY,
  vector TEXT NOT NULL DEFAULT '[]',
  model TEXT NOT NULL DEFAULT '',
  updated_at REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id),
  name TEXT NOT NULL DEFAULT '',
  prompt_md TEXT NOT NULL DEFAULT '',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  tokens_json TEXT NOT NULL DEFAULT '{}',
  meta_json TEXT NOT NULL DEFAULT '{}',
  dest TEXT NOT NULL DEFAULT '',
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS packages_card ON packages(card_id);
`;

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;
  mkdirSync(HUB_DIR, { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA busy_timeout = 5000");
  _db.exec(SCHEMA);
  return _db;
}
