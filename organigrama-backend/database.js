const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database(process.env.DB_PATH || './organigrama.db');
let operationQueue = Promise.resolve();

function runRaw(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      return resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getRaw(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) return reject(error);
      return resolve(row);
    });
  });
}

function allRaw(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      return resolve(rows);
    });
  });
}

function enqueue(operation) {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.catch(() => {});
  return result;
}

function run(sql, params = []) {
  return enqueue(() => runRaw(sql, params));
}

function get(sql, params = []) {
  return enqueue(() => getRaw(sql, params));
}

function all(sql, params = []) {
  return enqueue(() => allRaw(sql, params));
}

function transaction(operation) {
  return enqueue(async () => {
    await runRaw('BEGIN IMMEDIATE');
    try {
      const result = await operation({ run: runRaw, get: getRaw, all: allRaw });
      await runRaw('COMMIT');
      return result;
    } catch (error) {
      await runRaw('ROLLBACK').catch(() => {});
      throw error;
    }
  });
}

async function migrate() {
  const versionRow = await getRaw('PRAGMA user_version');
  if (versionRow.user_version > 1) {
    throw new Error('Database schema version is newer than this application');
  }

  if (versionRow.user_version === 0) {
    await runRaw('PRAGMA foreign_keys = OFF');
    await runRaw('BEGIN IMMEDIATE');
    try {
      const table = await getRaw("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'");
      if (!table) {
        await runRaw(`
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            department TEXT NOT NULL,
            photoUrl TEXT,
            email TEXT,
            functions TEXT NOT NULL DEFAULT '[]',
            permissions TEXT NOT NULL DEFAULT '[]',
            reportsToId INTEGER REFERENCES users(id) ON DELETE SET NULL,
            positionX REAL NOT NULL DEFAULT 100,
            positionY REAL NOT NULL DEFAULT 100,
            CHECK (reportsToId IS NULL OR reportsToId != id)
          )
        `);
      } else {
        const columns = await allRaw('PRAGMA table_info(users)');
        const columnNames = new Set(columns.map((column) => column.name));
        const requiredColumns = ['id', 'name', 'role', 'department'];
        if (requiredColumns.some((column) => !columnNames.has(column))) {
          throw new Error('Existing users table is missing required columns');
        }

        const optionalColumns = [
          ['photoUrl', 'TEXT'],
          ['email', 'TEXT'],
          ['functions', "TEXT NOT NULL DEFAULT '[]'"],
          ['permissions', "TEXT NOT NULL DEFAULT '[]'"],
          ['reportsToId', 'INTEGER'],
          ['positionX', 'REAL NOT NULL DEFAULT 100'],
          ['positionY', 'REAL NOT NULL DEFAULT 100'],
        ];
        for (const [column, definition] of optionalColumns) {
          if (!columnNames.has(column)) {
            await runRaw(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
          }
        }

        const foreignKeys = await allRaw('PRAGMA foreign_key_list(users)');
        const hasCanonicalManagerKey = foreignKeys.some((key) =>
          key.table === 'users' &&
          key.from === 'reportsToId' &&
          key.to === 'id' &&
          key.on_delete.toUpperCase() === 'SET NULL'
        );

        if (!hasCanonicalManagerKey) {
          await runRaw(`
            CREATE TABLE users_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              role TEXT NOT NULL,
              department TEXT NOT NULL,
              photoUrl TEXT,
              email TEXT,
              functions TEXT NOT NULL DEFAULT '[]',
              permissions TEXT NOT NULL DEFAULT '[]',
              reportsToId INTEGER REFERENCES users_new(id) ON DELETE SET NULL,
              positionX REAL NOT NULL DEFAULT 100,
              positionY REAL NOT NULL DEFAULT 100,
              CHECK (reportsToId IS NULL OR reportsToId != id)
            )
          `);
          await runRaw(`
            INSERT INTO users_new (
              id, name, role, department, photoUrl, email, functions, permissions,
              reportsToId, positionX, positionY
            )
            SELECT
              id, name, role, department, photoUrl, email,
              COALESCE(functions, '[]'), COALESCE(permissions, '[]'),
              reportsToId, COALESCE(positionX, 100), COALESCE(positionY, 100)
            FROM users
          `);
          await runRaw('DROP TABLE users');
          await runRaw('ALTER TABLE users_new RENAME TO users');
        }
      }

      await runRaw('CREATE INDEX IF NOT EXISTS idx_users_reports_to_id ON users(reportsToId)');
      const violations = await allRaw('PRAGMA foreign_key_check');
      if (violations.length > 0) {
        throw new Error('Existing user relationships violate foreign-key constraints');
      }
      await runRaw('PRAGMA user_version = 1');
      await runRaw('COMMIT');
    } catch (error) {
      await runRaw('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      await runRaw('PRAGMA foreign_keys = ON');
    }
  }

  await runRaw('PRAGMA foreign_keys = ON');
  const foreignKeysEnabled = await getRaw('PRAGMA foreign_keys');
  if (foreignKeysEnabled.foreign_keys !== 1) {
    throw new Error('SQLite foreign-key enforcement could not be enabled');
  }

  const violations = await allRaw('PRAGMA foreign_key_check');
  if (violations.length > 0) {
    throw new Error('Database contains foreign-key violations');
  }
}

module.exports = { all, db, get, migrate, run, transaction };