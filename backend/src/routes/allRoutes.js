// ============================================================
// Rutas compartidas: tasas, empresas, superadmin
// ============================================================
const { authenticate } = require('../middleware/auth');
const db = require('../db/database');
const bcrypt = require('bcryptjs');
const emailService = require('../services/emailService');
const fs = require('fs');
const path = require('path');
const STORAGE_PATH = process.env.STORAGE_PATH || '/app/storage';

// Rutas guardadas antes de la migración apuntan al storage de FacturaVE:
// si no existen, se busca el mismo archivo dentro de STORAGE_PATH/<carpeta>.
function resolverArchivo(ruta, carpeta) {
  if (!ruta) return null;
  if (fs.existsSync(ruta)) return ruta;
  const local = path.join(STORAGE_PATH, carpeta, path.basename(ruta));
  return fs.existsSync(local) ? local : null;
}

// ============================================================
// tasas.js - Tasa BCV
// ============================================================
const tasasRoute = async (fastify) => {
  fastify.get('/hoy', { preHandler: [authenticate] }, async () => {
    return db.queryOne('SELECT * FROM tasas_bcv WHERE fecha <= CURDATE() ORDER BY fecha DESC LIMIT 1');
  });
  fastify.get('/actual', { preHandler: [authenticate] }, async () => {
    const t = await db.queryOne('SELECT * FROM tasas_bcv WHERE fecha <= CURDATE() ORDER BY fecha DESC LIMIT 1');
    return { ...t, tasa: t ? Number(t.tasa_usd) : null };
  });
  fastify.get('/', { preHandler: [authenticate] }, async () => {
    return db.query('SELECT * FROM tasas_bcv ORDER BY fecha DESC LIMIT 30');
  });
  fastify.post('/', { preHandler: [authenticate] }, async (req, reply) => {
    const { fecha, tasa_usd } = req.body;
    await db.execute('INSERT INTO tasas_bcv (fecha,tasa_usd) VALUES (?,?) ON DUPLICATE KEY UPDATE tasa_usd=?', [fecha, tasa_usd, tasa_usd]);
    return reply.status(201).send({ ok: true });
  });
};



