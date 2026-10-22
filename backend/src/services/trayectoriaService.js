// Refleja en la ficha del trabajador (empleados) el último movimiento de
// trayectoria cuya fecha de aplicación ya llegó. Cada movimiento se aplica una
// sola vez (columna `aplicado`), así una edición manual posterior de la ficha
// no se sobrescribe. El salario solo se copia si está en la moneda de la nómina.
const db = require('../db/database');

async function sincronizarTrayectoria(empresaId = null) {
  try {
    await aplicar(empresaId);
  } catch (err) {
    // No debe impedir listar trabajadores ni registrar movimientos
    console.error('[TRAYECTORIA] sincronización:', err.message);
  }
}

async function aplicar(empresaId) {
  const filtro = empresaId ? 'AND e.empresa_id = ?' : '';
  const params = empresaId ? [empresaId] : [];
  await db.execute(
    `UPDATE empleados e
     JOIN trayectoria_laboral t ON t.id = (
       SELECT t2.id FROM trayectoria_laboral t2
       WHERE t2.empresa_id = e.empresa_id AND t2.empleado_id = e.id
         AND t2.aplicado = 0 AND t2.fecha_aplicacion <= CURDATE()
       ORDER BY t2.fecha_aplicacion DESC, t2.id DESC LIMIT 1)
     LEFT JOIN config_nomina c ON c.empresa_id = e.empresa_id
     SET e.cargo = t.cargo,
         e.departamento = COALESCE(t.departamento, e.departamento),
         e.salario_base = IF(t.moneda = COALESCE(c.moneda_nomina, 'USD'), t.salario_base, e.salario_base)
     WHERE 1=1 ${filtro}`,
    params
  );
  await db.execute(
    `UPDATE trayectoria_laboral SET aplicado = 1
     WHERE aplicado = 0 AND fecha_aplicacion <= CURDATE() ${empresaId ? 'AND empresa_id = ?' : ''}`,
    params
  );
}

module.exports = { sincronizarTrayectoria };
