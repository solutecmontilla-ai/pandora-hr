const { authenticate, requireRole } = require('../middleware/auth');
const db = require('../db/database');
const dayjs = require('dayjs');

// Roles que pueden crear/modificar en contabilidad
const ROLES_CONTABLES = ['ADMIN', 'ADMIN_SR', 'CONTADOR', 'SUPERADMIN'];

module.exports = async (fastify) => {
  // ======== PLAN DE CUENTAS ========
  fastify.get('/cuentas', { preHandler: [authenticate] }, async (req) => {
    const { tipo, nivel } = req.query;
    let sql = 'SELECT * FROM plan_cuentas WHERE empresa_id = ? AND activo = 1';
    const p = [req.empresaId];
    if (tipo) { sql += ' AND tipo = ?'; p.push(tipo); }
    if (nivel) { sql += ' AND nivel = ?'; p.push(nivel); }
    return db.query(sql + ' ORDER BY codigo', p);
  });

  // Inicializar plan de cuentas desde plantilla FCCPV
  fastify.post('/cuentas/inicializar', { preHandler: [requireRole(...ROLES_CONTABLES)] }, async (req, reply) => {
    const existe = await db.queryOne('SELECT id FROM plan_cuentas WHERE empresa_id = ? LIMIT 1', [req.empresaId]);
    if (existe) return reply.status(409).send({ error: 'El plan de cuentas ya fue inicializado' });

    const plantilla = await db.query('SELECT * FROM plan_cuentas_plantilla ORDER BY codigo');
    for (const cuenta of plantilla) {
      await db.execute(
        'INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, codigo_padre, acepta_movimientos) VALUES (?,?,?,?,?,?,?,?)',
        [req.empresaId, cuenta.codigo, cuenta.nombre, cuenta.tipo, cuenta.naturaleza,
         cuenta.nivel, cuenta.codigo_padre, cuenta.nivel >= 3 ? 1 : 0]
      );
    }
    return reply.status(201).send({ ok: true, cuentas: plantilla.length });
  });

  fastify.post('/cuentas', { preHandler: [requireRole(...ROLES_CONTABLES)] }, async (req, reply) => {
    const d = req.body;
    const res = await db.execute(
      'INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, codigo_padre, acepta_movimientos) VALUES (?,?,?,?,?,?,?,?)',
      [req.empresaId, d.codigo, d.nombre, d.tipo, d.naturaleza, d.nivel||3, d.codigo_padre||null, d.acepta_movimientos?1:1]
    );
    return reply.status(201).send({ id: res.insertId });
  });

  // ======== ASIENTOS CONTABLES ========
  fastify.get('/asientos', { preHandler: [authenticate] }, async (req) => {
    const { desde, hasta, tipo } = req.query;
    let sql = 'SELECT a.*, u.nombre as usuario_nombre FROM asientos_contables a JOIN usuarios u ON a.usuario_id = u.id WHERE a.empresa_id = ?';
    const p = [req.empresaId];
    if (desde) { sql += ' AND a.fecha >= ?'; p.push(desde); }
    if (hasta) { sql += ' AND a.fecha <= ?'; p.push(hasta); }
    if (tipo) { sql += ' AND a.tipo = ?'; p.push(tipo); }
    return db.query(sql + ' ORDER BY a.fecha DESC, a.numero_asiento DESC LIMIT 500', p);
  });

  fastify.get('/asientos/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const asiento = await db.queryOne('SELECT * FROM asientos_contables WHERE id = ? AND empresa_id = ?', [req.params.id, req.empresaId]);
    if (!asiento) return reply.status(404).send({ error: 'No encontrado' });
    const detalles = await db.query(
      'SELECT d.*, c.codigo, c.nombre as cuenta_nombre, c.tipo, c.naturaleza FROM asiento_detalles d JOIN plan_cuentas c ON d.cuenta_id = c.id WHERE d.asiento_id = ?',
      [req.params.id]
    );
    return { ...asiento, detalles };
  });

  fastify.post('/asientos', { preHandler: [requireRole(...ROLES_CONTABLES)] }, async (req, reply) => {
    const { detalles, ...d } = req.body;
    if (!detalles?.length) return reply.status(400).send({ error: 'Se requieren líneas de asiento' });

    const totalDebe  = detalles.reduce((s, l) => s + Number(l.debe  || 0), 0);
    const totalHaber = detalles.reduce((s, l) => s + Number(l.haber || 0), 0);
    if (Math.abs(totalDebe - totalHaber) > 0.001) {
      return reply.status(400).send({ error: `Asiento no cuadra: Debe ${totalDebe.toFixed(2)} ≠ Haber ${totalHaber.toFixed(2)}` });
    }

    // Todas las cuentas deben ser de la empresa y aceptar movimientos
    const cuentaIds = [...new Set(detalles.map(l => Number(l.cuenta_id)))];
    const validas = await db.query(
      'SELECT id FROM plan_cuentas WHERE empresa_id = ? AND acepta_movimientos = 1 AND activo = 1 AND id IN (?)',
      [req.empresaId, cuentaIds]
    );
    if (validas.length !== cuentaIds.length) {
      return reply.status(400).send({ error: 'Hay cuentas inválidas o que no aceptan movimientos' });
    }

    return db.transaction(async (conn) => {
      const [last] = await conn.query(
        'SELECT COALESCE(MAX(CAST(SUBSTRING(numero_asiento, 3) AS UNSIGNED)), 0) + 1 AS n FROM asientos_contables WHERE empresa_id = ?',
        [req.empresaId]
      );
      const numeroAsiento = `AS${dayjs(d.fecha).format('YYYY')}${String(last[0].n).padStart(6,'0')}`;

      const [res] = await conn.query(
        `INSERT INTO asientos_contables (empresa_id, numero_asiento, fecha, descripcion, tipo, referencia_tipo, referencia_id, total_debe, total_haber, estado, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.empresaId, numeroAsiento, d.fecha, d.descripcion, d.tipo||'MANUAL',
         d.referencia_tipo||null, d.referencia_id||null, totalDebe, totalHaber,
         d.contabilizar ? 'CONTABILIZADO' : 'BORRADOR', req.usuario.id]
      );

      const asientoId = res.insertId;
      for (const linea of detalles) {
        await conn.query(
          'INSERT INTO asiento_detalles (asiento_id, empresa_id, cuenta_id, descripcion, debe, haber) VALUES (?,?,?,?,?,?)',
          [asientoId, req.empresaId, linea.cuenta_id, linea.descripcion||null, linea.debe||0, linea.haber||0]
        );
      }

      return reply.status(201).send({ id: asientoId, numero_asiento: numeroAsiento });
    });
  });

  // Contabilizar asiento (BORRADOR → CONTABILIZADO)
  fastify.post('/asientos/:id/contabilizar', { preHandler: [requireRole(...ROLES_CONTABLES)] }, async (req) => {
    await db.execute(
      "UPDATE asientos_contables SET estado = 'CONTABILIZADO' WHERE id = ? AND empresa_id = ? AND estado = 'BORRADOR'",
      [req.params.id, req.empresaId]
    );
    return { ok: true };
  });

  // ======== INFORMES CONTABLES ========

  // Balance de Comprobación
  fastify.get('/balance-comprobacion', { preHandler: [authenticate] }, async (req) => {
    const { hasta } = req.query;
    const fechaHasta = hasta || dayjs().format('YYYY-MM-DD');
    return db.query(
      `SELECT c.codigo, c.nombre, c.tipo, c.naturaleza,
              COALESCE(SUM(d.debe), 0) as total_debe,
              COALESCE(SUM(d.haber), 0) as total_haber,
              CASE WHEN c.naturaleza = 'DEUDORA'
                   THEN COALESCE(SUM(d.debe), 0) - COALESCE(SUM(d.haber), 0)
                   ELSE COALESCE(SUM(d.haber), 0) - COALESCE(SUM(d.debe), 0)
              END as saldo
       FROM plan_cuentas c
       LEFT JOIN asiento_detalles d ON c.id = d.cuenta_id
       LEFT JOIN asientos_contables a ON d.asiento_id = a.id AND a.estado = 'CONTABILIZADO' AND a.fecha <= ?
       WHERE c.empresa_id = ? AND c.acepta_movimientos = 1
       GROUP BY c.id ORDER BY c.codigo`,
      [fechaHasta, req.empresaId]
    );
  });

  // Estado de Resultados
  fastify.get('/estado-resultados', { preHandler: [authenticate] }, async (req) => {
    const { desde, hasta } = req.query;
    const ingresos = await db.query(
      `SELECT c.codigo, c.nombre, COALESCE(SUM(d.haber - d.debe), 0) as monto
       FROM plan_cuentas c
       LEFT JOIN asiento_detalles d ON c.id = d.cuenta_id
       LEFT JOIN asientos_contables a ON d.asiento_id = a.id AND a.estado = 'CONTABILIZADO'
                                         ${desde ? 'AND a.fecha >= ?' : ''} ${hasta ? 'AND a.fecha <= ?' : ''}
       WHERE c.empresa_id = ? AND c.tipo IN ('INGRESO') AND c.acepta_movimientos = 1
       GROUP BY c.id HAVING monto != 0 ORDER BY c.codigo`,
      [...(desde ? [desde] : []), ...(hasta ? [hasta] : []), req.empresaId]
    );
    const costos = await db.query(
      `SELECT c.codigo, c.nombre, COALESCE(SUM(d.debe - d.haber), 0) as monto
       FROM plan_cuentas c
       LEFT JOIN asiento_detalles d ON c.id = d.cuenta_id
       LEFT JOIN asientos_contables a ON d.asiento_id = a.id AND a.estado = 'CONTABILIZADO'
                                         ${desde ? 'AND a.fecha >= ?' : ''} ${hasta ? 'AND a.fecha <= ?' : ''}
       WHERE c.empresa_id = ? AND c.tipo IN ('COSTO','GASTO') AND c.acepta_movimientos = 1
       GROUP BY c.id HAVING monto != 0 ORDER BY c.codigo`,
      [...(desde ? [desde] : []), ...(hasta ? [hasta] : []), req.empresaId]
    );
    const totalIngresos = ingresos.reduce((s, r) => s + Number(r.monto), 0);
    const totalCostos   = costos.reduce((s, r) => s + Number(r.monto), 0);
    return { ingresos, costos, totalIngresos, totalCostos, utilidad: totalIngresos - totalCostos };
  });

  // Libro Mayor por cuenta
  fastify.get('/mayor/:cuenta_id', { preHandler: [authenticate] }, async (req) => {
    const { desde, hasta } = req.query;
    const cuenta = await db.queryOne('SELECT * FROM plan_cuentas WHERE id = ? AND empresa_id = ?', [req.params.cuenta_id, req.empresaId]);
    if (!cuenta) return { error: 'Cuenta no encontrada' };
    let sql = `SELECT a.fecha, a.numero_asiento, a.descripcion as asiento_desc,
                      d.descripcion, d.debe, d.haber
               FROM asiento_detalles d
               JOIN asientos_contables a ON d.asiento_id = a.id
               WHERE d.cuenta_id = ? AND d.empresa_id = ? AND a.estado = 'CONTABILIZADO'`;
    const p = [req.params.cuenta_id, req.empresaId];
    if (desde) { sql += ' AND a.fecha >= ?'; p.push(desde); }
    if (hasta) { sql += ' AND a.fecha <= ?'; p.push(hasta); }
    const movimientos = await db.query(sql + ' ORDER BY a.fecha, a.id', p);

    // Calcular saldo corriente
    let saldo = 0;
    const conSaldo = movimientos.map(m => {
      saldo += (cuenta.naturaleza === 'DEUDORA')
        ? Number(m.debe) - Number(m.haber)
        : Number(m.haber) - Number(m.debe);
      return { ...m, saldo };
    });

    return { cuenta, movimientos: conSaldo };
  });
};