// ============================================================
// empresas.js - Config empresa del tenant
// ============================================================
const empresasRoute = async (fastify) => {
  fastify.get('/me', { preHandler: [authenticate] }, async (req) => {
    return db.queryOne('SELECT e.*, p.nombre as plan_nombre, p.max_facturas_mes FROM empresas e JOIN planes_saas p ON e.plan_id=p.id WHERE e.id=?', [req.empresaId]);
  });
  fastify.put('/me', { preHandler: [authenticate] }, async (req) => {
    const d = req.body;
    const prev = await db.queryOne('SELECT * FROM empresas WHERE id=?', [req.empresaId]);
    const v = (k, fallback) => d[k] !== undefined ? (d[k] || null) : (prev?.[k] ?? fallback);
    await db.execute(
      `UPDATE empresas SET razon_social=?,nombre_comercial=?,direccion_fiscal=?,municipio=?,estado=?,
         telefono=?,email=?,web=?,numero_control_inicio=?,numero_autorizacion_seniat=?,
         numero_patronal_ivss=?,numero_afiliacion_faov=?,updated_at=NOW() WHERE id=?`,
      [
        v('razon_social', prev?.razon_social),
        d.nombre_comercial !== undefined ? (d.nombre_comercial || null) : prev?.nombre_comercial,
        v('direccion_fiscal', prev?.direccion_fiscal),
        d.municipio !== undefined ? (d.municipio || null) : prev?.municipio,
        d.estado !== undefined ? (d.estado || null) : prev?.estado,
        d.telefono !== undefined ? (d.telefono || null) : prev?.telefono,
        d.email !== undefined ? (d.email || null) : prev?.email,
        d.web !== undefined ? (d.web || null) : prev?.web,
        d.numero_control_inicio !== undefined ? (d.numero_control_inicio || 1) : (prev?.numero_control_inicio || 1),
        d.numero_autorizacion_seniat !== undefined ? (d.numero_autorizacion_seniat || null) : prev?.numero_autorizacion_seniat,
        d.numero_patronal_ivss !== undefined ? (d.numero_patronal_ivss || null) : prev?.numero_patronal_ivss,
        d.numero_afiliacion_faov !== undefined ? (d.numero_afiliacion_faov || null) : prev?.numero_afiliacion_faov,
        req.empresaId,
      ]
    );
    return { ok: true };
  });

  // ── Logo ─────────────────────────────────────────────────────
  fastify.post('/logo', { preHandler: [authenticate] }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No se recibió archivo' });
    const ext = path.extname(data.filename || '').toLowerCase() || '.png';
    const dir = path.join(STORAGE_PATH, 'logos');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `empresa_${req.empresaId}${ext}`);
    const buffer = await data.toBuffer();
    fs.writeFileSync(dest, buffer);
    await db.execute('UPDATE empresas SET logo_path=? WHERE id=?', [dest, req.empresaId]);
    return { ok: true };
  });

  fastify.get('/logo', { preHandler: [authenticate] }, async (req, reply) => {
    const emp = await db.queryOne('SELECT logo_path FROM empresas WHERE id=?', [req.empresaId]);
    const logo = resolverArchivo(emp?.logo_path, 'logos');
    if (!logo) return reply.status(404).send({ error: 'Sin logo' });
    const ext = path.extname(logo).toLowerCase();
    const mime = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.svg':'image/svg+xml' }[ext] || 'application/octet-stream';
    reply.header('Content-Type', mime);
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.send(fs.createReadStream(logo));
  });

  // ── Hoja membretada ──────────────────────────────────────────
  fastify.post('/membrete', { preHandler: [authenticate] }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No se recibió archivo' });
    const dir = path.join(STORAGE_PATH, 'membretes');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `empresa_${req.empresaId}.pdf`);
    const buffer = await data.toBuffer();
    fs.writeFileSync(dest, buffer);
    await db.execute('UPDATE empresas SET membrete_path=? WHERE id=?', [dest, req.empresaId]);
    return { ok: true };
  });

  fastify.get('/membrete', { preHandler: [authenticate] }, async (req, reply) => {
    const emp = await db.queryOne('SELECT membrete_path FROM empresas WHERE id=?', [req.empresaId]);
    const membrete = resolverArchivo(emp?.membrete_path, 'membretes');
    if (!membrete) return reply.status(404).send({ error: 'Sin membrete' });
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', 'inline; filename="membrete.pdf"');
    return reply.send(fs.createReadStream(membrete));
  });

  // ── Gestión de usuarios del tenant ──────────────────────────
  fastify.get('/me/usuarios', { preHandler: [authenticate] }, async (req) => {
    return db.query(
      'SELECT id, nombre, email, rol, activo, ultimo_login, created_at FROM usuarios WHERE empresa_id=? ORDER BY created_at',
      [req.empresaId]
    );
  });

  fastify.post('/me/usuarios', { preHandler: [authenticate] }, async (req, reply) => {
    if (!['ADMIN_SR','SUPERADMIN'].includes(req.usuario.rol))
      return reply.status(403).send({ error: 'Solo el administrador puede crear usuarios' });
    const empresa = await db.queryOne(
      'SELECT e.*, p.max_usuarios FROM empresas e JOIN planes_saas p ON e.plan_id=p.id WHERE e.id=?',
      [req.empresaId]
    );
    const count = await db.queryOne(
      'SELECT COUNT(*) as total FROM usuarios WHERE empresa_id=? AND activo=1',
      [req.empresaId]
    );
    if (empresa.max_usuarios !== -1 && count.total >= empresa.max_usuarios)
      return reply.status(400).send({ error: `Tu plan permite máximo ${empresa.max_usuarios} usuarios activos. Actualiza tu plan para agregar más.` });
    const { nombre, email, password, rol } = req.body;
    if (!nombre || !email || !password)
      return reply.status(400).send({ error: 'Nombre, email y contraseña son requeridos' });
    const existe = await db.queryOne('SELECT id FROM usuarios WHERE email=? AND empresa_id=?', [email, req.empresaId]);
    if (existe) return reply.status(409).send({ error: 'Ya existe un usuario con ese email en esta empresa' });
    const hash = await bcrypt.hash(password, 10);
    const res = await db.execute(
      'INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol) VALUES (?,?,?,?,?)',
      [req.empresaId, nombre, email, hash, rol || 'INVITADO']
    );
    return reply.status(201).send({ id: res.insertId });
  });

  fastify.put('/me/usuarios/:id', { preHandler: [authenticate] }, async (req, reply) => {
    if (!['ADMIN_SR','SUPERADMIN'].includes(req.usuario.rol))
      return reply.status(403).send({ error: 'Acceso denegado' });
    const u = await db.queryOne('SELECT * FROM usuarios WHERE id=? AND empresa_id=?', [req.params.id, req.empresaId]);
    if (!u) return reply.status(404).send({ error: 'Usuario no encontrado' });
    const { nombre, email, rol, activo, password } = req.body;
    await db.execute(
      'UPDATE usuarios SET nombre=?, email=?, rol=?, activo=? WHERE id=? AND empresa_id=?',
      [nombre || u.nombre, email || u.email, rol || u.rol, activo !== undefined ? (activo ? 1 : 0) : u.activo, req.params.id, req.empresaId]
    );
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.execute('UPDATE usuarios SET password_hash=? WHERE id=? AND empresa_id=?', [hash, req.params.id, req.empresaId]);
    }
    return { ok: true };
  });

  // ── Módulos asignados por usuario (ADMIN_EJ / INVITADO) ──────
  fastify.get('/me/usuarios/:id/modulos', { preHandler: [authenticate] }, async (req, reply) => {
    if (!['ADMIN_SR','SUPERADMIN'].includes(req.usuario.rol))
      return reply.status(403).send({ error: 'Acceso denegado' });
    const rows = await db.query(
      'SELECT modulo_id FROM usuario_modulos WHERE usuario_id=? AND empresa_id=?',
      [req.params.id, req.empresaId]
    );
    return rows.map(r => r.modulo_id);
  });

  fastify.put('/me/usuarios/:id/modulos', { preHandler: [authenticate] }, async (req, reply) => {
    if (!['ADMIN_SR','SUPERADMIN'].includes(req.usuario.rol))
      return reply.status(403).send({ error: 'Acceso denegado' });
    const u = await db.queryOne('SELECT id FROM usuarios WHERE id=? AND empresa_id=?', [req.params.id, req.empresaId]);
    if (!u) return reply.status(404).send({ error: 'Usuario no encontrado' });
    const { modulos } = req.body;
    await db.execute('DELETE FROM usuario_modulos WHERE usuario_id=? AND empresa_id=?', [req.params.id, req.empresaId]);
    for (const m of (modulos || [])) {
      await db.execute(
        'INSERT IGNORE INTO usuario_modulos (usuario_id, empresa_id, modulo_id) VALUES (?,?,?)',
        [req.params.id, req.empresaId, m]
      );
    }
    return { ok: true };
  });
};

