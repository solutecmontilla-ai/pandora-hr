const db = require('../db/database');
const auditService = require('../services/auditService');

// Verifica JWT y adjunta usuario + empresa + permisos del plan al request
async function authenticate(request, reply) {
  try {
    await request.jwtVerify();
    const user = await db.queryOne(
      `SELECT u.*, e.activo as empresa_activa, e.plan_id, e.fecha_vencimiento_plan,
              p.max_facturas_mes, p.nombre as plan_nombre,
              p.tiene_retenciones, p.tiene_guias, p.tiene_inventario,
              p.tiene_compras, p.tiene_contabilidad, p.tiene_nomina
       FROM usuarios u
       JOIN empresas e ON e.id = ?
       JOIN planes_saas p ON e.plan_id = p.id
       WHERE u.id = ? AND u.activo = 1`,
      [request.user.empresa_id, request.user.id]
    );

    if (!user) return reply.status(401).send({ error: 'Usuario no encontrado' });
    if (!user.empresa_activa) return reply.status(403).send({ error: 'Empresa suspendida' });
    if (user.fecha_vencimiento_plan && new Date(user.fecha_vencimiento_plan) < new Date()) {
      return reply.status(402).send({ error: 'Plan vencido. Renueva tu suscripción.' });
    }

    request.usuario = user;
    request.empresaId = request.user.empresa_id; // empresa activa en el JWT
  } catch (err) {
    return reply.status(401).send({ error: 'Token inválido' });
  }
}

async function requireSuperadmin(request, reply) {
  await authenticate(request, reply);
  if (request.usuario?.rol !== 'SUPERADMIN') {
    return reply.status(403).send({ error: 'Acceso denegado' });
  }
}

function requireRole(...roles) {
  return async (request, reply) => {
    await authenticate(request, reply);
    if (!roles.includes(request.usuario?.rol)) {
      return reply.status(403).send({ error: `Se requiere rol: ${roles.join(' o ')}` });
    }
  };
}

function requireTenant(tableName, idParam = 'id') {
  return async (request, reply) => {
    const resourceId = request.params[idParam];
    const resource = await db.queryOne(`SELECT empresa_id FROM ${tableName} WHERE id = ?`, [resourceId]);
    if (!resource) return reply.status(404).send({ error: 'Recurso no encontrado' });
    if (resource.empresa_id !== request.empresaId) {
      return reply.status(403).send({ error: 'Acceso denegado' });
    }
  };
}

module.exports = { authenticate, requireSuperadmin, requireRole, requireTenant };
