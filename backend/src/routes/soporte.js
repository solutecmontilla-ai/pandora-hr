const { authenticate, requireRole } = require('../middleware/auth');
const db = require('../db/database');

module.exports = async (fastify) => {
  fastify.get('/', { preHandler: [authenticate] }, async (req) => {
    return db.query('SELECT t.*, u.nombre as usuario_nombre FROM tickets_soporte t JOIN usuarios u ON t.usuario_id = u.id WHERE t.empresa_id = ? ORDER BY t.created_at DESC', [req.empresaId]);
  });

  fastify.post('/', { preHandler: [authenticate] }, async (req, reply) => {
    const d = req.body;
    const res = await db.execute(
      'INSERT INTO tickets_soporte (empresa_id, usuario_id, asunto, descripcion, prioridad) VALUES (?,?,?,?,?)',
      [req.empresaId, req.usuario.id, d.asunto, d.descripcion, d.prioridad||'MEDIA']
    );
    return reply.status(201).send({ id: res.insertId });
  });

  // Responder ticket (superadmin)
  fastify.put('/:id/responder', { preHandler: [requireRole('SUPERADMIN')] }, async (req) => {
    await db.execute(
      "UPDATE tickets_soporte SET respuesta=?, estado='RESUELTO', respondido_por=?, fecha_respuesta=NOW(), updated_at=NOW() WHERE id=?",
      [req.body.respuesta, req.usuario.id, req.params.id]
    );
    return { ok: true };
  });
};
