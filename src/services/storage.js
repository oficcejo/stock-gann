const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', '..', 'data');
const dbPath = path.join(dataDir, 'gann-app.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS watchlist (
    symbol TEXT PRIMARY KEY,
    market TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    market TEXT NOT NULL,
    name TEXT NOT NULL,
    period TEXT NOT NULL,
    adjusted TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    temperature REAL NOT NULL,
    generated_at TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ai_reports_symbol_generated_at
  ON ai_reports(symbol, generated_at DESC);
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

ensureColumn('watchlist', 'drawings_json', "TEXT NOT NULL DEFAULT '[]'");

function parseDrawingsJson(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function toWatchlistItem(row) {
  const drawings = parseDrawingsJson(row.drawings_json);

  return {
    symbol: row.symbol,
    market: row.market,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasDrawings: drawings.length > 0
  };
}

function toAiReportSummary(row) {
  const content = row.content || '';
  const excerpt = content.replace(/\s+/g, ' ').trim().slice(0, 140);

  return {
    id: row.id,
    symbol: row.symbol,
    market: row.market,
    name: row.name,
    period: row.period,
    adjusted: row.adjusted,
    provider: row.provider,
    model: row.model,
    temperature: row.temperature,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    excerpt: excerpt || '\u65e0\u6458\u8981'
  };
}

function listWatchlist() {
  const rows = db.prepare('SELECT * FROM watchlist ORDER BY updated_at DESC, symbol ASC').all();
  return rows.map(toWatchlistItem);
}

function addWatchlistItem({ symbol, market, name }) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO watchlist (symbol, market, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      market = excluded.market,
      name = excluded.name,
      updated_at = excluded.updated_at
  `).run(symbol, market, name, now, now);

  return getWatchlistItem(symbol);
}

function getWatchlistItem(symbol) {
  const row = db.prepare('SELECT * FROM watchlist WHERE symbol = ?').get(symbol);
  return row ? toWatchlistItem(row) : null;
}

function getWatchlistDrawings(symbol) {
  const row = db.prepare('SELECT drawings_json FROM watchlist WHERE symbol = ?').get(symbol);
  return row ? parseDrawingsJson(row.drawings_json) : [];
}

function saveWatchlistDrawings(symbol, drawings) {
  const item = getWatchlistItem(symbol);

  if (!item) {
    return false;
  }

  db.prepare(`
    UPDATE watchlist
    SET drawings_json = ?, updated_at = ?
    WHERE symbol = ?
  `).run(JSON.stringify(Array.isArray(drawings) ? drawings : []), new Date().toISOString(), symbol);

  return true;
}

function removeWatchlistItem(symbol) {
  const result = db.prepare('DELETE FROM watchlist WHERE symbol = ?').run(symbol);
  return result.changes > 0;
}

function saveAiReportRecord(record) {
  const createdAt = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO ai_reports (
      symbol, market, name, period, adjusted,
      provider, model, temperature, generated_at, content, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.symbol,
    record.market,
    record.name,
    record.period,
    record.adjusted,
    record.provider,
    record.model,
    record.temperature,
    record.generatedAt,
    record.content,
    createdAt
  );

  return getAiReportRecord(result.lastInsertRowid);
}

function listAiReportRecords({ symbol, limit = 12 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit || 12), 1), 100);

  if (symbol) {
    const rows = db.prepare(`
      SELECT * FROM ai_reports
      WHERE symbol = ?
      ORDER BY generated_at DESC, id DESC
      LIMIT ?
    `).all(symbol, safeLimit);
    return rows.map(toAiReportSummary);
  }

  const rows = db.prepare(`
    SELECT * FROM ai_reports
    ORDER BY generated_at DESC, id DESC
    LIMIT ?
  `).all(safeLimit);
  return rows.map(toAiReportSummary);
}

function getAiReportRecord(id) {
  const row = db.prepare('SELECT * FROM ai_reports WHERE id = ?').get(Number(id));

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    symbol: row.symbol,
    market: row.market,
    name: row.name,
    period: row.period,
    adjusted: row.adjusted,
    provider: row.provider,
    model: row.model,
    temperature: row.temperature,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    content: row.content
  };
}

module.exports = {
  dbPath,
  listWatchlist,
  addWatchlistItem,
  getWatchlistItem,
  getWatchlistDrawings,
  saveWatchlistDrawings,
  removeWatchlistItem,
  saveAiReportRecord,
  listAiReportRecords,
  getAiReportRecord
};
