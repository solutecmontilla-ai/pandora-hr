const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'facturaVE',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '-04:30' // Venezuela UTC-4:30
});

const db = {
  query: async (sql, params) => {
    const [rows] = await pool.query(sql, params);
    return rows;
  },
  queryOne: async (sql, params) => {
    const [rows] = await pool.query(sql, params);
    return rows[0] || null;
  },
  execute: async (sql, params) => {
    const [result] = await pool.execute(sql, params);
    return result;
  },
  transaction: async (fn) => {
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
};

module.exports = db;
