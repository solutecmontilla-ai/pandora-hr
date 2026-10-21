require('dotenv').config();
const fastify = require('fastify')({ logger: process.env.NODE_ENV !== 'production' });
const path = require('path');

// Plugins
fastify.register(require('@fastify/cors'), {
  origin: process.env.FRONTEND_URL || true,
  credentials: true
});

fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET
});

fastify.register(require('@fastify/multipart'), {
  limits: { fileSize: 10 * 1024 * 1024 }
});

fastify.register(require('@fastify/rate-limit'), {
  max: 100,
  timeWindow: '1 minute'
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, '../public'),
  prefix: '/'
});

// Rutas API
fastify.register(require('./routes/auth'),      { prefix: '/api/auth' });
fastify.register(require('./routes/empresas'),  { prefix: '/api/empresas' });
fastify.register(require('./routes/tasas'),     { prefix: '/api/tasas' });
fastify.register(require('./routes/superadmin'),    { prefix: '/api/superadmin' });
fastify.register(require('./routes/nomina'),        { prefix: '/api/nomina' });
fastify.register(require('./routes/soporte'),       { prefix: '/api/soporte' });
fastify.register(require('./routes/contabilidad'),  { prefix: '/api/contabilidad' });

// Healthcheck (Coolify)
fastify.get('/api/health', async () => ({ ok: true }));

// SPA fallback
fastify.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api')) {
    return reply.status(404).send({ error: 'Endpoint no encontrado' });
  }
  reply.sendFile('index.html');
});

const start = async () => {
  try {
    // Migraciones de esquema pendientes
    await require('./db/migraciones')();
    // Jobs programados
    require('./services/cronJobs');
    await fastify.listen({ port: process.env.PORT || 3002, host: process.env.HOST || '0.0.0.0' });
    console.log(`✅ PandoraHR corriendo en puerto ${process.env.PORT || 3002}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
