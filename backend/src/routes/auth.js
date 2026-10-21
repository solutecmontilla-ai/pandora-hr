// ============================================================
// RUTAS: AUTH
// ============================================================
const authRoute = async (fastify) => {
  const db = require('../db/database');
  const bcrypt = require('bcryptjs');
  const audit = require('../services/auditService');

  fastify.post('/login', async (req, reply) => {
    const { email, password } = req.body;
    const user = await db.queryOne(
      `SELECT u.*, e.rif, e.razon_social, e.activo as empresa_activa,
              p.nombre as plan_nombre, p.max_facturas_mes,
              p.tiene_retenciones, p.tiene_guias, p.tiene_inventario,
              p.tiene_compras, p.tiene_contabilidad, p.tiene_nomina
       FROM usuarios u
       JOIN empresas e ON u.empresa_id = e.id
       JOIN planes_saas p ON e.plan_id = p.id
       WHERE u.email = ? AND u.activo = 1`,
      [email]
    );
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      await audit.log('LOGIN_FALLIDO', { ip_address: audit.getIP(req), datos_nuevos: { email } });
      return reply.status(401).send({ error: 'Credenciales incorrectas' });
    }
    if (!user.empresa_activa) return reply.status(403).send({ error: 'Empresa suspendida. Contacta soporte.' });

    // Empresas adicionales a las que tiene acceso
    const otrasEmpresas = await db.query(
      `SELECT e.id, e.razon_social, e.rif
       FROM accesos_empresa ae
       JOIN empresas e ON e.id = ae.empresa_id
       WHERE ae.usuario_id = ? AND ae.activo = 1 AND e.activo = 1`,
      [user.id]
    );

    const token = fastify.jwt.sign(
      { id: user.id, empresa_id: user.empresa_id, rol: user.rol },
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    await db.execute('UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?', [user.id]);
    await audit.log('LOGIN_OK', { empresa_id: user.empresa_id, usuario_id: user.id, ip_address: audit.getIP(req) });

    return {
      token,
      user: {
        id: user.id, nombre: user.nombre, email: user.email, rol: user.rol,
        empresa: user.razon_social, rif: user.rif,
        empresa_id: user.empresa_id,
        plan: user.plan_nombre,
        permisos: {
          nomina: true,
          retenciones: !!user.tiene_retenciones,
          guias: !!user.tiene_guias,
          inventario: !!user.tiene_inventario,
          compras: !!user.tiene_compras,
          contabilidad: !!user.tiene_contabilidad,
        }
      },
      otras_empresas: otrasEmpresas
    };
  });

  // Cambiar de empresa activa (multi-empresa)
  fastify.post('/switch-empresa', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch { return reply.status(401).send({ error: 'Token inválido' }); }

    const { empresa_id } = req.body;
    const usuarioId = req.user.id;

    // Verificar que el usuario tenga acceso a esa empresa
    const acceso = await db.queryOne(
      `SELECT ae.id FROM accesos_empresa ae
       JOIN empresas e ON e.id = ae.empresa_id
       WHERE ae.usuario_id = ? AND ae.empresa_id = ? AND ae.activo = 1 AND e.activo = 1`,
      [usuarioId, empresa_id]
    );
    // También permitir si es su empresa principal
    const esPrincipal = await db.queryOne(
      'SELECT id FROM usuarios WHERE id = ? AND empresa_id = ?', [usuarioId, empresa_id]);

    if (!acceso && !esPrincipal) {
      return reply.status(403).send({ error: 'Sin acceso a esa empresa' });
    }

    const empresa = await db.queryOne(
      `SELECT e.*, p.nombre as plan_nombre, p.max_facturas_mes,
              p.tiene_retenciones, p.tiene_guias, p.tiene_inventario,
              p.tiene_compras, p.tiene_contabilidad, p.tiene_nomina
       FROM empresas e JOIN planes_saas p ON p.id = e.plan_id
       WHERE e.id = ?`, [empresa_id]
    );
    const usuario = await db.queryOne('SELECT * FROM usuarios WHERE id = ?', [usuarioId]);

    const newToken = fastify.jwt.sign(
      { id: usuarioId, empresa_id, rol: usuario.rol },
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return {
      token: newToken,
      user: {
        id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol,
        empresa: empresa.razon_social, rif: empresa.rif,
        empresa_id,
        plan: empresa.plan_nombre,
        permisos: {
          nomina: true,
          retenciones: !!empresa.tiene_retenciones,
          guias: !!empresa.tiene_guias,
          inventario: !!empresa.tiene_inventario,
          compras: !!empresa.tiene_compras,
          contabilidad: !!empresa.tiene_contabilidad,
        }
      }
    };
  });

  // Planes públicos (sin auth) para página de precios
  fastify.get('/planes-publicos', async () => {
    return db.query(
      `SELECT id, nombre, slug, precio_usd, max_facturas_mes, max_usuarios,
              tiene_retenciones, tiene_guias, tiene_inventario, tiene_compras,
              tiene_contabilidad, tiene_nomina, nivel_soporte, sla_horas,
              soporte_telefono, soporte_whatsapp
       FROM planes_saas WHERE activo = 1 AND slug != 'nomina-contabilidad' OR slug = 'nomina-contabilidad'
       ORDER BY precio_usd`
    );
  });

  // Métodos de pago públicos
  fastify.get('/metodos-pago-publicos', async () => {
    return db.query('SELECT id, nombre, descripcion FROM metodos_pago WHERE activo = 1 ORDER BY orden');
  });

  // Solicitud de adquisición de plan (pública)
  fastify.post('/solicitud-plan', async (req, reply) => {
    const { nombre_contacto, email_contacto, telefono, rif_empresa, razon_social, plan_id, metodo_pago_id, comprobante_ref } = req.body;
    if (!nombre_contacto || !email_contacto || !plan_id)
      return reply.status(400).send({ error: 'Faltan datos requeridos' });

    const plan = await db.queryOne('SELECT * FROM planes_saas WHERE id = ?', [plan_id]);
    if (!plan) return reply.status(404).send({ error: 'Plan no encontrado' });

    await db.execute(
      `INSERT INTO solicitudes_plan
        (nombre_contacto, email_contacto, telefono, rif_empresa, razon_social, plan_id, metodo_pago_id, monto_usd, comprobante_ref)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [nombre_contacto, email_contacto, telefono, rif_empresa, razon_social, plan_id, metodo_pago_id || null, plan.precio_usd, comprobante_ref || null]
    );
    return { ok: true, mensaje: 'Solicitud recibida. Te contactaremos pronto.' };
  });

  // Recuperación de contraseña
  fastify.post('/forgot-password', async (req, reply) => {
    const { email } = req.body;
    if (!email) return reply.status(400).send({ error: 'Email requerido' });
    const emailService = require('../services/emailService');
    const crypto = require('crypto');
    const user = await db.queryOne('SELECT id, nombre FROM usuarios WHERE email = ? AND activo = 1', [email]);
    if (!user) return { ok: true }; // no revelar si el email existe
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.execute(
      'INSERT INTO password_reset_tokens (usuario_id, token, expires_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE token=?, expires_at=?, used=0',
      [user.id, token, expiresAt, token, expiresAt]
    );
    const resetUrl = `${process.env.PUBLIC_URL || 'http://localhost:3002'}/reset-password?token=${token}`;
    emailService.sendMail({
      to: email,
      subject: 'Restablecer contraseña — PandoraHR',
      html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto"><div style="background:#CC0000;padding:20px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0">PandoraHR</h2></div><div style="background:#1a1a1a;padding:24px;border-radius:0 0 8px 8px;color:#ccc"><p>Hola <strong>${user.nombre}</strong>,</p><p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón a continuación:</p><a href="${resetUrl}" style="display:inline-block;background:#CC0000;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0">Restablecer contraseña</a><p style="color:#666;font-size:12px;margin-top:24px">Este enlace expira en 1 hora. Si no solicitaste esto, ignora este email.</p></div></div>`
    }).catch(err => console.error('[EMAIL] forgot-password:', err.message));
    return { ok: true };
  });

  fastify.post('/reset-password', async (req, reply) => {
    const { token, password } = req.body;
    if (!token || !password) return reply.status(400).send({ error: 'Token y contraseña requeridos' });
    if (password.length < 6) return reply.status(400).send({ error: 'Mínimo 6 caracteres' });
    const rt = await db.queryOne(
      'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > NOW()',
      [token]
    );
    if (!rt) return reply.status(400).send({ error: 'El enlace es inválido o ya expiró. Solicita uno nuevo.' });
    const hash = await bcrypt.hash(password, 12);
    await db.execute('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, rt.usuario_id]);
    await db.execute('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [rt.id]);
    return { ok: true };
  });

  fastify.post('/register', async (req, reply) => {
    const { empresa, usuario } = req.body;
    const db2 = require('../db/database');
    const exists = await db2.queryOne('SELECT id FROM empresas WHERE rif = ?', [empresa.rif]);
    if (exists) return reply.status(409).send({ error: 'RIF ya registrado' });

    return db2.transaction(async (conn) => {
      const [resE] = await conn.query(
        `INSERT INTO empresas (rif, razon_social, nombre_comercial, tipo_contribuyente, direccion_fiscal, municipio, estado, telefono, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [empresa.rif, empresa.razon_social, empresa.nombre_comercial || null, empresa.tipo_contribuyente || 'ORDINARIO', empresa.direccion_fiscal, empresa.municipio || null, empresa.estado || null, empresa.telefono || null, empresa.email]
      );
      const empresaId = resE.insertId;
      const hash = await bcrypt.hash(usuario.password, 12);
      const [resU] = await conn.query('INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol) VALUES (?,?,?,?,?)', [empresaId, usuario.nombre, usuario.email, hash, 'ADMIN']);
      const token = fastify.jwt.sign({ id: resU.insertId, empresa_id: empresaId, rol: 'ADMIN' }, { expiresIn: '8h' });
      return reply.status(201).send({ token, empresa_id: empresaId });
    });
  });
};
module.exports = authRoute;
