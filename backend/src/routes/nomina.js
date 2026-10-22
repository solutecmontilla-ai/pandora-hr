// ============================================================
// RUTAS: NÓMINA / REMUNERACIONES
// Legislación: LOTTT, LOPCYMAT, Ley IVSS, LBCV, Ley Alimentación
// ============================================================
const nominaRoute = async (fastify) => {
  const db = require('../db/database');
  const { authenticate } = require('../middleware/auth');
  const { sendMail } = require('../services/emailService');
  const { sincronizarTrayectoria } = require('../services/trayectoriaService');

  const IVSS_TRABAJADOR  = 0.04;
  const FAOV_TRABAJADOR  = 0.01;
  const FAOV_PATRONAL    = 0.02;
  const INCES_PATRONAL   = 0.02;
  const INCES_TRABAJADOR = 0.005;
  const RPE_TRABAJADOR   = 0.005; // Régimen Prestacional de Empleo
  const RPE_PATRONAL     = 0.02;
  const SALARIO_MINIMO_BS = 130;  // Bs. — Decreto N° 4.686, vigente 01/05/2022

  // Lunes por defecto según tipo de período (base de cálculo IVSS/RPE)
  const defLunes = (tipo) => {
    if (tipo?.startsWith('SEMANAL')) return 1;
    if (tipo?.startsWith('QUINCENAL')) return 2;
    return 4; // MENSUAL
  };

  // Calcula parafiscales con base semanal y topes legales
  const calcParafiscales = (salBase, lunes, tasa, monedaNomina, porcPatronal, aplicaInces) => {
    const isBS      = (monedaNomina || 'USD') === 'BS';
    const salMinPri = isBS ? SALARIO_MINIMO_BS : SALARIO_MINIMO_BS / tasa;
    const base      = (salBase * 12 / 52) * lunes;
    const topeIvss  = salMinPri * 5;
    const topeRpe   = salMinPri * 10;
    const baseIvss  = Math.min(base, topeIvss);
    const baseRpe   = Math.min(base, topeRpe);
    return {
      ivss_t:  baseIvss * IVSS_TRABAJADOR,
      rpe_t:   baseRpe  * RPE_TRABAJADOR,
      faov_t:  salBase  * FAOV_TRABAJADOR,
      ivss_p:  baseIvss * porcPatronal,
      rpe_p:   baseRpe  * RPE_PATRONAL,
      faov_p:  salBase  * FAOV_PATRONAL,
      inces_p: aplicaInces ? salBase * INCES_PATRONAL : 0,
    };
  };

  // Días hábiles/descanso por defecto según tipo de período
  const DIAS_DEFAULTS = {
    SEMANAL:      { habiles: 5,  descanso: 2 },
    SEMANAL_1:    { habiles: 5,  descanso: 2 },
    SEMANAL_2:    { habiles: 5,  descanso: 2 },
    SEMANAL_3:    { habiles: 5,  descanso: 2 },
    SEMANAL_4:    { habiles: 5,  descanso: 2 },
    SEMANAL_5:    { habiles: 5,  descanso: 2 },
    QUINCENAL_1:  { habiles: 11, descanso: 4 },
    QUINCENAL_2:  { habiles: 11, descanso: 4 },
    MENSUAL:      { habiles: 22, descanso: 8 },
  };

  // ─────────────────────────────────────────────
  // CONFIG NÓMINA
  // ─────────────────────────────────────────────
  fastify.get('/config', { preHandler: [authenticate] }, async (req) => {
    let cfg = await db.queryOne('SELECT * FROM config_nomina WHERE empresa_id=?', [req.empresaId]);
    if (!cfg) {
      await db.execute('INSERT INTO config_nomina (empresa_id) VALUES (?)', [req.empresaId]);
      cfg = await db.queryOne('SELECT * FROM config_nomina WHERE empresa_id=?', [req.empresaId]);
    }
    return cfg;
  });

  fastify.put('/config', { preHandler: [authenticate] }, async (req, reply) => {
    const {
      cesta_ticket_dias, cesta_ticket_valor_dia,
      dias_utilidades, dias_vacaciones, dias_bono_vacacional,
      riesgo_ivss, aplica_inces, moneda_nomina, tipo_nomina,
      banco_pagador, tipo_cuenta_origen, cuenta_origen,
      concepto_pago, formato_txt, incluir_encabezado
    } = req.body;
    const porcentaje = riesgo_ivss === 'MEDIO' ? 10 : riesgo_ivss === 'MAXIMO' ? 11 : 9;
    const tipoCta  = ['CORRIENTE','AHORRO'].includes(tipo_cuenta_origen) ? tipo_cuenta_origen : 'CORRIENTE';
    const fmtTxt   = ['TAB','CSV_COMA','CSV_PUNTOCOMA','ANCHO_FIJO'].includes(formato_txt) ? formato_txt : 'TAB';
    const tipoNom  = ['SEMANAL','QUINCENAL','MENSUAL'].includes(tipo_nomina) ? tipo_nomina : 'MENSUAL';
    const incEnc   = incluir_encabezado ? 1 : 0;
    await db.execute(
      `INSERT INTO config_nomina
        (empresa_id, cesta_ticket_dias, cesta_ticket_valor_dia, dias_utilidades, dias_vacaciones,
         dias_bono_vacacional, riesgo_ivss, porcentaje_ivss_patronal, aplica_inces, moneda_nomina, tipo_nomina,
         banco_pagador, tipo_cuenta_origen, cuenta_origen, concepto_pago, formato_txt, incluir_encabezado)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
        cesta_ticket_dias=?, cesta_ticket_valor_dia=?, dias_utilidades=?, dias_vacaciones=?,
        dias_bono_vacacional=?, riesgo_ivss=?, porcentaje_ivss_patronal=?, aplica_inces=?, moneda_nomina=?, tipo_nomina=?,
        banco_pagador=?, tipo_cuenta_origen=?, cuenta_origen=?, concepto_pago=?, formato_txt=?, incluir_encabezado=?`,
      [req.empresaId, cesta_ticket_dias, cesta_ticket_valor_dia, dias_utilidades, dias_vacaciones,
       dias_bono_vacacional, riesgo_ivss, porcentaje, aplica_inces, moneda_nomina || 'USD', tipoNom,
       banco_pagador || null, tipoCta, cuenta_origen || null,
       concepto_pago || 'PAGO DE NOMINA', fmtTxt, incEnc,
       cesta_ticket_dias, cesta_ticket_valor_dia, dias_utilidades, dias_vacaciones,
       dias_bono_vacacional, riesgo_ivss, porcentaje, aplica_inces, moneda_nomina || 'USD', tipoNom,
       banco_pagador || null, tipoCta, cuenta_origen || null,
       concepto_pago || 'PAGO DE NOMINA', fmtTxt, incEnc]
    );
    return { ok: true };
  });

  // ─────────────────────────────────────────────
  // PARÁMETROS BANCARIOS POR TIPO DE NÓMINA (R5-11.3)
  // ─────────────────────────────────────────────
  fastify.get('/bancos', { preHandler: [authenticate] }, async (req) => {
    return db.query(
      'SELECT tipo_nomina, banco, cuenta_origen FROM config_bancaria_nomina WHERE empresa_id=?',
      [req.empresaId]
    );
  });

  fastify.put('/bancos', { preHandler: [authenticate] }, async (req, reply) => {
    const TIPOS = ['SALARIOS','CESTA_TICKET','VACACIONES','UTILIDADES','ESPECIALES'];
    const { tipo_nomina, banco, cuenta_origen } = req.body;
    if (!TIPOS.includes(tipo_nomina))
      return reply.status(400).send({ error: 'tipo_nomina inválido' });
    const cuenta = cuenta_origen ? String(cuenta_origen).replace(/[^0-9]/g, '').slice(0, 20) : null;
    await db.execute(
      `INSERT INTO config_bancaria_nomina (empresa_id, tipo_nomina, banco, cuenta_origen)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE banco=?, cuenta_origen=?`,
      [req.empresaId, tipo_nomina, banco || null, cuenta, banco || null, cuenta]
    );
    return { ok: true };
  });

  // ─────────────────────────────────────────────
  // EMPLEADOS
  // ─────────────────────────────────────────────
  fastify.get('/empleados', { preHandler: [authenticate] }, async (req) => {
    const { activo, estado_trabajador } = req.query;
    await sincronizarTrayectoria(req.empresaId);
    let sql = 'SELECT * FROM empleados WHERE empresa_id=?';
    const p = [req.empresaId];
    if (activo !== undefined) { sql += ' AND activo=?'; p.push(activo); }
    if (estado_trabajador) { sql += ' AND estado_trabajador=?'; p.push(estado_trabajador); }
    return db.query(sql + ' ORDER BY apellido, nombre', p);
  });

  fastify.get('/empleados/:id', { preHandler: [authenticate] }, async (req, reply) => {
    await sincronizarTrayectoria(req.empresaId);
    const emp = await db.queryOne('SELECT * FROM empleados WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!emp) return reply.status(404).send({ error: 'Empleado no encontrado' });
    return emp;
  });

  // ── Trayectoria laboral ────────────────────────────────────────
  fastify.get('/trayectoria', { preHandler: [authenticate] }, async (req) => {
    const { empleado_id } = req.query;
    if (!empleado_id) return [];
    return db.query(
      `SELECT tl.*,
              u.nombre as registrado_por,
              CONCAT(s.nombre,' ',s.apellido) as supervisor_nombre,
              s.cedula as supervisor_cedula
       FROM trayectoria_laboral tl
       LEFT JOIN usuarios u ON u.id = tl.usuario_id
       LEFT JOIN empleados s ON s.id = tl.supervisor_id
       WHERE tl.empresa_id=? AND tl.empleado_id=?
       ORDER BY tl.fecha_aplicacion DESC, tl.id DESC`,
      [req.empresaId, empleado_id]
    );
  });

  fastify.post('/trayectoria', { preHandler: [authenticate] }, async (req, reply) => {
    const {
      empleado_id, tipo_movimiento, motivo, cargo, departamento,
      salario_base, moneda, fecha_aplicacion, fecha_finalizacion,
      supervisor_id, periodo_prueba, periodo_prueba_dias, notas,
    } = req.body;

    if (!empleado_id || !tipo_movimiento || !motivo || !cargo || !salario_base || !fecha_aplicacion)
      return reply.status(400).send({ error: 'Campos obligatorios faltantes' });

    const emp = await db.queryOne('SELECT id FROM empleados WHERE id=? AND empresa_id=?',
      [empleado_id, req.empresaId]);
    if (!emp) return reply.status(404).send({ error: 'Empleado no encontrado' });

    // Cierra automáticamente el movimiento vigente anterior
    await db.execute(
      `UPDATE trayectoria_laboral
       SET fecha_finalizacion = DATE_SUB(?, INTERVAL 1 DAY)
       WHERE empresa_id=? AND empleado_id=? AND fecha_finalizacion IS NULL`,
      [fecha_aplicacion, req.empresaId, empleado_id]
    );

    const r = await db.execute(
      `INSERT INTO trayectoria_laboral
        (empresa_id, empleado_id, tipo_movimiento, motivo, cargo, departamento,
         salario_base, moneda, fecha_aplicacion, fecha_finalizacion,
         supervisor_id, periodo_prueba, periodo_prueba_dias, notas, usuario_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.empresaId, empleado_id, tipo_movimiento, motivo, cargo, departamento || null,
       salario_base, moneda || 'USD', fecha_aplicacion, fecha_finalizacion || null,
       supervisor_id || null, periodo_prueba ? 1 : 0, periodo_prueba_dias || null,
       notas || null, req.usuario.id]
    );
    // Si ya entró en vigencia, el nuevo cargo se refleja de inmediato en la ficha
    await sincronizarTrayectoria(req.empresaId);
    return reply.status(201).send({ id: r.insertId });
  });

  fastify.post('/empleados', { preHandler: [authenticate] }, async (req, reply) => {
    const {
      letra_ci, cedula, nombre, segundo_nombre, apellido, segundo_apellido,
      cargo, departamento, email, telefono_movil, telefono_fijo, direccion, estado_residencia,
      fecha_ingreso, fecha_egreso, salario_base, tipo_contrato,
      banco, tipo_cuenta, numero_cuenta,
      codigo_ocupacion, nivel_instruccion, titulo_obtenido, indigena, discapacidad, embarazada,
      jornada, estado_trabajador,
      contacto1_nombre, contacto1_parentesco, contacto1_tel_movil, contacto1_tel_fijo, contacto1_email,
      contacto2_nombre, contacto2_parentesco, contacto2_tel_movil, contacto2_tel_fijo, contacto2_email
    } = req.body;
    if (!cedula || !nombre || !apellido || !fecha_ingreso || !salario_base || !cargo || !email || !telefono_movil || !direccion || !estado_residencia)
      return reply.status(400).send({ error: 'Campos obligatorios faltantes' });
    const cedulaLimpia = cedula.replace(/\D/g, '');
    const expediente = `${cedulaLimpia}-01`;
    const r = await db.execute(
      `INSERT INTO empleados
        (empresa_id, letra_ci, cedula, nombre, segundo_nombre, apellido, segundo_apellido,
         cargo, departamento, email, telefono_movil, telefono_fijo, direccion, estado_residencia,
         fecha_ingreso, fecha_egreso, salario_base, tipo_contrato,
         banco, tipo_cuenta, numero_cuenta,
         codigo_ocupacion, nivel_instruccion, titulo_obtenido, indigena, discapacidad, embarazada,
         jornada, estado_trabajador,
         contacto1_nombre, contacto1_parentesco, contacto1_tel_movil, contacto1_tel_fijo, contacto1_email,
         contacto2_nombre, contacto2_parentesco, contacto2_tel_movil, contacto2_tel_fijo, contacto2_email,
         numero_expediente)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.empresaId, letra_ci || 'V', cedulaLimpia, nombre, segundo_nombre || null,
       apellido, segundo_apellido || null, cargo || null, departamento || null,
       email, telefono_movil, telefono_fijo || null, direccion, estado_residencia,
       fecha_ingreso, fecha_egreso || null, salario_base || null, tipo_contrato || 'FIJO',
       banco || null, tipo_cuenta || 'AHORRO', numero_cuenta || null,
       codigo_ocupacion || null, nivel_instruccion || null, titulo_obtenido || null,
       indigena ? 1 : 0, discapacidad ? 1 : 0, embarazada ? 1 : 0,
       jornada || 'DIURNA', estado_trabajador || 'ACTIVO',
       contacto1_nombre || null, contacto1_parentesco || null, contacto1_tel_movil || null, contacto1_tel_fijo || null, contacto1_email || null,
       contacto2_nombre || null, contacto2_parentesco || null, contacto2_tel_movil || null, contacto2_tel_fijo || null, contacto2_email || null,
       expediente]
    );
    return { id: r.insertId };
  });

  fastify.put('/empleados/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params;
    const {
      letra_ci, cedula, nombre, segundo_nombre, apellido, segundo_apellido,
      cargo, departamento, email, telefono_movil, telefono_fijo, direccion, estado_residencia,
      fecha_ingreso, fecha_egreso, salario_base, tipo_contrato,
      banco, tipo_cuenta, numero_cuenta,
      codigo_ocupacion, nivel_instruccion, titulo_obtenido, indigena, discapacidad, embarazada, activo,
      jornada, estado_trabajador,
      contacto1_nombre, contacto1_parentesco, contacto1_tel_movil, contacto1_tel_fijo, contacto1_email,
      contacto2_nombre, contacto2_parentesco, contacto2_tel_movil, contacto2_tel_fijo, contacto2_email
    } = req.body;
    // numero_expediente no se actualiza vía PUT — es inmutable tras la creación.
    // La fecha de ingreso tampoco: solo cambia con un reingreso.
    const prev = await db.queryOne('SELECT fecha_ingreso FROM empleados WHERE id=? AND empresa_id=?', [id, req.empresaId]);
    if (!prev) return reply.status(404).send({ error: 'Empleado no encontrado' });
    await db.execute(
      `UPDATE empleados SET
        letra_ci=?, cedula=?, nombre=?, segundo_nombre=?, apellido=?, segundo_apellido=?,
        cargo=?, departamento=?, email=?, telefono_movil=?, telefono_fijo=?,
        direccion=?, estado_residencia=?,
        fecha_ingreso=?, fecha_egreso=?,
        salario_base=?, tipo_contrato=?, banco=?, tipo_cuenta=?, numero_cuenta=?,
        codigo_ocupacion=?, nivel_instruccion=?, titulo_obtenido=?, indigena=?, discapacidad=?, embarazada=?, activo=?,
        jornada=?, estado_trabajador=?,
        contacto1_nombre=?, contacto1_parentesco=?, contacto1_tel_movil=?, contacto1_tel_fijo=?, contacto1_email=?,
        contacto2_nombre=?, contacto2_parentesco=?, contacto2_tel_movil=?, contacto2_tel_fijo=?, contacto2_email=?
       WHERE id=? AND empresa_id=?`,
      [letra_ci || 'V', cedula, nombre, segundo_nombre || null, apellido, segundo_apellido || null,
       cargo || null, departamento || null, email || null, telefono_movil || null, telefono_fijo || null,
       direccion || null, estado_residencia || null,
       prev.fecha_ingreso || fecha_ingreso, fecha_egreso || null,
       salario_base || null, tipo_contrato || 'FIJO', banco || null, tipo_cuenta || 'AHORRO', numero_cuenta || null,
       codigo_ocupacion || null, nivel_instruccion || null, titulo_obtenido || null,
       indigena ? 1 : 0, discapacidad ? 1 : 0, embarazada ? 1 : 0,
       activo !== undefined ? activo : 1,
       jornada || 'DIURNA', estado_trabajador || 'ACTIVO',
       contacto1_nombre || null, contacto1_parentesco || null, contacto1_tel_movil || null, contacto1_tel_fijo || null, contacto1_email || null,
       contacto2_nombre || null, contacto2_parentesco || null, contacto2_tel_movil || null, contacto2_tel_fijo || null, contacto2_email || null,
       id, req.empresaId]
    );
    return { ok: true };
  });

  // Reingresar trabajador: crea una ficha nueva, mantiene la anterior como histórico
  fastify.post('/empleados/:id/reingresar', { preHandler: [authenticate] }, async (req, reply) => {
    const { fecha_ingreso } = req.body;
    if (!fecha_ingreso) return reply.status(400).send({ error: 'Fecha de ingreso requerida' });

    const emp = await db.queryOne('SELECT * FROM empleados WHERE id=? AND empresa_id=?', [req.params.id, req.empresaId]);
    if (!emp) return reply.status(404).send({ error: 'Empleado no encontrado' });
    if (!emp.fecha_egreso) return reply.status(400).send({ error: 'El empleado no está egresado' });
    if (fecha_ingreso <= emp.fecha_egreso) return reply.status(400).send({ error: `La nueva fecha de ingreso debe ser posterior al egreso (${emp.fecha_egreso})` });

    // Calcular nuevo número de expediente (ej: 12345678-01 → 12345678-02)
    const partes = (emp.numero_expediente || `${emp.cedula}-00`).split('-');
    const correlativo = parseInt(partes[partes.length - 1], 10) + 1;
    const nuevoExpediente = `${emp.cedula}-${String(correlativo).padStart(2, '0')}`;

    // Crear nueva ficha copiando todos los datos personales del registro anterior
    const r = await db.execute(
      `INSERT INTO empleados
        (empresa_id, letra_ci, cedula, nombre, segundo_nombre, apellido, segundo_apellido,
         cargo, departamento, email, telefono_movil, telefono_fijo, direccion, estado_residencia,
         fecha_ingreso, fecha_egreso, salario_base, tipo_contrato,
         banco, tipo_cuenta, numero_cuenta,
         codigo_ocupacion, nivel_instruccion, indigena, discapacidad, embarazada,
         jornada, estado_trabajador,
         contacto1_nombre, contacto1_parentesco, contacto1_tel_movil, contacto1_tel_fijo, contacto1_email,
         contacto2_nombre, contacto2_parentesco, contacto2_tel_movil, contacto2_tel_fijo, contacto2_email,
         numero_expediente)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [emp.empresa_id, emp.letra_ci, emp.cedula, emp.nombre, emp.segundo_nombre,
       emp.apellido, emp.segundo_apellido, emp.cargo, emp.departamento,
       emp.email, emp.telefono_movil, emp.telefono_fijo, emp.direccion, emp.estado_residencia,
       fecha_ingreso, emp.salario_base, emp.tipo_contrato,
       emp.banco, emp.tipo_cuenta, emp.numero_cuenta,
       emp.codigo_ocupacion, emp.nivel_instruccion,
       emp.indigena, emp.discapacidad, emp.embarazada,
       emp.jornada || 'DIURNA', 'ACTIVO',
       emp.contacto1_nombre, emp.contacto1_parentesco, emp.contacto1_tel_movil, emp.contacto1_tel_fijo, emp.contacto1_email,
       emp.contacto2_nombre, emp.contacto2_parentesco, emp.contacto2_tel_movil, emp.contacto2_tel_fijo, emp.contacto2_email,
       nuevoExpediente]
    );
    return { id: r.insertId, numero_expediente: nuevoExpediente };
  });

  fastify.delete('/empleados/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const emp = await db.queryOne('SELECT * FROM empleados WHERE id=? AND empresa_id=?', [req.params.id, req.empresaId]);
    if (!emp) return reply.status(404).send({ error: 'Empleado no encontrado' });
    if (emp.activo) return reply.status(400).send({ error: 'Solo se puede eliminar un empleado desactivado' });
    // Eliminar en cascada: primero las tablas hijas sin ON DELETE CASCADE
    await db.transaction(async (conn) => {
      await conn.execute('DELETE FROM nomina_items WHERE empleado_id=?', [emp.id]);
      await conn.execute('DELETE FROM vacaciones_calculadas WHERE empleado_id=?', [emp.id]);
      // empleado_periodos ya tiene ON DELETE CASCADE, pero se borra explícitamente por claridad
      await conn.execute('DELETE FROM empleado_periodos WHERE empleado_id=?', [emp.id]);
      await conn.execute('DELETE FROM empleados WHERE id=? AND empresa_id=?', [emp.id, req.empresaId]);
    });
    return { ok: true };
  });

  // Historial de períodos de empleo (para trabajadores reingresados)
  fastify.get('/empleado-periodos', { preHandler: [authenticate] }, async (req) => {
    return db.query(
      `SELECT ep.id, ep.empleado_id, ep.fecha_ingreso, ep.fecha_egreso, ep.created_at,
              CONCAT(e.nombre, ' ', e.apellido) AS empleado_nombre,
              e.cedula, e.letra_ci, e.cargo, e.departamento,
              e.segundo_apellido, e.segundo_nombre, e.salario_base, e.tipo_contrato
       FROM empleado_periodos ep
       JOIN empleados e ON e.id = ep.empleado_id
       WHERE ep.empresa_id=?
       ORDER BY ep.fecha_egreso DESC`,
      [req.empresaId]
    );
  });

  // ─────────────────────────────────────────────
  // NÓMINAS (Períodos)
  // ─────────────────────────────────────────────
  fastify.get('/', { preHandler: [authenticate] }, async (req) => {
    return db.query('SELECT * FROM nominas WHERE empresa_id=? ORDER BY periodo DESC, tipo',
      [req.empresaId]);
  });

  fastify.post('/', { preHandler: [authenticate] }, async (req, reply) => {
    const { periodo, tipo = 'MENSUAL', subtipo = 'SALARIOS', observaciones } = req.body;
    if (!periodo) return reply.status(400).send({ error: 'Período requerido (YYYY-MM)' });
    const tasa = await db.queryOne('SELECT tasa_usd FROM tasas_bcv WHERE fecha<=CURDATE() ORDER BY fecha DESC LIMIT 1');
    const r = await db.execute(
      'INSERT INTO nominas (empresa_id, periodo, tipo, subtipo, tasa_bcv, observaciones) VALUES (?,?,?,?,?,?)',
      [req.empresaId, periodo, tipo, subtipo, tasa?.tasa_usd || null, observaciones]
    );
    return { id: r.insertId };
  });

  fastify.get('/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const nom = await db.queryOne('SELECT * FROM nominas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nom) return reply.status(404).send({ error: 'Nómina no encontrada' });
    const items = await db.query(
      `SELECT ni.*, CONCAT(e.nombre,' ',e.apellido) as empleado_nombre, e.cedula, e.jornada
       FROM nomina_items ni
       JOIN empleados e ON e.id = ni.empleado_id
       WHERE ni.nomina_id=? ORDER BY COALESCE(e.departamento,''), e.nombre`,
      [req.params.id]
    );
    return { ...nom, items };
  });

  // Procesar nómina — calcula automáticamente para empleados activos en el período
  fastify.post('/:id/procesar', { preHandler: [authenticate] }, async (req, reply) => {
    const nom = await db.queryOne('SELECT * FROM nominas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nom) return reply.status(404).send({ error: 'No encontrada' });
    if (nom.estado !== 'BORRADOR') return reply.status(400).send({ error: 'Solo se puede procesar en estado BORRADOR' });

    const cfg = await db.queryOne('SELECT * FROM config_nomina WHERE empresa_id=?', [req.empresaId]);

    // Calcular rango de fechas del período para filtrar empleados activos en ese momento
    const [yy, mm] = nom.periodo.split('-');
    const yearNum  = Number(yy);
    const monthNum = Number(mm);
    const lastDay  = new Date(yearNum, monthNum, 0).getDate();
    let periodoInicio, periodoFin;
    if (nom.tipo === 'QUINCENAL_1') {
      periodoInicio = `${yy}-${mm}-01`;
      periodoFin    = `${yy}-${mm}-15`;
    } else if (nom.tipo === 'QUINCENAL_2') {
      periodoInicio = `${yy}-${mm}-16`;
      periodoFin    = `${yy}-${mm}-${String(lastDay).padStart(2, '0')}`;
    } else {
      periodoInicio = `${yy}-${mm}-01`;
      periodoFin    = `${yy}-${mm}-${String(lastDay).padStart(2, '0')}`;
    }

    // Incluir empleados cuyo período (actual o histórico) se superpone con el período de la nómina
    const empleados = await db.query(
      `SELECT e.* FROM empleados e
       WHERE e.empresa_id=?
         AND e.fecha_ingreso <= ?
         AND (e.fecha_egreso IS NULL OR e.fecha_egreso >= ?)
       UNION
       SELECT e.* FROM empleados e
       JOIN empleado_periodos ep ON ep.empleado_id = e.id
       WHERE e.empresa_id=?
         AND ep.fecha_ingreso <= ?
         AND ep.fecha_egreso >= ?`,
      [req.empresaId, periodoFin, periodoInicio,
       req.empresaId, periodoFin, periodoInicio]
    );

    const porcPatronal = Number(cfg?.porcentaje_ivss_patronal || 9) / 100;
    const tasa = Number(nom.tasa_bcv || 1);
    const diasCfg = DIAS_DEFAULTS[nom.tipo] || { habiles: 22, descanso: 8 };

    await db.execute('DELETE FROM nomina_items WHERE nomina_id=?', [nom.id]);

    const subtipo = nom.subtipo || 'SALARIOS';

    for (const emp of empleados) {
      if (subtipo === 'ALIMENTACION') {
        // Solo cesta ticket
        const valorTicketDia = Number(cfg?.cesta_ticket_valor_dia || 0);
        const cestaTicketBs  = valorTicketDia > 0 ? valorTicketDia * 30 : 0;
        const cestaUSD       = tasa > 0 ? cestaTicketBs / tasa : 0;

        await db.execute(
          `INSERT INTO nomina_items
            (nomina_id, empleado_id, empresa_id, dias_trabajados, dias_habiles, dias_descanso,
             salario_base, cesta_ticket,
             ivss_trabajador, faov_trabajador, ivss_patronal, faov_patronal, inces_patronal,
             rpe_trabajador, rpe_patronal,
             total_asignaciones, total_deducciones, neto_pagar)
           VALUES (?,?,?,?,?,?,?,?,0,0,0,0,0,0,0,?,0,?)`,
          [nom.id, emp.id, req.empresaId,
           diasCfg.habiles, diasCfg.habiles, diasCfg.descanso,
           0, cestaUSD, cestaUSD, cestaUSD]
        );
      } else {
        // SALARIOS — sin cesta ticket
        const salBase    = Number(emp.salario_base);
        const lunes      = defLunes(nom.tipo);
        const monedaNom  = cfg?.moneda_nomina || 'USD';
        const { ivss_t, rpe_t, faov_t, ivss_p, rpe_p, faov_p, inces_p } =
          calcParafiscales(salBase, lunes, tasa, monedaNom, porcPatronal, cfg?.aplica_inces);

        const salDiario0 = salBase / 30;
        const totalAsig  = (diasCfg.habiles + diasCfg.descanso) * salDiario0;
        const totalDeduc = ivss_t + faov_t + rpe_t;
        const neto       = totalAsig - totalDeduc;

        await db.execute(
          `INSERT INTO nomina_items
            (nomina_id, empleado_id, empresa_id, dias_trabajados, dias_habiles, dias_descanso,
             salario_base, cesta_ticket,
             ivss_trabajador, faov_trabajador, ivss_patronal, faov_patronal, inces_patronal,
             rpe_trabajador, rpe_patronal, lunes_periodo,
             total_asignaciones, total_deducciones, neto_pagar)
           VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?)`,
          [nom.id, emp.id, req.empresaId,
           diasCfg.habiles, diasCfg.habiles, diasCfg.descanso,
           salBase, ivss_t, faov_t, ivss_p, faov_p, inces_p, rpe_t, rpe_p, lunes,
           totalAsig, totalDeduc, neto]
        );
      }
    }
    return { ok: true, procesados: empleados.length };
  });

  // Actualizar item individual — ajustes por empleado
  fastify.put('/:id/items/:itemId', { preHandler: [authenticate] }, async (req, reply) => {
    const nom = await db.queryOne('SELECT * FROM nominas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nom || nom.estado !== 'BORRADOR')
      return reply.status(400).send({ error: 'Nómina no editable' });

    const item = await db.queryOne('SELECT * FROM nomina_items WHERE id=? AND nomina_id=?',
      [req.params.itemId, req.params.id]);
    if (!item) return reply.status(404).send({ error: 'Item no encontrado' });

    const cfg = await db.queryOne('SELECT * FROM config_nomina WHERE empresa_id=?', [req.empresaId]);
    const porcPatronal = Number(cfg?.porcentaje_ivss_patronal || 9) / 100;
    const salBase = Number(item.salario_base);

    const {
      dias_habiles, dias_descanso,
      he_diurnas_cantidad, he_diurnas_usd,
      he_nocturnas_cantidad, he_nocturnas_usd,
      dias_adicionales_cantidad, dias_adicionales_usd,
      descuento_minutos_cantidad, descuento_minutos_usd,
      descuento_ausencias_cantidad, descuento_ausencias_usd,
      reposo_convalidado_cantidad, reposo_convalidado_usd,
      prestamos_bs, cxc_empleados_bs,
      bono_produccion, otros_ingresos, cesta_ticket,
      islr_retenido, prestamos_deduc, otras_deducciones,
      // Nuevos campos v2
      dias_feriados_cantidad, dias_feriados_usd,
      bono_nocturno_usd, bono_nocturno_tipo, bono_nocturno_dias,
      islr_porcentaje,
      vacaciones_pagadas_dias, vacaciones_pagadas_bs, vacaciones_pagadas_usd,
      bono_produccion_bs,
      lunes_periodo, notas
    } = req.body;

    const cestaVal  = Number(cesta_ticket ?? item.cesta_ticket ?? 0);
    const bpVal     = Number(bono_produccion ?? item.bono_produccion ?? 0);
    const oiVal     = Number(otros_ingresos ?? item.otros_ingresos ?? 0);
    const prest     = Number(prestamos_deduc ?? item.prestamos_deduc ?? 0);
    const otras     = Number(otras_deducciones ?? item.otras_deducciones ?? 0);

    const heD       = Number(he_diurnas_usd ?? item.he_diurnas_usd ?? 0);
    const heN       = Number(he_nocturnas_usd ?? item.he_nocturnas_usd ?? 0);
    const dAd       = Number(dias_adicionales_usd ?? item.dias_adicionales_usd ?? 0);
    const dMin      = Number(descuento_minutos_usd ?? item.descuento_minutos_usd ?? 0);
    const dAus      = Number(descuento_ausencias_usd ?? item.descuento_ausencias_usd ?? 0);
    const rCon      = Number(reposo_convalidado_usd ?? item.reposo_convalidado_usd ?? 0);
    const feriados  = Number(dias_feriados_usd ?? item.dias_feriados_usd ?? 0);
    const bonoNoct  = Number(bono_nocturno_usd ?? item.bono_nocturno_usd ?? 0);

    // ISLR calculado desde porcentaje
    const islrPorc  = Number(islr_porcentaje ?? item.islr_porcentaje ?? 0);
    const islr      = salBase * islrPorc / 100;

    // Vacaciones pagadas
    const vacPagBs  = Number(vacaciones_pagadas_bs ?? item.vacaciones_pagadas_bs ?? 0);
    const tasa      = Number(nom.tasa_bcv || 1);
    const vacPagUSD = vacaciones_pagadas_usd !== undefined
      ? Number(vacaciones_pagadas_usd)
      : (tasa > 0 ? vacPagBs / tasa : 0);

    // IVSS/RPE: base semanal × lunes del período, con tope sobre salario mínimo legal
    const lunesVal   = Number(lunes_periodo ?? item.lunes_periodo ?? defLunes(nom.tipo));
    const monedaNom  = cfg?.moneda_nomina || 'USD';
    const { ivss_t, rpe_t, faov_t, ivss_p, rpe_p, faov_p, inces_p } =
      calcParafiscales(salBase, lunesVal, tasa, monedaNom, porcPatronal, cfg?.aplica_inces);

    const diasH      = Number(dias_habiles ?? item.dias_habiles ?? 0);
    const diasD      = Number(dias_descanso ?? item.dias_descanso ?? 0);
    const subtipo    = nom.subtipo || 'SALARIOS';

    let totalAsig, totalDeduc, neto;
    let dAdFinal = dAd, dAusFinal = dAus;
    if (subtipo === 'ALIMENTACION') {
      // Nómina de Cesta Ticket — todo se calcula sobre el CT diario (CT mensual / 30)
      const cestaDiario  = cestaVal / 30;
      const diasAdicCant = Number(dias_adicionales_cantidad ?? item.dias_adicionales_cantidad ?? 0);
      const diasAusCant  = Number(descuento_ausencias_cantidad ?? item.descuento_ausencias_cantidad ?? 0);
      dAdFinal  = diasAdicCant * cestaDiario;
      dAusFinal = diasAusCant * cestaDiario;
      totalAsig  = (diasH + diasD + diasAdicCant) * cestaDiario;
      totalDeduc = dAusFinal;
      neto       = totalAsig - totalDeduc;
    } else {
      const salDiario = salBase / 30;
      totalAsig  = (diasH + diasD) * salDiario + heD + heN + bpVal + dAd + rCon + feriados + bonoNoct;
      totalDeduc = ivss_t + rpe_t + faov_t + islr + dMin + dAus + prest + otras + vacPagUSD;
      neto       = totalAsig - totalDeduc;
    }

    await db.execute(
      `UPDATE nomina_items SET
        dias_habiles=?, dias_descanso=?,
        he_diurnas_cantidad=?, he_diurnas_usd=?,
        he_nocturnas_cantidad=?, he_nocturnas_usd=?,
        dias_adicionales_cantidad=?, dias_adicionales_usd=?,
        descuento_minutos_cantidad=?, descuento_minutos_usd=?,
        descuento_ausencias_cantidad=?, descuento_ausencias_usd=?,
        reposo_convalidado_cantidad=?, reposo_convalidado_usd=?,
        prestamos_bs=?, cxc_empleados_bs=?,
        bono_produccion=?, otros_ingresos=?, cesta_ticket=?,
        ivss_trabajador=?, faov_trabajador=?,
        ivss_patronal=?, faov_patronal=?, inces_patronal=?,
        islr_retenido=?, prestamos_deduc=?, otras_deducciones=?,
        dias_feriados_cantidad=?, dias_feriados_usd=?,
        bono_nocturno_usd=?, bono_nocturno_tipo=?, bono_nocturno_dias=?,
        islr_porcentaje=?,
        vacaciones_pagadas_dias=?, vacaciones_pagadas_bs=?, vacaciones_pagadas_usd=?,
        rpe_trabajador=?, rpe_patronal=?,
        bono_produccion_bs=?,
        lunes_periodo=?, notas=?,
        total_asignaciones=?, total_deducciones=?, neto_pagar=?
       WHERE id=?`,
      [
        dias_habiles ?? item.dias_habiles, dias_descanso ?? item.dias_descanso,
        he_diurnas_cantidad ?? item.he_diurnas_cantidad, heD,
        he_nocturnas_cantidad ?? item.he_nocturnas_cantidad, heN,
        dias_adicionales_cantidad ?? item.dias_adicionales_cantidad, dAdFinal,
        descuento_minutos_cantidad ?? item.descuento_minutos_cantidad, dMin,
        descuento_ausencias_cantidad ?? item.descuento_ausencias_cantidad, dAusFinal,
        reposo_convalidado_cantidad ?? item.reposo_convalidado_cantidad, rCon,
        prestamos_bs ?? item.prestamos_bs ?? 0,
        cxc_empleados_bs ?? item.cxc_empleados_bs ?? 0,
        bpVal, oiVal, cestaVal,
        ivss_t, faov_t, ivss_p, faov_p, inces_p,
        islr, prest, otras,
        dias_feriados_cantidad ?? item.dias_feriados_cantidad ?? 0, feriados,
        bonoNoct,
        bono_nocturno_tipo ?? item.bono_nocturno_tipo ?? 'PERIODO',
        bono_nocturno_dias ?? item.bono_nocturno_dias ?? 0,
        islrPorc,
        vacaciones_pagadas_dias ?? item.vacaciones_pagadas_dias ?? 0,
        vacPagBs, vacPagUSD,
        rpe_t, rpe_p,
        bono_produccion_bs ?? item.bono_produccion_bs ?? 0,
        lunesVal, notas ?? item.notas ?? null,
        totalAsig, totalDeduc, neto,
        req.params.itemId
      ]
    );
    return { ok: true };
  });

  // Suspender trabajador por vacaciones
  fastify.post('/:id/items/:itemId/suspender-vacaciones', { preHandler: [authenticate] }, async (req, reply) => {
    const nom = await db.queryOne('SELECT * FROM nominas WHERE id=? AND empresa_id=?', [req.params.id, req.empresaId]);
    if (!nom || nom.estado !== 'BORRADOR') return reply.status(400).send({ error: 'Nómina no editable' });
    await db.execute(
      'UPDATE nomina_items SET suspendido_vacaciones=1, total_asignaciones=0, total_deducciones=0, neto_pagar=0 WHERE id=? AND nomina_id=?',
      [req.params.itemId, req.params.id]
    );
    return { ok: true };
  });

  // Reactivar trabajador suspendido por vacaciones
  fastify.post('/:id/items/:itemId/reactivar', { preHandler: [authenticate] }, async (req, reply) => {
    const nom = await db.queryOne('SELECT * FROM nominas WHERE id=? AND empresa_id=?', [req.params.id, req.empresaId]);
    if (!nom || nom.estado !== 'BORRADOR') return reply.status(400).send({ error: 'Nómina no editable' });
    await db.execute(
      'UPDATE nomina_items SET suspendido_vacaciones=0 WHERE id=? AND nomina_id=?',
      [req.params.itemId, req.params.id]
    );
    return { ok: true };
  });

  // Cerrar nómina
  fastify.post('/:id/cerrar', { preHandler: [authenticate] }, async (req, reply) => {
    const nom = await db.queryOne('SELECT * FROM nominas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nom) return reply.status(404).send({ error: 'No encontrada' });
    if (nom.estado !== 'BORRADOR') return reply.status(400).send({ error: 'Ya fue cerrada' });
    await db.execute(
      "UPDATE nominas SET estado='CERRADA', closed_at=NOW() WHERE id=?", [nom.id]);
    return { ok: true };
  });

  // Eliminar nómina — solo BORRADOR
  fastify.delete('/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const nom = await db.queryOne('SELECT * FROM nominas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nom) return reply.status(404).send({ error: 'No encontrada' });
    if (nom.estado !== 'BORRADOR') return reply.status(400).send({ error: 'Solo se puede eliminar en estado BORRADOR' });
    await db.execute('DELETE FROM nomina_items WHERE nomina_id=?', [nom.id]);
    await db.execute('DELETE FROM nominas WHERE id=?', [nom.id]);
    return { ok: true };
  });

  // Pre-nómina — datos completos para revisión antes de cerrar
  fastify.get('/:id/prenomina', { preHandler: [authenticate] }, async (req, reply) => {
    const nom = await db.queryOne('SELECT * FROM nominas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nom) return reply.status(404).send({ error: 'No encontrada' });
    const empresa = await db.queryOne(
      'SELECT razon_social, rif, direccion_fiscal, numero_patronal_ivss, logo_path FROM empresas WHERE id=?',
      [req.empresaId]);
    const items = await db.query(
      `SELECT ni.*, CONCAT(e.nombre,' ',e.apellido) as empleado_nombre,
              e.cedula, e.letra_ci, e.cargo, e.departamento, e.fecha_ingreso,
              e.numero_expediente, e.salario_base as salario_base_emp,
              e.banco, e.tipo_cuenta, e.numero_cuenta, e.email
       FROM nomina_items ni
       JOIN empleados e ON e.id = ni.empleado_id
       WHERE ni.nomina_id=? ORDER BY COALESCE(e.departamento,''), e.nombre`,
      [nom.id]
    );
    const usuarioNom = nom.usuario_id
      ? await db.queryOne('SELECT nombre FROM usuarios WHERE id=?', [nom.usuario_id])
      : null;
    return { nomina: nom, empresa, items, usuario_nombre: usuarioNom?.nombre || null };
  });

  // Enviar recibo de pago al correo del trabajador
  fastify.post('/recibo/email', { preHandler: [authenticate] }, async (req, reply) => {
    const { empleado_id, asunto, html } = req.body;
    if (!empleado_id || !html)
      return reply.status(400).send({ error: 'Faltan datos del recibo' });
    const emp = await db.queryOne(
      'SELECT email, CONCAT(nombre," ",apellido) as nombre FROM empleados WHERE id=? AND empresa_id=?',
      [empleado_id, req.empresaId]
    );
    if (!emp) return reply.status(404).send({ error: 'Trabajador no encontrado' });
    if (!emp.email) return reply.status(400).send({ error: 'El trabajador no tiene correo registrado' });
    try {
      await sendMail({
        to: emp.email,
        subject: asunto || 'Recibo de pago de nómina de salario',
        html
      });
      return { ok: true, email: emp.email };
    } catch (e) {
      return reply.status(500).send({ error: 'No se pudo enviar el correo: ' + e.message });
    }
  });

  // ─────────────────────────────────────────────
  // RESUMEN / TOTALES
  // ─────────────────────────────────────────────
  fastify.get('/:id/resumen', { preHandler: [authenticate] }, async (req, reply) => {
    const nom = await db.queryOne('SELECT * FROM nominas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nom) return reply.status(404).send({ error: 'No encontrada' });
    const totales = await db.queryOne(
      `SELECT
        COUNT(*) as total_empleados,
        SUM(salario_base) as total_salarios,
        SUM(cesta_ticket) as total_cesta,
        SUM(he_diurnas_usd) as total_he_diurnas,
        SUM(he_nocturnas_usd) as total_he_nocturnas,
        SUM(dias_adicionales_usd) as total_dias_adicionales,
        SUM(bono_produccion) as total_bonos,
        SUM(total_asignaciones) as total_asignaciones,
        SUM(ivss_trabajador) as total_ivss_t,
        SUM(faov_trabajador) as total_faov_t,
        SUM(rpe_trabajador) as total_rpe_t,
        SUM(descuento_minutos_usd) as total_desc_minutos,
        SUM(descuento_ausencias_usd) as total_desc_ausencias,
        SUM(total_deducciones) as total_deducciones,
        SUM(neto_pagar) as total_neto,
        SUM(ivss_patronal) as total_ivss_p,
        SUM(faov_patronal) as total_faov_p,
        SUM(rpe_patronal) as total_rpe_p,
        SUM(inces_patronal) as total_inces_p
       FROM nomina_items WHERE nomina_id=?`, [nom.id]
    );
    return { ...nom, totales };
  });

  // ─────────────────────────────────────────────
  // VACACIONES CALCULADAS
  // ─────────────────────────────────────────────
  fastify.get('/vacaciones', { preHandler: [authenticate] }, async (req) => {
    const { empleado_id } = req.query;
    let sql = `SELECT vc.*, CONCAT(e.nombre," ",e.apellido) as empleado_nombre, e.cedula, e.letra_ci,
        e.numero_expediente, e.cargo, e.departamento, e.fecha_ingreso,
        e.banco, e.tipo_cuenta, e.numero_cuenta, e.email
       FROM vacaciones_calculadas vc JOIN empleados e ON e.id=vc.empleado_id WHERE vc.empresa_id=?`;
    const p = [req.empresaId];
    if (empleado_id) { sql += ' AND vc.empleado_id=?'; p.push(empleado_id); }
    return db.query(sql + ' ORDER BY vc.created_at DESC', p);
  });

  fastify.post('/vacaciones', { preHandler: [authenticate] }, async (req, reply) => {
    const {
      empleado_id, periodo_inicio, periodo_fin, fecha_reintegro,
      anios_servicio, dias_vacaciones, dias_bono_vacacional,
      dias_descanso_periodo, lunes_periodo_vac,
      salario_base, moneda, tasa_bcv,
      monto_vacaciones_usd, monto_vacaciones_bs,
      monto_descanso_usd, monto_descanso_bs,
      monto_bono_usd, monto_bono_bs,
      monto_total_usd, monto_total_bs,
      ivss_usd, ivss_bs, rpe_usd, rpe_bs, faov_usd, faov_bs,
      observaciones
    } = req.body;
    if (!empleado_id || !periodo_inicio || !periodo_fin) return reply.status(400).send({ error: 'Campos requeridos' });
    const r = await db.execute(
      `INSERT INTO vacaciones_calculadas
        (empresa_id, empleado_id, periodo_inicio, periodo_fin, fecha_reintegro,
         anios_servicio, dias_vacaciones, dias_bono_vacacional,
         dias_descanso_periodo, lunes_periodo_vac,
         salario_base, moneda, tasa_bcv,
         monto_vacaciones_usd, monto_vacaciones_bs,
         monto_descanso_usd, monto_descanso_bs,
         monto_bono_usd, monto_bono_bs,
         monto_total_usd, monto_total_bs,
         ivss_usd, ivss_bs, rpe_usd, rpe_bs, faov_usd, faov_bs,
         observaciones)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.empresaId, empleado_id, periodo_inicio, periodo_fin, fecha_reintegro||null,
       anios_servicio||0, dias_vacaciones||15, dias_bono_vacacional||15,
       dias_descanso_periodo||0, lunes_periodo_vac||1,
       salario_base||0, moneda||'USD', tasa_bcv||null,
       monto_vacaciones_usd||0, monto_vacaciones_bs||0,
       monto_descanso_usd||0, monto_descanso_bs||0,
       monto_bono_usd||0, monto_bono_bs||0,
       monto_total_usd||0, monto_total_bs||0,
       ivss_usd||0, ivss_bs||0, rpe_usd||0, rpe_bs||0, faov_usd||0, faov_bs||0,
       observaciones||null]
    );
    return { id: r.insertId };
  });

  // Actualizar un cálculo de vacaciones (solo en BORRADOR)
  fastify.put('/vacaciones/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const v = await db.queryOne('SELECT * FROM vacaciones_calculadas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!v) return reply.status(404).send({ error: 'No encontrado' });
    if (v.estado !== 'BORRADOR') return reply.status(400).send({ error: 'Solo se puede editar en estado BORRADOR' });
    const {
      periodo_inicio, periodo_fin, fecha_reintegro,
      anios_servicio, dias_vacaciones, dias_bono_vacacional,
      dias_descanso_periodo, lunes_periodo_vac,
      salario_base, moneda, tasa_bcv,
      monto_vacaciones_usd, monto_vacaciones_bs,
      monto_descanso_usd, monto_descanso_bs,
      monto_bono_usd, monto_bono_bs,
      monto_total_usd, monto_total_bs,
      ivss_usd, ivss_bs, rpe_usd, rpe_bs, faov_usd, faov_bs,
      observaciones
    } = req.body;
    await db.execute(
      `UPDATE vacaciones_calculadas SET
        periodo_inicio=?, periodo_fin=?, fecha_reintegro=?,
        anios_servicio=?, dias_vacaciones=?, dias_bono_vacacional=?,
        dias_descanso_periodo=?, lunes_periodo_vac=?,
        salario_base=?, moneda=?, tasa_bcv=?,
        monto_vacaciones_usd=?, monto_vacaciones_bs=?,
        monto_descanso_usd=?, monto_descanso_bs=?,
        monto_bono_usd=?, monto_bono_bs=?,
        monto_total_usd=?, monto_total_bs=?,
        ivss_usd=?, ivss_bs=?, rpe_usd=?, rpe_bs=?, faov_usd=?, faov_bs=?,
        observaciones=?
       WHERE id=?`,
      [periodo_inicio ?? v.periodo_inicio, periodo_fin ?? v.periodo_fin, fecha_reintegro || null,
       anios_servicio||0, dias_vacaciones||15, dias_bono_vacacional||15,
       dias_descanso_periodo||0, lunes_periodo_vac||1,
       salario_base||0, moneda||'BS', tasa_bcv||null,
       monto_vacaciones_usd||0, monto_vacaciones_bs||0,
       monto_descanso_usd||0, monto_descanso_bs||0,
       monto_bono_usd||0, monto_bono_bs||0,
       monto_total_usd||0, monto_total_bs||0,
       ivss_usd||0, ivss_bs||0, rpe_usd||0, rpe_bs||0, faov_usd||0, faov_bs||0,
       observaciones||null, req.params.id]
    );
    return { ok: true };
  });

  // Aprobar un cálculo de vacaciones (BORRADOR → APROBADA)
  fastify.post('/vacaciones/:id/aprobar', { preHandler: [authenticate] }, async (req, reply) => {
    const v = await db.queryOne('SELECT * FROM vacaciones_calculadas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!v) return reply.status(404).send({ error: 'No encontrado' });
    if (v.estado !== 'BORRADOR') return reply.status(400).send({ error: 'El cálculo ya fue aprobado' });
    await db.execute("UPDATE vacaciones_calculadas SET estado='APROBADA' WHERE id=?", [req.params.id]);
    return { ok: true };
  });

  // ─────────────────────────────────────────────
  // UTILIDADES / BONIFICACIÓN DE FIN DE AÑO
  // ─────────────────────────────────────────────
  fastify.get('/utilidades', { preHandler: [authenticate] }, async (req) => {
    const { ejercicio, empleado_id } = req.query;
    let sql = `SELECT u.*, CONCAT(e.nombre," ",e.apellido) as empleado_nombre,
        e.cedula, e.letra_ci, e.departamento, e.cargo, e.numero_expediente, e.fecha_ingreso, e.email
       FROM utilidades_calculadas u JOIN empleados e ON e.id=u.empleado_id
       WHERE u.empresa_id=?`;
    const p = [req.empresaId];
    if (ejercicio)   { sql += ' AND u.ejercicio_fiscal=?'; p.push(ejercicio); }
    if (empleado_id) { sql += ' AND u.empleado_id=?';      p.push(empleado_id); }
    return db.query(sql + ' ORDER BY u.ejercicio_fiscal DESC, u.created_at DESC', p);
  });

  // Aprobar un cálculo de utilidades (BORRADOR → APROBADA)
  fastify.post('/utilidades/:id/aprobar', { preHandler: [authenticate] }, async (req, reply) => {
    const u = await db.queryOne('SELECT * FROM utilidades_calculadas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!u) return reply.status(404).send({ error: 'No encontrado' });
    if (u.estado !== 'BORRADOR') return reply.status(400).send({ error: 'El cálculo ya fue aprobado' });
    await db.execute("UPDATE utilidades_calculadas SET estado='APROBADA' WHERE id=?", [req.params.id]);
    return { ok: true };
  });

  // Actualizar una fila de utilidades (Ajustar nómina / cálculo fraccionado)
  fastify.put('/utilidades/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const u = await db.queryOne('SELECT * FROM utilidades_calculadas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!u) return reply.status(404).send({ error: 'No encontrado' });
    if (u.estado !== 'BORRADOR') return reply.status(400).send({ error: 'El cálculo no es editable' });
    const { provisiones_bs, distribuible_bs, anticipo_bs, monto_total_bs,
            faov_bs, inces_bs, retenciones_bs, neto_bs, observaciones, dias_utilidades } = req.body;
    await db.execute(
      `UPDATE utilidades_calculadas SET
        dias_utilidades=?, provisiones_bs=?, distribuible_bs=?, anticipo_bs=?,
        monto_total_bs=?, faov_bs=?, inces_bs=?, retenciones_bs=?, neto_bs=?, observaciones=?
       WHERE id=?`,
      [dias_utilidades ?? u.dias_utilidades, provisiones_bs || 0, distribuible_bs || 0, anticipo_bs || 0,
       monto_total_bs || 0, faov_bs || 0, inces_bs || 0, retenciones_bs || 0, neto_bs || 0,
       observaciones ?? u.observaciones, req.params.id]
    );
    return { ok: true };
  });

  // ─────────────────────────────────────────────
  // NÓMINAS DE UTILIDADES — cálculo general
  // ─────────────────────────────────────────────
  fastify.get('/utilidades-nominas', { preHandler: [authenticate] }, async (req) => {
    return db.query(
      `SELECT nu.*, (SELECT COUNT(*) FROM utilidades_calculadas u WHERE u.nomina_utilidades_id=nu.id) AS trabajadores
       FROM nominas_utilidades nu WHERE nu.empresa_id=? ORDER BY nu.created_at DESC`,
      [req.empresaId]
    );
  });

  fastify.post('/utilidades-nominas', { preHandler: [authenticate] }, async (req, reply) => {
    const { ejercicio_fiscal, modalidad, tasa_bcv } = req.body;
    if (!ejercicio_fiscal) return reply.status(400).send({ error: 'Ejercicio fiscal requerido' });
    const mod = modalidad === 'DEFINITIVO' ? 'DEFINITIVO' : 'ANTICIPADO';
    const r = await db.execute(
      'INSERT INTO nominas_utilidades (empresa_id, ejercicio_fiscal, modalidad, tasa_bcv) VALUES (?,?,?,?)',
      [req.empresaId, ejercicio_fiscal, mod, tasa_bcv || null]
    );
    return { id: r.insertId };
  });

  fastify.delete('/utilidades-nominas/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const nu = await db.queryOne('SELECT * FROM nominas_utilidades WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nu) return reply.status(404).send({ error: 'No encontrada' });
    if (nu.estado !== 'BORRADOR') return reply.status(400).send({ error: 'Solo se puede eliminar en borrador' });
    await db.execute('DELETE FROM utilidades_calculadas WHERE nomina_utilidades_id=?', [nu.id]);
    await db.execute('DELETE FROM nominas_utilidades WHERE id=?', [nu.id]);
    return { ok: true };
  });

  fastify.get('/utilidades-nominas/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const nu = await db.queryOne('SELECT * FROM nominas_utilidades WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nu) return reply.status(404).send({ error: 'No encontrada' });
    const items = await db.query(
      `SELECT u.*, CONCAT(e.nombre," ",e.apellido) AS empleado_nombre, e.cedula, e.letra_ci,
              e.departamento, e.cargo, e.numero_expediente, e.fecha_ingreso, e.email,
              e.banco, e.tipo_cuenta, e.numero_cuenta
       FROM utilidades_calculadas u JOIN empleados e ON e.id=u.empleado_id
       WHERE u.nomina_utilidades_id=? ORDER BY COALESCE(e.departamento,''), e.nombre`,
      [nu.id]
    );
    const empresa = await db.queryOne(
      'SELECT razon_social, rif, logo_path FROM empresas WHERE id=?', [req.empresaId]
    );
    const usuario_nombre = req.usuario
      ? `${req.usuario.nombre || ''} ${req.usuario.apellido || ''}`.trim() || null
      : null;
    return { nomina: nu, items, empresa, usuario_nombre };
  });

  fastify.post('/utilidades-nominas/:id/procesar', { preHandler: [authenticate] }, async (req, reply) => {
    const nu = await db.queryOne('SELECT * FROM nominas_utilidades WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nu) return reply.status(404).send({ error: 'No encontrada' });
    if (nu.estado !== 'BORRADOR') return reply.status(400).send({ error: 'Nómina no editable' });
    const cfg = await db.queryOne('SELECT dias_utilidades, moneda_nomina FROM config_nomina WHERE empresa_id=?',
      [req.empresaId]);
    const diasUtil = Number(cfg?.dias_utilidades || 30);
    const monedaBS = cfg?.moneda_nomina === 'BS';
    const ej = nu.ejercicio_fiscal;
    const nominas = await db.query(
      `SELECT id, tipo, tasa_bcv FROM nominas WHERE empresa_id=? AND subtipo='SALARIOS' AND periodo LIKE ?`,
      [req.empresaId, `${ej}-%`]
    );
    const provByEmp = {};
    for (const n of nominas) {
      const ciclosAnuales = n.tipo?.startsWith('SEMANAL') ? 52 : n.tipo?.startsWith('QUINCENAL') ? 24 : 12;
      const tasa = Number(n.tasa_bcv || 1);
      const its = await db.query('SELECT empleado_id, salario_base FROM nomina_items WHERE nomina_id=?', [n.id]);
      for (const it of its) {
        const salBs = monedaBS ? Number(it.salario_base || 0) : Number(it.salario_base || 0) * tasa;
        provByEmp[it.empleado_id] = (provByEmp[it.empleado_id] || 0) + (salBs / 30) * (diasUtil / ciclosAnuales);
      }
    }
    await db.execute('DELETE FROM utilidades_calculadas WHERE nomina_utilidades_id=?', [nu.id]);
    let count = 0;
    for (const empId of Object.keys(provByEmp)) {
      const provisiones = provByEmp[empId];
      const monto  = provisiones;
      const faov   = monto * 0.01;
      const inces  = monto * 0.005;
      const retenc = faov + inces;
      await db.execute(
        `INSERT INTO utilidades_calculadas
          (empresa_id, empleado_id, ejercicio_fiscal, tipo, fecha_calculo, dias_utilidades,
           provisiones_bs, distribuible_bs, anticipo_bs, monto_total_bs, faov_bs, inces_bs,
           retenciones_bs, neto_bs, estado, nomina_utilidades_id)
         VALUES (?,?,?,'GENERAL',CURDATE(),?,?,0,0,?,?,?,?,?,'BORRADOR',?)`,
        [req.empresaId, empId, ej, diasUtil, provisiones, monto, faov, inces, retenc, monto - retenc, nu.id]
      );
      count++;
    }
    return { ok: true, procesados: count };
  });

  fastify.post('/utilidades-nominas/:id/cerrar', { preHandler: [authenticate] }, async (req, reply) => {
    const nu = await db.queryOne('SELECT * FROM nominas_utilidades WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nu) return reply.status(404).send({ error: 'No encontrada' });
    await db.execute("UPDATE nominas_utilidades SET estado='CERRADA' WHERE id=?", [nu.id]);
    return { ok: true };
  });

  // Provisiones de utilidades por ciclo de nómina del ejercicio (cálculo fraccionado)
  fastify.get('/utilidades/provisiones', { preHandler: [authenticate] }, async (req) => {
    const { empleado_id, ejercicio } = req.query;
    if (!empleado_id || !ejercicio) return { dias_utilidades: 0, ciclos: [] };
    const cfg = await db.queryOne(
      'SELECT dias_utilidades, moneda_nomina FROM config_nomina WHERE empresa_id=?', [req.empresaId]);
    const diasUtil = Number(cfg?.dias_utilidades || 30);
    const monedaBS = cfg?.moneda_nomina === 'BS';
    const nominas = await db.query(
      `SELECT id, periodo, tipo, tasa_bcv, estado FROM nominas
       WHERE empresa_id=? AND subtipo='SALARIOS' AND periodo LIKE ?
       ORDER BY periodo, id`,
      [req.empresaId, `${ejercicio}-%`]
    );
    const ciclos = [];
    for (const n of nominas) {
      const item = await db.queryOne(
        'SELECT salario_base FROM nomina_items WHERE nomina_id=? AND empleado_id=?',
        [n.id, empleado_id]
      );
      const ciclosAnuales = n.tipo?.startsWith('SEMANAL') ? 52
        : n.tipo?.startsWith('QUINCENAL') ? 24 : 12;
      const activo = !!item;
      let provision = 0;
      if (activo) {
        const tasa  = Number(n.tasa_bcv || 1);
        const salBs = monedaBS ? Number(item.salario_base || 0) : Number(item.salario_base || 0) * tasa;
        provision = (salBs / 30) * (diasUtil / ciclosAnuales);
      }
      ciclos.push({
        nomina_id: n.id, periodo: n.periodo, tipo: n.tipo,
        ciclos_anuales: ciclosAnuales, activo, provision_bs: provision,
      });
    }
    return { dias_utilidades: diasUtil, ciclos };
  });

  // Guardar un cálculo de utilidades (fraccionado / general)
  fastify.post('/utilidades', { preHandler: [authenticate] }, async (req, reply) => {
    const {
      empleado_id, ejercicio_fiscal, tipo, dias_utilidades,
      provisiones_bs, distribuible_bs, anticipo_bs,
      monto_total_bs, faov_bs, inces_bs, retenciones_bs, neto_bs, observaciones
    } = req.body;
    if (!empleado_id || !ejercicio_fiscal)
      return reply.status(400).send({ error: 'Campos requeridos' });
    const r = await db.execute(
      `INSERT INTO utilidades_calculadas
        (empresa_id, empleado_id, ejercicio_fiscal, tipo, fecha_calculo, dias_utilidades,
         provisiones_bs, distribuible_bs, anticipo_bs,
         monto_total_bs, faov_bs, inces_bs, retenciones_bs, neto_bs, observaciones)
       VALUES (?,?,?,?,CURDATE(),?,?,?,?,?,?,?,?,?,?)`,
      [req.empresaId, empleado_id, ejercicio_fiscal, tipo || 'FRACCIONADO', dias_utilidades || 0,
       provisiones_bs || 0, distribuible_bs || 0, anticipo_bs || 0,
       monto_total_bs || 0, faov_bs || 0, inces_bs || 0, retenciones_bs || 0, neto_bs || 0,
       observaciones || null]
    );
    return { id: r.insertId };
  });

  fastify.delete('/vacaciones/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const v = await db.queryOne('SELECT * FROM vacaciones_calculadas WHERE id=? AND empresa_id=?', [req.params.id, req.empresaId]);
    if (!v) return reply.status(404).send({ error: 'No encontrado' });
    if (v.estado !== 'BORRADOR') return reply.status(400).send({ error: 'Solo se puede eliminar en estado BORRADOR' });
    await db.execute('DELETE FROM vacaciones_calculadas WHERE id=?', [req.params.id]);
    return { ok: true };
  });

  // ─────────────────────────────────────────────
  // ARCHIVOS PLANOS / REPORTES
  // ─────────────────────────────────────────────
  fastify.get('/:id/forma-13-12', { preHandler: [authenticate] }, async (req, reply) => {
    const nom = await db.queryOne('SELECT * FROM nominas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nom) return reply.status(404).send({ error: 'No encontrada' });
    const empresa = await db.queryOne('SELECT * FROM empresas WHERE id=?', [req.empresaId]);
    const items = await db.query(
      `SELECT ni.*, CONCAT(e.nombre,' ',e.apellido) as nombre_completo,
              e.cedula, e.cargo, e.fecha_ingreso, e.fecha_egreso, e.salario_base
       FROM nomina_items ni
       JOIN empleados e ON e.id = ni.empleado_id
       WHERE ni.nomina_id=? ORDER BY e.apellido, e.nombre`,
      [nom.id]
    );
    const tasa = Number(nom.tasa_bcv || 1);
    return {
      empresa: {
        razon_social: empresa.razon_social,
        rif: empresa.rif,
        numero_patronal_ivss: empresa.numero_patronal_ivss,
        direccion: empresa.direccion_fiscal
      },
      periodo: nom.periodo,
      tasa_bcv: tasa,
      trabajadores: items.map(i => ({
        apellidos_nombres: i.nombre_completo,
        cedula: i.cedula,
        cargo: i.cargo,
        fecha_ingreso: i.fecha_ingreso,
        fecha_egreso: i.fecha_egreso,
        salario_diario_usd: (Number(i.salario_base) / 30).toFixed(4),
        salario_mensual_usd: Number(i.salario_base).toFixed(2),
        salario_mensual_bs: (Number(i.salario_base) * tasa).toFixed(2),
        ivss_trabajador_bs: (Number(i.ivss_trabajador) * tasa).toFixed(2),
        ivss_patronal_bs: (Number(i.ivss_patronal) * tasa).toFixed(2)
      }))
    };
  });

  fastify.get('/:id/archivo-faov', { preHandler: [authenticate] }, async (req, reply) => {
    const nom = await db.queryOne('SELECT * FROM nominas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nom) return reply.status(404).send({ error: 'No encontrada' });
    const empresa = await db.queryOne('SELECT * FROM empresas WHERE id=?', [req.empresaId]);
    const items = await db.query(
      `SELECT ni.*, e.cedula, e.nombre, e.apellido
       FROM nomina_items ni JOIN empleados e ON e.id = ni.empleado_id
       WHERE ni.nomina_id=?`, [nom.id]);
    const tasa = Number(nom.tasa_bcv || 1);
    const [yy, mm] = nom.periodo.split('-');
    const cuenta = (empresa.numero_cuenta_faov || '00000000000000000000').padStart(20, '0');
    const filename = `N${cuenta}${mm}${yy}.txt`;
    let txt = '';
    for (const i of items) {
      const salBs = (Number(i.salario_base) * tasa).toFixed(2);
      const aporteTrab = (Number(i.faov_trabajador) * tasa).toFixed(2);
      const aportePatr = (Number(i.faov_patronal) * tasa).toFixed(2);
      txt += `V,${i.cedula},${i.apellido.toUpperCase()},${i.nombre.toUpperCase()},${salBs},${aporteTrab},${aportePatr}\r\n`;
    }
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(txt);
  });

  fastify.get('/:id/archivo-rnet', { preHandler: [authenticate] }, async (req, reply) => {
    const nom = await db.queryOne('SELECT * FROM nominas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nom) return reply.status(404).send({ error: 'No encontrada' });
    const items = await db.query(
      `SELECT ni.*, e.cedula, e.nombre, e.apellido, e.cargo, e.fecha_ingreso,
              e.nivel_instruccion, e.codigo_ocupacion, e.indigena, e.discapacidad
       FROM nomina_items ni JOIN empleados e ON e.id = ni.empleado_id
       WHERE ni.nomina_id=?`, [nom.id]);

    let csvTrab = 'Nacionalidad;Cedula;Enfermedad;Indigena;Discapacidad;Apellidos;Nombres;FechaIngreso;Cargo;CodOcupacion;NivelInstruccion\r\n';
    let csvNom  = 'Cedula;SalarioBase;HorasExtraDiurnas;HorasExtraNocturnas;BonoProd;CestaTicket;IVSS_Trab;RPE_Trab;FAOV_Trab;INCES_Trab;IVSS_Patron;RPE_Patron;FAOV_Patron;INCES_Patron;Neto\r\n';
    const tasa = Number(nom.tasa_bcv || 1);
    for (const i of items) {
      csvTrab += `V;${i.cedula};N;${i.indigena ? 'S' : 'N'};${i.discapacidad ? 'S' : 'N'};${i.apellido.toUpperCase()};${i.nombre.toUpperCase()};${i.fecha_ingreso};${i.cargo || ''};${i.codigo_ocupacion || ''};${i.nivel_instruccion || 'NINGUNA'}\r\n`;
      const toBS = v => (Number(v) * tasa).toFixed(2);
      csvNom += `${i.cedula};${toBS(i.salario_base)};${toBS(i.he_diurnas_usd)};${toBS(i.he_nocturnas_usd)};${toBS(i.bono_produccion)};${toBS(i.cesta_ticket)};${toBS(i.ivss_trabajador)};${toBS(i.rpe_trabajador||0)};${toBS(i.faov_trabajador)};${toBS(i.inces_trabajador || 0)};${toBS(i.ivss_patronal)};${toBS(i.rpe_patronal||0)};${toBS(i.faov_patronal)};${toBS(i.inces_patronal)};${toBS(i.neto_pagar)}\r\n`;
    }
    return reply.send({ trabajadores_csv: csvTrab, nomina_csv: csvNom, periodo: nom.periodo });
  });

  // ── CONSTANCIAS (TRABAJO y EGRESO) ──────────────────────────────
  fastify.get('/constancias', { preHandler: [authenticate] }, async (req, reply) => {
    const { empleado_id, tipo } = req.query;
    let sql = `SELECT ct.*,
        CONCAT(e.apellido, ', ', e.nombre) AS empleado_nombre, e.cedula AS empleado_cedula, e.letra_ci,
        e.fecha_ingreso AS emp_fecha_ingreso, e.fecha_egreso AS emp_fecha_egreso, e.cargo AS emp_cargo,
        CONCAT(f.apellido, ', ', f.nombre) AS firmante_nombre, f.cargo AS firmante_cargo,
        u.nombre AS registrado_por
      FROM constancias_trabajo ct
      JOIN empleados e ON e.id = ct.empleado_id
      LEFT JOIN empleados f ON f.id = ct.firmante_id
      LEFT JOIN usuarios u ON u.id = ct.usuario_id
      WHERE ct.empresa_id = ?`;
    const params = [req.empresaId];
    if (empleado_id) { sql += ' AND ct.empleado_id = ?'; params.push(empleado_id); }
    if (tipo)        { sql += ' AND ct.tipo = ?';        params.push(tipo); }
    sql += ' ORDER BY ct.created_at DESC';
    const rows = await db.query(sql, params);
    return reply.send(rows);
  });

  fastify.post('/constancias', { preHandler: [authenticate] }, async (req, reply) => {
    const { empleado_id, firmante_id, tipo, dirigida_a, incluye_salario, incluye_cesta, con_membrete } = req.body;
    if (!empleado_id) return reply.status(400).send({ error: 'empleado_id requerido' });
    const emp = await db.queryOne('SELECT * FROM empleados WHERE id=? AND empresa_id=?', [empleado_id, req.empresaId]);
    if (!emp) return reply.status(404).send({ error: 'Empleado no encontrado' });
    const tipoVal = tipo === 'EGRESO' ? 'EGRESO' : 'TRABAJO';
    const r = await db.execute(
      `INSERT INTO constancias_trabajo (empresa_id, empleado_id, tipo, firmante_id, dirigida_a, incluye_salario, incluye_cesta, con_membrete, usuario_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.empresaId, empleado_id, tipoVal, firmante_id || null,
       dirigida_a || 'A quien pueda interesar',
       incluye_salario ? 1 : 0, incluye_cesta ? 1 : 0, con_membrete ? 1 : 0,
       req.usuario?.id || null]
    );
    return reply.status(201).send({ id: r.insertId });
  });

  fastify.get('/:id/archivo-tiuana', { preHandler: [authenticate] }, async (req, reply) => {
    const nom = await db.queryOne('SELECT * FROM nominas WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresaId]);
    if (!nom) return reply.status(404).send({ error: 'No encontrada' });
    const empresa = await db.queryOne('SELECT * FROM empresas WHERE id=?', [req.empresaId]);
    const items = await db.query(
      `SELECT ni.*, e.cedula, e.nombre, e.apellido, e.cargo, e.fecha_ingreso, e.fecha_egreso
       FROM nomina_items ni JOIN empleados e ON e.id = ni.empleado_id
       WHERE ni.nomina_id=?`, [nom.id]);
    const tasa = Number(nom.tasa_bcv || 1);
    const pad = (str, len, right = false) => {
      const s = String(str || '').substring(0, len);
      return right ? s.padStart(len, ' ') : s.padEnd(len, ' ');
    };
    let txt = '';
    for (const i of items) {
      const ced       = pad(i.cedula, 9);
      const ape       = pad(i.apellido.toUpperCase(), 30);
      const nom_      = pad(i.nombre.toUpperCase(), 30);
      const fi        = pad((i.fecha_ingreso || '').replace(/-/g, ''), 8);
      const cargo_    = pad(i.cargo || '', 30);
      const salMensBS = Number(i.salario_base) * tasa;
      const salSemBS  = (salMensBS / 4).toFixed(2);
      const salDiaBS  = (salMensBS / 30).toFixed(2);
      const salMensFmt = pad(salMensBS.toFixed(2), 13, true);
      const salSemFmt  = pad(salSemBS, 13, true);
      const salDiaFmt  = pad(salDiaBS, 13, true);
      const egreso    = pad((i.fecha_egreso || '').replace(/-/g, ''), 8);
      txt += `${ced}${ape}${nom_}${fi}${cargo_}${salMensFmt}${salSemFmt}${salDiaFmt}${egreso}\n`;
    }
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="TIUANA_${nom.periodo}.txt"`);
    return reply.send(txt);
  });
};

module.exports = nominaRoute;
