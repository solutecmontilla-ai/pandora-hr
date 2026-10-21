const db = require('../db/database');

/**
 * Registro de auditoría inmutable requerido por PA SNAT/2024/000121
 * Registra: IP, MAC (user-agent como proxy), usuario, timestamp, datos antes/después
 */
async function log(accion, options = {}) {
  const {
    empresa_id = null,
    usuario_id = null,
    tabla_afectada = null,
    registro_id = null,
    datos_anteriores = null,
    datos_nuevos = null,
    ip_address = '0.0.0.0',
    mac_address = null,
    user_agent = null,
    session_id = null,
    resultado = 'OK',
    mensaje_error = null
  } = options;

  try {
    await db.execute(
      `INSERT INTO audit_log
       (empresa_id, usuario_id, accion, tabla_afectada, registro_id,
        datos_anteriores, datos_nuevos, ip_address, mac_address, user_agent,
        session_id, resultado, mensaje_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        empresa_id, usuario_id, accion, tabla_afectada, registro_id,
        datos_anteriores ? JSON.stringify(datos_anteriores) : null,
        datos_nuevos ? JSON.stringify(datos_nuevos) : null,
        ip_address, mac_address, user_agent,
        session_id, resultado, mensaje_error
      ]
    );
  } catch (err) {
    // El audit no debe romper la operación principal, solo loguear
    console.error('[AUDIT ERROR]', err.message);
  }
}

// Extrae IP real del request (considera proxies Nginx)
function getIP(request) {
  return request.headers['x-real-ip'] ||
         request.headers['x-forwarded-for']?.split(',')[0].trim() ||
         request.socket?.remoteAddress ||
         '0.0.0.0';
}

// Extrae MAC del header personalizado (si el cliente lo envía, opcional)
function getMAC(request) {
  return request.headers['x-mac-address'] || null;
}

// Middleware que adjunta helpers de audit al request
function auditMiddleware(request, reply, done) {
  request.audit = (accion, opts = {}) => log(accion, {
    ...opts,
    ip_address: getIP(request),
    mac_address: getMAC(request),
    user_agent: request.headers['user-agent'],
    empresa_id: request.empresaId,
    usuario_id: request.usuario?.id
  });
  done();
}

module.exports = { log, getIP, getMAC, auditMiddleware };
