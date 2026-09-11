const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./organigrama.db', (err) => {
  if (err) console.error('Error DB:', err.message);
  else console.log('Base de Datos SQLite conectada.');
});

// Inicialización de la DB y migración automática de columnas
db.serialize(() => {
  // 1. Crear tabla si no existe (incluye email)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      photoUrl TEXT,
      email TEXT,
      functions TEXT,
      permissions TEXT,
      reportsToId INTEGER,
      positionX REAL DEFAULT 100,
      positionY REAL DEFAULT 100
    )
  `);

  // 2. Agregar columnas si la tabla ya existía antes
  db.run(`ALTER TABLE users ADD COLUMN positionX REAL DEFAULT 100`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN positionY REAL DEFAULT 100`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN email TEXT`, () => {});
});

// 1. Obtener todos los usuarios
app.get('/api/users', (req, res) => {
  db.all("SELECT * FROM users", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const users = rows.map(u => ({
      ...u,
      functions: JSON.parse(u.functions || "[]"),
      permissions: JSON.parse(u.permissions || "[]")
    }));
    res.json(users);
  });
});

// 2. Guardar posiciones al arrastrar tarjetas
app.put('/api/users/positions', (req, res) => {
  const { nodes } = req.body;
  if (!nodes || !Array.isArray(nodes)) return res.json({ message: "Sin nodos para actualizar" });

  const stmt = db.prepare("UPDATE users SET positionX = ?, positionY = ? WHERE id = ?");
  nodes.forEach(node => {
    stmt.run(node.x, node.y, node.id);
  });
  stmt.finalize();

  res.json({ message: "Posiciones guardadas" });
});

// 3. Crear nuevo usuario
app.post('/api/users', (req, res) => {
  const { name, role, department, photoUrl, functions, permissions, reportsToId, email, positionX, positionY } = req.body;

  const sql = `INSERT INTO users (name, role, department, photoUrl, functions, permissions, reportsToId, email, positionX, positionY) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const params = [
    name, 
    role, 
    department, 
    photoUrl, 
    JSON.stringify(functions || []), 
    JSON.stringify(permissions || []), 
    reportsToId || null,
    email || null,
    positionX || 100,
    positionY || 100
  ];

  db.run(sql, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, ...req.body });
  });
});

// 4. Actualizar usuario (AQUÍ YA INCLUYED EMAIL)
app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, role, department, photoUrl, functions, permissions, reportsToId, email } = req.body;

  const sql = `
    UPDATE users 
    SET name = ?, role = ?, department = ?, photoUrl = ?, functions = ?, permissions = ?, reportsToId = ?, email = ?
    WHERE id = ?
  `;

  db.run(sql, [
    name, role, department, photoUrl,
    JSON.stringify(functions || []),
    JSON.stringify(permissions || []),
    reportsToId || null,
    email || null,
    id
  ], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Actualizado" });
  });
});

// 5. Eliminar usuario
app.delete('/api/users/:id', (req, res) => {
  db.run("DELETE FROM users WHERE id = ?", req.params.id, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Eliminado" });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en http://localhost:${PORT}`);
});