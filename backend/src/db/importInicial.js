// Importación inicial (una sola vez) de los datos migrados desde FacturaVE.
// El dump llega comprimido en la variable IMPORT_SQL_GZ_B64 y solo se aplica
// si la base aún no tiene la tabla `empresas`. Quitar la variable tras migrar.
const mysql = require('mysql2/promise');
const zlib = require('zlib');

module.exports = async function importInicial() {
  const b64 = process.env.IMPORT_SQL_GZ_B64;
  if (!b64) return;

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
    const [rows] = await conn.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'empresas'"
    );
    if (rows[0].n > 0) {
      console.log('[IMPORT] La base ya tiene datos, se omite la importación inicial');
      return;
    }
    const sql = zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')
      .replace(/^\/\*M!999999\\- enable the sandbox mode \*\/.*$/m, '');
    await conn.query(sql);
    const [[{ empresas }]] = await conn.query('SELECT COUNT(*) AS empresas FROM empresas');
    const [[{ usuarios }]] = await conn.query('SELECT COUNT(*) AS usuarios FROM usuarios');
    const [[{ empleados }]] = await conn.query('SELECT COUNT(*) AS empleados FROM empleados');
    console.log(`[IMPORT] OK — empresas: ${empresas}, usuarios: ${usuarios}, empleados: ${empleados}`);
  } catch (err) {
    console.error('[IMPORT] Error en la importación inicial:', err.message);
  } finally {
    await conn.end();
  }
};