// ============================================================
// superadmin.js
// ============================================================
const superadminRoute = async (fastify) => {
  const { requireSuperadmin } = require('../middleware/auth');
  fastify.get('/empresas', { preHandler: [requireSuperadmin] }, async () => {
    return db.query('SELECT e.*, p.nombre as plan_nombre, (SELECT COUNT(*) FROM empleados WHERE empresa_id=e.id) as total_empleados FROM empresas e JOIN planes_saas p ON e.plan_id=p.id ORDER BY e.created_at DESC');
  });
  fastify.put('/empresas/:id/plan', { preHandler: [requireSuperadmin] }, async (req) => {
    await db.execute('UPDATE empresas SET plan_id=?,fecha_vencimiento_plan=? WHERE id=?', [req.body.plan_id, req.body.fecha_vencimiento, req.params.id]);
    return { ok: true };
  });
  fastify.put('/empresas/:id/suspender', { preHandler: [requireSuperadmin] }, async (req) => {
    await db.execute('UPDATE empresas SET activo=? WHERE id=?', [req.body.activo ? 1 : 0, req.params.id]);
    return { ok: true };
  });
  fastify.get('/planes', { preHandler: [requireSuperadmin] }, async () => {
    return db.query('SELECT * FROM planes_saas ORDER BY precio_usd ASC');
  });
  fastify.put('/planes/:id', { preHandler: [requireSuperadmin] }, async (req) => {
    const { nombre, precio_usd, max_facturas_mes, max_usuarios, tiene_retenciones, tiene_guias, tiene_inventario, tiene_compras, tiene_contabilidad, tiene_nomina, nivel_soporte, sla_horas } = req.body;
    await db.execute(
      'UPDATE planes_saas SET nombre=?, precio_usd=?, max_facturas_mes=?, max_usuarios=?, tiene_retenciones=?, tiene_guias=?, tiene_inventario=?, tiene_compras=?, tiene_contabilidad=?, tiene_nomina=?, nivel_soporte=?, sla_horas=? WHERE id=?',
      [nombre, precio_usd, max_facturas_mes, max_usuarios, tiene_retenciones?1:0, tiene_guias?1:0, tiene_inventario?1:0, tiene_compras?1:0, tiene_contabilidad?1:0, tiene_nomina?1:0, nivel_soporte, sla_horas, req.params.id]
    );
    return { ok: true };
  });
  fastify.get('/stats', { preHandler: [requireSuperadmin] }, async () => {
    const [empresas, empleados, planes] = await Promise.all([
      db.queryOne('SELECT COUNT(*) as total, SUM(activo) as activas FROM empresas WHERE id > 1'),
      db.queryOne('SELECT COUNT(*) as total, SUM(activo) as activos FROM empleados'),
      db.query('SELECT p.nombre, COUNT(e.id) as empresas FROM planes_saas p LEFT JOIN empresas e ON e.plan_id=p.id GROUP BY p.id')
    ]);
    return { empresas, empleados, planes };
  });

  // ── Métodos de pago ──────────────────────────────────────────
  fastify.get('/metodos-pago', { preHandler: [requireSuperadmin] }, async () => {
    return db.query('SELECT * FROM metodos_pago ORDER BY orden, id');
  });
  fastify.post('/metodos-pago', { preHandler: [requireSuperadmin] }, async (req) => {
    const { nombre, descripcion, instrucciones, orden } = req.body;
    const r = await db.execute(
      'INSERT INTO metodos_pago (nombre, descripcion, instrucciones, orden) VALUES (?,?,?,?)',
      [nombre, descripcion, instrucciones, orden || 0]
    );
    return { id: r.insertId };
  });
  fastify.put('/metodos-pago/:id', { preHandler: [requireSuperadmin] }, async (req) => {
    const { nombre, descripcion, instrucciones, activo, orden } = req.body;
    await db.execute(
      'UPDATE metodos_pago SET nombre=?, descripcion=?, instrucciones=?, activo=?, orden=? WHERE id=?',
      [nombre, descripcion, instrucciones, activo?1:0, orden||0, req.params.id]
    );
    return { ok: true };
  });
  fastify.delete('/metodos-pago/:id', { preHandler: [requireSuperadmin] }, async (req) => {
    await db.execute('DELETE FROM metodos_pago WHERE id=?', [req.params.id]);
    return { ok: true };
  });

  // ── Solicitudes de plan ──────────────────────────────────────
  // Aprobar solicitud y crear empresa + usuario admin
  fastify.post('/solicitudes/:id/activar', { preHandler: [requireSuperadmin] }, async (req, reply) => {
    const bcrypt = require('bcryptjs');
    const sol = await db.queryOne('SELECT * FROM solicitudes_plan WHERE id=?', [req.params.id]);
    if (!sol) return reply.status(404).send({ error: 'Solicitud no encontrada' });
    if (sol.empresa_id) return reply.status(409).send({ error: 'Ya tiene empresa creada' });

    const { password, fecha_vencimiento, plan_id, direccion_fiscal, notas_admin } = req.body;
    if (!password || !sol.rif_empresa || !sol.razon_social)
      return reply.status(400).send({ error: 'Faltan datos: password, rif_empresa y razon_social son requeridos' });

    // Verificar RIF no duplicado
    const existe = await db.queryOne('SELECT id FROM empresas WHERE rif=?', [sol.rif_empresa]);
    if (existe) return reply.status(409).send({ error: 'Ya existe una empresa con ese RIF' });

    const resultado = await db.transaction(async (conn) => {
      // Crear empresa
      const [resE] = await conn.query(
        `INSERT INTO empresas (rif, razon_social, plan_id, email, telefono, direccion_fiscal, activo, fecha_vencimiento_plan)
         VALUES (?,?,?,?,?,?,1,?)`,
        [sol.rif_empresa, sol.razon_social, plan_id || sol.plan_id,
         sol.email_contacto, sol.telefono, direccion_fiscal || 'Por completar',
         fecha_vencimiento || null]
      );
      const empresaId = resE.insertId;

      // Crear usuario admin
      const hash = await bcrypt.hash(password, 12);
      const [resU] = await conn.query(
        'INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol) VALUES (?,?,?,?,?)',
        [empresaId, sol.nombre_contacto, sol.email_contacto, hash, 'ADMIN_SR']
      );

      // Actualizar solicitud
      await conn.query(
        'UPDATE solicitudes_plan SET estado=?, empresa_id=?, notas_admin=? WHERE id=?',
        ['APROBADA', empresaId, notas_admin || null, sol.id]
      );

      return {
        ok: true,
        empresa_id: empresaId,
        usuario_id: resU.insertId,
        email: sol.email_contacto,
        // Para notificar al cliente por WhatsApp
        wa_mensaje: `Hola ${sol.nombre_contacto}, tu cuenta en PandoraHR ha sido activada.\n\n🌐 Acceso: https://pandorahr.amaysgroup.com\n📧 Usuario: ${sol.email_contacto}\n🔑 Contraseña: ${password}\n\nTe recomendamos cambiar tu contraseña al ingresar.`
      };
    });
    emailService.sendMail({
      to: sol.email_contacto,
      subject: 'Bienvenido a PandoraHR — Tu cuenta está lista',
      html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto"><div style="background:#CC0000;padding:20px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0">¡Bienvenido a PandoraHR!</h2></div><div style="background:#1a1a1a;padding:24px;border-radius:0 0 8px 8px;color:#ccc"><p>Hola <strong>${sol.nombre_contacto}</strong>,</p><p>Tu cuenta ha sido activada. Ya puedes acceder al sistema de nómina y recursos humanos.</p><div style="background:#222;padding:16px;border-radius:6px;margin:16px 0;font-size:14px"><p style="margin:4px 0">🌐 <strong>Portal:</strong> ${process.env.PUBLIC_URL || 'https://pandorahr.amaysgroup.com'}</p><p style="margin:4px 0">📧 <strong>Usuario:</strong> ${sol.email_contacto}</p></div><a href="${process.env.PUBLIC_URL || 'https://pandorahr.amaysgroup.com'}/login" style="display:inline-block;background:#CC0000;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold">Ingresar al sistema</a><p style="color:#666;font-size:12px;margin-top:24px">PandoraHR · Amays Group</p></div></div>`
    }).catch(err => console.error('[EMAIL] bienvenida:', err.message));
    return resultado;
  });

  fastify.get('/solicitudes', { preHandler: [requireSuperadmin] }, async (req) => {
    const { estado } = req.query;
    let sql = `SELECT s.*, p.nombre as plan_nombre, p.precio_usd as plan_precio,
               mp.nombre as metodo_pago_nombre
               FROM solicitudes_plan s
               JOIN planes_saas p ON p.id = s.plan_id
               LEFT JOIN metodos_pago mp ON mp.id = s.metodo_pago_id`;
    const params = [];
    if (estado) { sql += ' WHERE s.estado = ?'; params.push(estado); }
    return db.query(sql + ' ORDER BY s.created_at DESC', params);
  });
  fastify.put('/solicitudes/:id', { preHandler: [requireSuperadmin] }, async (req) => {
    const { estado, notas_admin } = req.body;
    await db.execute(
      'UPDATE solicitudes_plan SET estado=?, notas_admin=? WHERE id=?',
      [estado, notas_admin, req.params.id]
    );
    return { ok: true };
  });

  // ── Accesos multi-empresa ────────────────────────────────────
  fastify.get('/accesos', { preHandler: [requireSuperadmin] }, async (req) => {
    const { usuario_id } = req.query;
    let sql = `SELECT ae.*, u.nombre as usuario_nombre, u.email as usuario_email,
               e.razon_social as empresa_nombre, e.rif as empresa_rif
               FROM accesos_empresa ae
               JOIN usuarios u ON u.id = ae.usuario_id
               JOIN empresas e ON e.id = ae.empresa_id`;
    const params = [];
    if (usuario_id) { sql += ' WHERE ae.usuario_id = ?'; params.push(usuario_id); }
    return db.query(sql + ' ORDER BY u.email, e.razon_social', params);
  });
  fastify.post('/accesos', { preHandler: [requireSuperadmin] }, async (req, reply) => {
    const { usuario_id, empresa_id } = req.body;
    // Validar que el email no esté duplicado dentro de esa empresa
    const usuario = await db.queryOne('SELECT * FROM usuarios WHERE id=?', [usuario_id]);
    if (!usuario) return reply.status(404).send({ error: 'Usuario no encontrado' });
    const duplicado = await db.queryOne(
      'SELECT id FROM usuarios WHERE email=? AND empresa_id=? AND id != ?',
      [usuario.email, empresa_id, usuario_id]
    );
    if (duplicado) return reply.status(409).send({ error: 'Ya existe un usuario con ese email en esa empresa' });
    await db.execute(
      'INSERT INTO accesos_empresa (usuario_id, empresa_id) VALUES (?,?) ON DUPLICATE KEY UPDATE activo=1',
      [usuario_id, empresa_id]
    );
    return { ok: true };
  });
  fastify.delete('/accesos/:id', { preHandler: [requireSuperadmin] }, async (req) => {
    await db.execute('UPDATE accesos_empresa SET activo=0 WHERE id=?', [req.params.id]);
    return { ok: true };
  });
  fastify.get('/usuarios', { preHandler: [requireSuperadmin] }, async (req) => {
    const { empresa_id } = req.query;
    let sql = `SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.empresa_id, u.ultimo_login,
               e.razon_social as empresa_nombre, p.max_usuarios
               FROM usuarios u JOIN empresas e ON e.id = u.empresa_id
               JOIN planes_saas p ON p.id = e.plan_id`;
    const params = [];
    if (empresa_id) { sql += ' WHERE u.empresa_id=?'; params.push(empresa_id); }
    return db.query(sql + ' ORDER BY e.razon_social, u.nombre', params);
  });

  fastify.post('/usuarios', { preHandler: [requireSuperadmin] }, async (req, reply) => {
    const { nombre, email, password, rol, empresa_id } = req.body;
    if (!nombre || !email || !password || !empresa_id)
      return reply.status(400).send({ error: 'Nombre, email, contraseña y empresa son requeridos' });
    const empresa = await db.queryOne(
      'SELECT e.*, p.max_usuarios FROM empresas e JOIN planes_saas p ON e.plan_id=p.id WHERE e.id=?', [empresa_id]
    );
    if (!empresa) return reply.status(404).send({ error: 'Empresa no encontrada' });
    const count = await db.queryOne('SELECT COUNT(*) as total FROM usuarios WHERE empresa_id=? AND activo=1', [empresa_id]);
    if (empresa.max_usuarios !== -1 && count.total >= empresa.max_usuarios)
      return reply.status(400).send({ error: `El plan de esta empresa permite máximo ${empresa.max_usuarios} usuarios activos` });
    const existe = await db.queryOne('SELECT id FROM usuarios WHERE email=? AND empresa_id=?', [email, empresa_id]);
    if (existe) return reply.status(409).send({ error: 'Ya existe un usuario con ese email en esa empresa' });
    const hash = await bcrypt.hash(password, 10);
    const res = await db.execute(
      'INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol) VALUES (?,?,?,?,?)',
      [empresa_id, nombre, email, hash, rol || 'LECTOR']
    );
    return reply.status(201).send({ id: res.insertId });
  });

  fastify.put('/usuarios/:id', { preHandler: [requireSuperadmin] }, async (req, reply) => {
    const u = await db.queryOne('SELECT * FROM usuarios WHERE id=?', [req.params.id]);
    if (!u) return reply.status(404).send({ error: 'Usuario no encontrado' });
    const { nombre, email, rol, activo, password } = req.body;
    await db.execute(
      'UPDATE usuarios SET nombre=?, email=?, rol=?, activo=? WHERE id=?',
      [nombre || u.nombre, email || u.email, rol || u.rol, activo !== undefined ? (activo ? 1 : 0) : u.activo, req.params.id]
    );
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.execute('UPDATE usuarios SET password_hash=? WHERE id=?', [hash, req.params.id]);
    }
    return { ok: true };
  });
};

module.exports.tasasRoute = tasasRoute;
module.exports.empresasRoute = empresasRoute;
module.exports.superadminRoute = superadminRoute;
