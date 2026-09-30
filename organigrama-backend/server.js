const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const { authenticateToken, requireAdmin } = require('./authMiddleware');
const { all, db, get, migrate, transaction } = require('./database');
const {
  parse,
  parseUserId,
  positionBatchSchema,
  relationshipsSchema,
  userSchema,
} = require('./validation');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use(helmet({ hsts: process.env.NODE_ENV === 'production' ? undefined : false }));
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-User-Role'],
  maxAge: 600,
}));
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes; inténtalo más tarde' },
}));
app.use(express.json({ limit: '32kb', strict: true }));
app.use('/api', authenticateToken, requireAdmin);

function apiError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sendError(res, error) {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (statusCode >= 500) {
    console.error('API operation failed', { code: error.code || 'INTERNAL' });
  }

  const body = { error: statusCode >= 500 ? 'Error interno del servidor' : error.message };
  if (statusCode === 400 && error.details) body.details = error.details;
  return res.status(statusCode).json(body);
}

function decodeUsers(rows) {
  try {
    return rows.map((user) => ({
      ...user,
      functions: JSON.parse(user.functions || '[]'),
      permissions: JSON.parse(user.permissions || '[]'),
    }));
  } catch {
    throw apiError(500, 'No se pudieron leer los datos');
  }
}

async function validateRelationshipUpdates(relationships, queryAll) {
  const users = await queryAll('SELECT id, reportsToId FROM users');
  const parentByUserId = new Map(users.map((user) => [user.id, user.reportsToId]));

  for (const relationship of relationships) {
    if (!parentByUserId.has(relationship.userId)) {
      throw apiError(404, 'No se encontró uno de los usuarios indicados');
    }
    if (relationship.reportsToId !== null && !parentByUserId.has(relationship.reportsToId)) {
      throw apiError(404, 'No se encontró uno de los superiores indicados');
    }
    parentByUserId.set(relationship.userId, relationship.reportsToId);
  }

  for (const relationship of relationships) {
    const visited = new Set();
    let currentId = relationship.userId;
    while (currentId !== null) {
      if (visited.has(currentId)) {
        throw apiError(409, 'La relación crearía un ciclo jerárquico');
      }
      visited.add(currentId);
      currentId = parentByUserId.get(currentId) ?? null;
    }
  }
}

function ensureUniqueIds(items, key, label) {
  const ids = items.map((item) => item[key]);
  if (new Set(ids).size !== ids.length) {
    throw apiError(400, `La solicitud contiene ${label} duplicados`);
  }
}

app.get('/api/users', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM users ORDER BY id');
    return res.json(decodeUsers(rows));
  } catch (error) {
    return sendError(res, error);
  }
});

app.put('/api/users/positions', async (req, res) => {
  try {
    const { nodes } = parse(positionBatchSchema, req.body);
    ensureUniqueIds(nodes, 'id', 'identificadores');

    await transaction(async (tx) => {
      const existingIds = new Set((await tx.all('SELECT id FROM users')).map((user) => user.id));
      if (nodes.some((node) => !existingIds.has(node.id))) {
        throw apiError(404, 'No se encontró uno de los usuarios indicados');
      }
      for (const node of nodes) {
        await tx.run('UPDATE users SET positionX = ?, positionY = ? WHERE id = ?', [node.x, node.y, node.id]);
      }
    });

    return res.json({ message: 'Posiciones guardadas', updated: nodes.length });
  } catch (error) {
    return sendError(res, error);
  }
});

app.put('/api/users/relationships', async (req, res) => {
  try {
    const { relationships } = parse(relationshipsSchema, req.body);
    ensureUniqueIds(relationships, 'userId', 'usuarios');

    await transaction(async (tx) => {
      await validateRelationshipUpdates(relationships, tx.all);
      for (const relationship of relationships) {
        await tx.run('UPDATE users SET reportsToId = ? WHERE id = ?', [
          relationship.reportsToId,
          relationship.userId,
        ]);
      }
    });

    return res.json({ message: 'Relaciones actualizadas', updated: relationships.length });
  } catch (error) {
    return sendError(res, error);
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const user = parse(userSchema, req.body);
    const result = await transaction(async (tx) => {
      if (user.reportsToId !== null) {
        const parent = await tx.get('SELECT id FROM users WHERE id = ?', [user.reportsToId]);
        if (!parent) throw apiError(404, 'No se encontró el superior indicado');
      }
      return tx.run(`
        INSERT INTO users (
          name, role, department, photoUrl, functions, permissions, reportsToId,
          email, positionX, positionY
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        user.name,
        user.role,
        user.department,
        user.photoUrl,
        JSON.stringify(user.functions),
        JSON.stringify(user.permissions),
        user.reportsToId,
        user.email,
        user.positionX,
        user.positionY,
      ]);
    });

    return res.status(201).json({ id: result.lastID, ...user });
  } catch (error) {
    return sendError(res, error);
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const id = parseUserId(req.params.id);
    const user = parse(userSchema, req.body);

    await transaction(async (tx) => {
      const existing = await tx.get('SELECT id FROM users WHERE id = ?', [id]);
      if (!existing) throw apiError(404, 'No se encontró el usuario');
      await validateRelationshipUpdates([{ userId: id, reportsToId: user.reportsToId }], tx.all);
      await tx.run(`
        UPDATE users
        SET name = ?, role = ?, department = ?, photoUrl = ?, functions = ?,
            permissions = ?, reportsToId = ?, email = ?
        WHERE id = ?
      `, [
        user.name,
        user.role,
        user.department,
        user.photoUrl,
        JSON.stringify(user.functions),
        JSON.stringify(user.permissions),
        user.reportsToId,
        user.email,
        id,
      ]);
    });

    return res.json({ message: 'Usuario actualizado' });
  } catch (error) {
    return sendError(res, error);
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const id = parseUserId(req.params.id);
    await transaction(async (tx) => {
      const existing = await tx.get('SELECT id FROM users WHERE id = ?', [id]);
      if (!existing) throw apiError(404, 'No se encontró el usuario');
      await tx.run('DELETE FROM users WHERE id = ?', [id]);
    });

    return res.json({ message: 'Usuario eliminado' });
  } catch (error) {
    return sendError(res, error);
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La solicitud excede el tamaño permitido' });
  }
  if (error.status === 400) {
    return res.status(400).json({ error: 'Solicitud JSON inválida' });
  }
  console.error('Unhandled API error', { code: error.code || 'INTERNAL' });
  return res.status(500).json({ error: 'Error interno del servidor' });
});

async function start() {
  await migrate();
  app.listen(PORT, HOST, () => {
    console.log(`Backend corriendo en http://${HOST}:${PORT} (auth: ${process.env.AUTH_MODE || 'disabled'})`);
  });
}

start().catch((error) => {
  console.error('Database initialization failed', { code: error.code || 'MIGRATION_FAILED' });
  db.close(() => process.exit(1));
});