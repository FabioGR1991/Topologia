const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { test } = require('node:test');

const backendRoot = path.join(__dirname, '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForStartup(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Backend startup timed out: ${output}`)), 10000);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('Backend corriendo en')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Backend exited before startup (${code}): ${output}`));
    });
  });
}

function openSqlite(filename) {
  const db = new sqlite3.Database(filename);
  return {
    close: () => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())),
    run: (sql) => new Promise((resolve, reject) => db.run(sql, (error) => error ? reject(error) : resolve())),
    get: (sql) => new Promise((resolve, reject) => db.get(sql, (error, row) => error ? reject(error) : resolve(row))),
  };
}

test('P1 API validates input, prevents cycles, rolls back batches, and hides SQLite errors', async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'organigrama-api-'));
  const databasePath = path.join(tempDirectory, 'test.sqlite');
  const port = await getFreePort();
  const token = 'integration-test-token';
  const child = spawn(process.execPath, [path.join(backendRoot, 'server.js')], {
    cwd: tempDirectory,
    env: {
      ...process.env,
      AUTH_MODE: 'mock',
      CORS_ORIGINS: 'http://localhost:5173',
      DB_PATH: databasePath,
      DEV_BEARER_TOKEN: token,
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let sqlite;
  try {
    await waitForStartup(child);
    const baseUrl = `http://127.0.0.1:${port}`;
    const request = (route, options = {}) => fetch(`${baseUrl}${route}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });

    assert.equal((await fetch(`${baseUrl}/api/users`)).status, 401);

    const invalidUser = await request('/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: '', role: 'Staff', department: 'Ops' }),
    });
    assert.equal(invalidUser.status, 400);

    const createUser = async (name) => {
      const response = await request('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name,
          role: 'Staff',
          department: 'Testing',
          functions: [],
          permissions: [],
          reportsToId: null,
        }),
      });
      assert.equal(response.status, 201);
      return response.json();
    };

    const manager = await createUser('Test Manager');
    const report = await createUser('Test Report');
    const setManager = await request('/api/users/relationships', {
      method: 'PUT',
      body: JSON.stringify({ relationships: [{ userId: report.id, reportsToId: manager.id }] }),
    });
    assert.equal(setManager.status, 200);

    const cycle = await request('/api/users/relationships', {
      method: 'PUT',
      body: JSON.stringify({ relationships: [{ userId: manager.id, reportsToId: report.id }] }),
    });
    assert.equal(cycle.status, 409);

    sqlite = openSqlite(databasePath);
    await sqlite.run(`
      CREATE TRIGGER fail_second_position
      BEFORE UPDATE OF positionX ON users
      WHEN OLD.id = ${manager.id} AND NEW.positionX = 999
      BEGIN
        SELECT RAISE(ABORT, 'sqlite-internal-test-detail');
      END
    `);
    const before = await sqlite.get(`SELECT positionX, positionY FROM users WHERE id = ${report.id}`);

    const failedBatch = await request('/api/users/positions', {
      method: 'PUT',
      body: JSON.stringify({
        nodes: [
          { id: report.id, x: 200, y: 210 },
          { id: manager.id, x: 999, y: 300 },
        ],
      }),
    });
    assert.equal(failedBatch.status, 500);
    const errorBody = await failedBatch.json();
    assert.equal(errorBody.error, 'Error interno del servidor');
    assert.equal(JSON.stringify(errorBody).includes('sqlite-internal-test-detail'), false);
    const after = await sqlite.get(`SELECT positionX, positionY FROM users WHERE id = ${report.id}`);
    assert.deepEqual(after, before);
    await sqlite.run('DROP TRIGGER fail_second_position');

    const deleteManager = await request(`/api/users/${manager.id}`, { method: 'DELETE' });
    assert.equal(deleteManager.status, 200);
    const detachedReport = await sqlite.get(`SELECT reportsToId FROM users WHERE id = ${report.id}`);
    assert.equal(detachedReport.reportsToId, null);

    const version = await sqlite.get('PRAGMA user_version');
    assert.equal(version.user_version, 1);
  } finally {
    if (sqlite) await sqlite.close().catch(() => {});
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});