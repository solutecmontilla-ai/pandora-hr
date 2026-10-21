// Migraciones de esquema: ejecuta en orden los .sql de ./migraciones que aún
// no estén registrados en `schema_migraciones`. Se llama al arrancar el servidor.
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'migraciones');

module.exports = async function migrar() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    charset: 'utf8mb4',
    multipleStatements: true
  });
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migraciones (
      nombre VARCHAR(150) PRIMARY KEY,
      aplicada_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    const [hechas] = await conn.query('SELECT nombre FROM schema_migraciones');
    const aplicadas = new Set(hechas.map(r => r.nombre));
    const archivos = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
    for (const archivo of archivos) {
      if (aplicadas.has(archivo)) continue;
      await conn.query(fs.readFileSync(path.join(DIR, archivo), 'utf8'));
      await conn.query('INSERT INTO schema_migraciones (nombre) VALUES (?)', [archivo]);
      console.log(`[MIGRACION] Aplicada ${archivo}`);
    }
  } finally {
    await conn.end();
  }
};
