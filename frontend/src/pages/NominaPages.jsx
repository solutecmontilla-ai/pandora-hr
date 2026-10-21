import React, { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { ImagenProtegida } from '../utils/archivos';
import dayjs from 'dayjs';
import { MonedaContext } from '../components/Layout';
import { useAuth } from '../hooks/useAuth';

// ─────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────
const fmt = (v, bs = false, tasa = 1) => {
  const n = Number(v || 0);
  if (bs) return `Bs. ${(n * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
  return `$ ${n.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
};

const estadoNomBadge = { BORRADOR: 'badge-gris', CERRADA: 'badge-azul', PAGADA: 'badge-verde' };

// R5-11.3 — Catálogo de bancos de Venezuela y sus especificaciones de archivo .TXT
// `formato`: null = banco no parametrizado (mostrar "Información no parametrizada").
// Cada formato define cómo se compone la línea por trabajador.
const BANCOS_VE = [
  { nombre: 'Banco de Venezuela',         codigo: '0102', formato: 'BDV_TXT' },
  { nombre: 'Banesco',                    codigo: '0134', formato: 'BANESCO_CSV' },
  { nombre: 'Mercantil',                  codigo: '0105', formato: 'MERCANTIL_TAB' },
  { nombre: 'Provincial',                 codigo: '0108', formato: 'PROVINCIAL_FIJO' },
  { nombre: 'BNC',                        codigo: '0191', formato: 'BNC_CSV' },
  { nombre: 'Banco del Tesoro',           codigo: '0163', formato: null },
  { nombre: 'Bicentenario',               codigo: '0175', formato: null },
  { nombre: 'Exterior',                   codigo: '0115', formato: null },
  { nombre: 'Venezolano de Crédito',      codigo: '0104', formato: null },
  { nombre: 'Bancaribe',                  codigo: '0114', formato: null },
  { nombre: 'Banplus',                    codigo: '0174', formato: 'BANPLUS_TXT' },
  { nombre: 'BFC',                        codigo: '0151', formato: null },
  { nombre: 'Banco Nacional de Crédito',  codigo: '0191', formato: null },
  { nombre: 'Bancamiga',                  codigo: '0172', formato: null },
  { nombre: 'Banco Plaza',                codigo: '0138', formato: null },
  { nombre: 'Banco Caroní',               codigo: '0128', formato: null },
  { nombre: 'Bancrecer',                  codigo: '0168', formato: null },
  { nombre: 'Mi Banco',                   codigo: '0169', formato: null },
  { nombre: 'Banco Activo',               codigo: '0171', formato: null },
  { nombre: 'Sofitasa',                   codigo: '0137', formato: null },
  { nombre: '100% Banco',                 codigo: '0156', formato: null },
  { nombre: 'Banco Agrícola de Venezuela', codigo: '0166', formato: null },
  { nombre: 'Bangente',                   codigo: '0146', formato: null },
  { nombre: 'BOD',                        codigo: '0116', formato: null },
];

// Devuelve el próximo día hábil (lun-vie) a partir de la fecha dada (Date), excluyendo sáb/dom.
function proximoDiaHabil(fromDate) {
  const d = new Date(fromDate);
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() + 2);      // sábado → lunes
  else if (dow === 0) d.setDate(d.getDate() + 1); // domingo → lunes
  return d;
}

// Genera el ejemplo de .TXT según el formato del banco. Recibe 3 trabajadores ficticios.
// `ctx` opcional: { rif } para formatos que requieren datos de la empresa en la cabecera.
function previsualizarTXTBanco(bancoNombre, cuenta, ctx = {}) {
  const banco = BANCOS_VE.find(b => b.nombre === bancoNombre);
  if (!banco || !banco.formato) return null;
  const samples = [
    { ced: 'V12345678', cta: '01020001020000123456', nombre: 'JUAN PEREZ',     monto: 5430.50 },
    { ced: 'V23456789', cta: '01340002030000234567', nombre: 'MARIA RODRIGUEZ',monto: 7200.00 },
    { ced: 'V34567890', cta: '01050003040000345678', nombre: 'CARLOS GONZALEZ',monto: 4825.75 },
  ];
  const cuentaOrigen = (cuenta || '00000000000000000000').padStart(20, '0').slice(0, 20);
  const fmtFx = n => Number(n).toFixed(2);
  switch (banco.formato) {
    case 'BDV_TXT': {
      // Banco de Venezuela — formato delimitado por TAB, sin encabezado
      return samples.map(s =>
        `${s.ced}\t${s.cta}\t${fmtFx(s.monto)}\t${s.nombre}`
      ).join('\n');
    }
    case 'BANESCO_CSV': {
      // Banesco — CSV separado por coma, con cabecera de cuenta origen
      return [
        `${cuentaOrigen},NOMINA,${samples.length},${fmtFx(samples.reduce((a,s)=>a+s.monto,0))}`,
        ...samples.map(s => `${s.ced},${s.cta},${fmtFx(s.monto)},${s.nombre}`),
      ].join('\n');
    }
    case 'MERCANTIL_TAB': {
      // Mercantil — TSV con número de orden + tipo cuenta
      return samples.map((s, i) =>
        `${String(i+1).padStart(4,'0')}\t${s.ced}\tCC\t${s.cta}\t${fmtFx(s.monto)}\t${s.nombre}`
      ).join('\n');
    }
    case 'PROVINCIAL_FIJO': {
      // BBVA Provincial — ancho fijo
      const pad  = (s, n) => String(s).padEnd(n).slice(0, n);
      const padL = (s, n) => String(s).padStart(n).slice(0, n);
      return samples.map(s =>
        pad(s.ced, 12) + pad(s.cta, 20) + padL(fmtFx(s.monto).replace('.', ''), 15) + pad(s.nombre, 40)
      ).join('\n');
    }
    case 'BNC_CSV': {
      // BNC — CSV separado por punto y coma
      return samples.map(s =>
        `${s.ced};${s.cta};${fmtFx(s.monto)};${s.nombre}`
      ).join('\n');
    }
    case 'BANPLUS_TXT': {
      // Banplus — separador " ; " (espacio-punto y coma-espacio).
      // Aplica a Salarios, CT, Vacaciones, Utilidades y Especiales.
      // Montos: 2 decimales con coma decimal. Cabecera con RIF, cuenta origen,
      //         cantidad de pagos, monto total y fecha de ejecución (dd/mm/yyyy, día hábil).
      const SEP = ' ; ';
      const rif = String(ctx?.rif || 'J423032').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
      const cuentaOrig20 = cuentaOrigen.replace(/[^0-9]/g, '').padStart(20, '0').slice(0, 20);
      const cantidad = String(samples.length).slice(0, 5);
      const totalNum = samples.reduce((a, s) => a + s.monto, 0);
      const toMonto  = n => fmtFx(n).replace('.', ',').slice(0, 18);
      // Día hábil: hoy si es lun-vie, sino el siguiente lunes
      const fEjec = proximoDiaHabil(new Date());
      const dd = String(fEjec.getDate()).padStart(2, '0');
      const mm = String(fEjec.getMonth() + 1).padStart(2, '0');
      const yyyy = String(fEjec.getFullYear());
      const fechaStr = `${dd}/${mm}/${yyyy}`;
      const header = [rif, cuentaOrig20, cantidad, toMonto(totalNum), fechaStr].join(SEP);
      const detalle = samples.map(s => {
        const cedNumStr = String(s.ced).replace(/[^0-9]/g, '').slice(0, 15); // sólo dígitos
        const tipoDoc   = s.ced.toUpperCase().startsWith('E') ? '08' : '01'; // 01 ven · 08 ext
        const nombre    = s.nombre.toUpperCase().replace(/[^A-ZÑÁÉÍÓÚÜ ]/g, '').slice(0, 40);
        const cuentaDes = String(s.cta).replace(/[^0-9]/g, '').slice(0, 20);
        return [tipoDoc, cedNumStr, nombre, cuentaDes, toMonto(s.monto)].join(SEP);
      });
      return [header, ...detalle].join('\n');
    }
    default: return null;
  }
}

const TIPOS_NOMINA_BANCOS = [
  { key: 'SALARIOS',     label: 'Nómina de salarios'      },
  { key: 'CESTA_TICKET', label: 'Nómina de cesta ticket'  },
  { key: 'VACACIONES',   label: 'Nómina de vacaciones'    },
  { key: 'UTILIDADES',   label: 'Nómina de utilidades'    },
  { key: 'ESPECIALES',   label: 'Nóminas especiales'      },
];

// ─────────────────────────────────────────────────────────────
// EMPLEADOS
// ─────────────────────────────────────────────────────────────
function EmpleadosTab() {
  const [empleados, setEmpleados] = useState([]);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [monedaNomina, setMonedaNomina] = useState('USD');
  const ESTADOS_VE = ['Amazonas','Anzoátegui','Apure','Aragua','Barinas','Bolívar','Carabobo','Cojedes','Delta Amacuro','Distrito Capital','Falcón','Guárico','Lara','Mérida','Miranda','Monagas','Nueva Esparta','Portuguesa','Sucre','Táchira','Trujillo','La Guaira','Yaracuy','Zulia'];

  const emptyForm = {
    letra_ci: 'V', cedula: '', nombre: '', segundo_nombre: '', apellido: '', segundo_apellido: '',
    email: '', telefono_movil: '', telefono_fijo: '',
    direccion: '', estado_residencia: '',
    fecha_ingreso: dayjs().format('YYYY-MM-DD'), fecha_egreso: '',
    cargo: '', departamento: '', jornada: 'DIURNA',
    salario_base: '', tipo_contrato: 'FIJO',
    banco: '', tipo_cuenta: 'AHORRO', numero_cuenta: '',
    nivel_instruccion: '', titulo_obtenido: '', codigo_ocupacion: '',
    indigena: false, discapacidad: false, embarazada: false,
    contacto1_nombre: '', contacto1_parentesco: '', contacto1_tel_movil: '', contacto1_tel_fijo: '', contacto1_email: '',
    contacto2_nombre: '', contacto2_parentesco: '', contacto2_tel_movil: '', contacto2_tel_fijo: '', contacto2_email: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [buscar, setBuscar] = useState('');
  const [filtroActivo, setFiltroActivo] = useState(null); // null | 'activos' | 'egresados' | 'suspendidos' | 'desactivados' | 'todos'
  const [periodos, setPeriodos] = useState([]); // historial de períodos de reingresados

  const load = () => {
    api.get('/nomina/empleados').then(r => setEmpleados(r.data));
    api.get('/nomina/empleado-periodos').then(r => setPeriodos(r.data)).catch(() => {});
  };
  useEffect(() => {
    load();
    api.get('/nomina/config').then(r => setMonedaNomina(r.data.moneda_nomina || 'USD')).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      if (editando) {
        await api.put(`/nomina/empleados/${editando.id}`, form);
      } else {
        await api.post('/nomina/empleados', form);
      }
      setModal(false); setEditando(null); setForm(emptyForm); load();
    } catch (e) { alert(e.response?.data?.error || 'Error al guardar'); }
  };

  const [ficha, setFicha] = useState(null);

  const handleEdit = (emp) => {
    setEditando(emp);
    setForm({ ...emp, indigena: !!emp.indigena, discapacidad: !!emp.discapacidad, embarazada: !!emp.embarazada });
    setModal(true);
  };

  const handleDesactivar = async (emp) => {
    if (!confirm(`¿${emp.activo ? 'Desactivar' : 'Reactivar'} a ${emp.nombre} ${emp.apellido}?`)) return;
    await api.put(`/nomina/empleados/${emp.id}`, { ...emp, activo: emp.activo ? 0 : 1 });
    load();
  };

  const handleEliminar = async (emp) => {
    if (!confirm(`¿Eliminar permanentemente a ${emp.nombre} ${emp.apellido}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/nomina/empleados/${emp.id}`);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Error al eliminar'); }
  };

  const [reingresoTarget, setReingresoTarget] = useState(null);
  const [reingresoFecha, setReingresoFecha] = useState('');

  const handleConfirmReingreso = async () => {
    if (!reingresoTarget || !reingresoFecha) return;
    if (reingresoTarget.fecha_egreso && reingresoFecha <= reingresoTarget.fecha_egreso) {
      alert(`La nueva fecha de ingreso debe ser posterior al egreso (${dayjs(reingresoTarget.fecha_egreso).format('DD/MM/YYYY')}).`);
      return;
    }
    try {
      // Crea una ficha nueva — la anterior queda como histórico consultable
      await api.post(`/nomina/empleados/${reingresoTarget.id}/reingresar`, { fecha_ingreso: reingresoFecha });
      setReingresoTarget(null);
      setReingresoFecha('');
      load();
    } catch (e) { alert(e.response?.data?.error || 'Error al reingresar'); }
  };

  // Imprimir reporte del listado visible
  const handleImprimirReporte = () => {
    if (!filtroActivo) return;
    const titulo = labelFiltro[filtroActivo] || 'Trabajadores';
    const filas = filtrados.map(e => `
      <tr>
        <td>${e.letra_ci || 'V'}-${e.cedula}</td>
        <td>${e.apellido}${e.segundo_apellido ? ' '+e.segundo_apellido : ''}, ${e.nombre}${e.segundo_nombre ? ' '+e.segundo_nombre : ''}</td>
        <td>${e.cargo || '—'}${e.departamento ? ' · '+e.departamento : ''}</td>
        <td>${e.fecha_ingreso ? dayjs(e.fecha_ingreso).format('DD/MM/YYYY') : '—'}</td>
        <td>${e.fecha_egreso ? dayjs(e.fecha_egreso).format('DD/MM/YYYY') : '—'}</td>
        <td>${e.fecha_egreso ? 'Egresado' : e.estado_trabajador === 'SUSPENDIDO_VACACIONES' ? 'Susp. vacaciones' : e.activo ? 'Activo' : 'Desactivado'}</td>
      </tr>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Reporte ${titulo}</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}
      h2{margin-bottom:4px}p{color:#555;margin-bottom:16px}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
      th{background:#f0f0f0;font-weight:700}
      tr:nth-child(even){background:#fafafa}
      @media print{button{display:none}}</style></head>
      <body>
        <h2>${titulo}</h2>
        <p>Generado el ${dayjs().format('DD/MM/YYYY HH:mm')} — ${filtrados.length} trabajador(es)</p>
        <table><thead><tr><th>Cédula</th><th>Trabajador</th><th>Cargo / Depto.</th><th>Ingreso</th><th>Egreso</th><th>Estado</th></tr></thead>
        <tbody>${filas}</tbody></table>
        <br/><button onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  // Para el filtro "egresados": incluye empleados actualmente egresados + reingresados con período histórico
  // Los reingresados aparecen con sus fechas del período anterior (_esHistorico = true)
  const egresadosHistoricos = periodos
    .filter(p => !empleados.find(e => e.id === p.empleado_id && e.fecha_egreso))
    .map(p => ({
      ...empleados.find(e => e.id === p.empleado_id),
      fecha_ingreso: p.fecha_ingreso,
      fecha_egreso:  p.fecha_egreso,
      _periodoId:    p.id,
      _esHistorico:  true,
    }))
    .filter(p => p.id); // descartar si el empleado ya no existe

  // Aplicar filtro de categoría primero, luego búsqueda por texto
  const porFiltro = filtroActivo === null ? [] : (() => {
    if (filtroActivo === 'activos')      return empleados.filter(e => e.activo && !e.fecha_egreso && e.estado_trabajador !== 'SUSPENDIDO_VACACIONES');
    if (filtroActivo === 'suspendidos')  return empleados.filter(e => e.estado_trabajador === 'SUSPENDIDO_VACACIONES');
    if (filtroActivo === 'desactivados') return empleados.filter(e => !e.activo && !e.fecha_egreso && e.estado_trabajador !== 'SUSPENDIDO_VACACIONES');
    if (filtroActivo === 'egresados')    return [
      ...empleados.filter(e => !!e.fecha_egreso),
      ...egresadosHistoricos,
    ];
    return empleados; // 'todos'
  })();
  const filtrados = porFiltro.filter(e =>
    `${e.nombre} ${e.apellido} ${e.cedula}`.toLowerCase().includes(buscar.toLowerCase()));

  const labelFiltro = {
    activos:      'Trabajadores activos',
    egresados:    'Trabajadores egresados',
    suspendidos:  'Trabajadores suspendidos por vacaciones',
    desactivados: 'Trabajadores desactivados',
    todos:        'Todos los trabajadores',
  };

  return (
    <div>
      {/* Barra superior: buscador + nuevo */}
      <div className="flex items-center justify-between mb-4" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="form-control" placeholder="Buscar por nombre o cédula..."
          value={buscar} onChange={e => { setBuscar(e.target.value); if (e.target.value) setFiltroActivo(prev => prev || 'todos'); }}
          style={{ maxWidth: 280 }} />
        <button className="btn btn-primary" onClick={() => { setEditando(null); setForm(emptyForm); setModal(true); }}>
          + Nuevo Trabajador
        </button>
      </div>

      {/* CTAs de filtro + imprimir */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          ['activos',      'Trabajadores activos'],
          ['egresados',    'Trabajadores egresados'],
          ['suspendidos',  'Trabajadores suspendidos'],
          ['desactivados', 'Trabajadores desactivados'],
          ['todos',        'Todos'],
        ].map(([key, label]) => (
          <button key={key}
            className={`btn btn-tab${filtroActivo === key ? ' active' : ''}`}
            onClick={() => setFiltroActivo(filtroActivo === key ? null : key)}>
            {label}
          </button>
        ))}
        {filtroActivo && (
          <button className="btn btn-secondary" onClick={handleImprimirReporte}>
            Imprimir reporte
          </button>
        )}
      </div>

      {/* Tabla — solo visible si hay un filtro activo o hay texto de búsqueda */}
      {filtroActivo !== null && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">{labelFiltro[filtroActivo]}</div>
            <div className="text-sm text-gris">{filtrados.length} trabajador(es)</div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Expediente</th><th>Cédula</th><th>Trabajador</th><th>Cargo / Depto.</th>
                  <th>Ingreso</th><th>Egreso</th><th>Salario base</th><th>Contrato</th><th>Estado</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((e, idx) => (
                  <tr key={e._esHistorico ? `hist-${e._periodoId}` : e.id} style={{ opacity: e._esHistorico ? 0.7 : (e.activo ? 1 : 0.6) }}>
                    <td className="fw-600" style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.numero_expediente || '—'}</td>
                    <td className="fw-600">{e.letra_ci || 'V'}-{e.cedula}</td>
                    <td>
                      {e.apellido}{e.segundo_apellido ? ' '+e.segundo_apellido : ''}, {e.nombre}{e.segundo_nombre ? ' '+e.segundo_nombre : ''}
                      {e._esHistorico && <span className="badge badge-azul text-sm" style={{ marginLeft: 6 }}>Reingresado</span>}
                    </td>
                    <td className="text-gris text-sm">{e.cargo || '—'}{e.departamento ? ` · ${e.departamento}` : ''}</td>
                    <td>{e.fecha_ingreso ? dayjs(e.fecha_ingreso).format('DD/MM/YYYY') : '—'}</td>
                    <td style={{ color: e.fecha_egreso ? '#CC0000' : 'inherit' }}>{e.fecha_egreso ? dayjs(e.fecha_egreso).format('DD/MM/YYYY') : '—'}</td>
                    <td className="fw-600">{monedaNomina === 'BS' ? 'Bs.' : '$'} {parseFloat(e.salario_base || 0).toFixed(2)}</td>
                    <td><span className="badge badge-gris text-sm">{e.tipo_contrato}</span></td>
                    <td>
                      {e._esHistorico
                        ? <span className="badge badge-azul">Período anterior</span>
                        : e.fecha_egreso
                          ? <span className="badge badge-rojo">Egresado</span>
                          : e.estado_trabajador === 'SUSPENDIDO_VACACIONES'
                            ? <span className="badge" style={{ background: '#78350f', color: '#fbbf24' }}>Susp. vacaciones</span>
                            : e.activo
                              ? <span className="badge badge-verde">Activo</span>
                              : <span className="badge badge-gris">Desactivado</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {!e._esHistorico && <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setFicha(e)}>Ficha</button>
                        {' '}
                        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(e)}>Editar</button>
                        {' '}
                        {!e.fecha_egreso && (
                          <button className="btn btn-secondary btn-sm" onClick={() => handleDesactivar(e)}>
                            {e.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        )}
                        {/* 15.9 — Eliminar solo si está desactivado (activo=0, sin egreso) */}
                        {!e.activo && !e.fecha_egreso && (
                          <>{' '}<button className="btn btn-sm" style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none' }}
                            onClick={() => handleEliminar(e)}>Eliminar</button></>
                        )}
                        {/* 15.10 — Reingresar si está egresado */}
                        {e.fecha_egreso && (
                          <>{' '}<button className="btn btn-sm" style={{ background: '#14532d', color: '#86efac', border: 'none' }}
                            onClick={() => { setReingresoTarget(e); setReingresoFecha(''); }}>Reingresar</button></>
                        )}
                      </>}
                      {e._esHistorico && <span className="text-gris text-sm">Período histórico</span>}
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr><td colSpan={10} className="text-gris text-sm" style={{ textAlign: 'center', padding: 24 }}>
                    No hay trabajadores en esta categoría
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal reingreso — 15.10 */}
      {reingresoTarget && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title">Reingresar trabajador</div>
              <button className="modal-close" onClick={() => setReingresoTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}>
                <strong>{reingresoTarget.nombre} {reingresoTarget.apellido}</strong> — egresado el{' '}
                <strong>{dayjs(reingresoTarget.fecha_egreso).format('DD/MM/YYYY')}</strong>.
              </p>
              <p className="text-gris text-sm" style={{ marginBottom: 16 }}>
                La nueva fecha de ingreso debe ser posterior a la fecha de egreso.
              </p>
              <div className="form-group">
                <label className="form-label">Nueva fecha de ingreso</label>
                <input type="date" className="form-control"
                  min={reingresoTarget.fecha_egreso ? dayjs(reingresoTarget.fecha_egreso).add(1, 'day').format('YYYY-MM-DD') : undefined}
                  value={reingresoFecha} onChange={e => setReingresoFecha(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setReingresoTarget(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleConfirmReingreso} disabled={!reingresoFecha}>
                Confirmar reingreso
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div style={{ position: 'fixed', left: 'var(--sidebar-w)', top: 'var(--header-h)', right: 0, bottom: 0, background: 'var(--gris-claro)', zIndex: 500, overflowY: 'auto', padding: 24 }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div className="flex items-center justify-between mb-4">
              <button className="btn btn-secondary btn-sm" onClick={() => { setModal(false); setEditando(null); setForm(emptyForm); }}>← Volver</button>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{editando ? 'Editar Trabajador' : 'Nuevo Trabajador'}</span>
              <div />
            </div>
            <div className="card"><div className="card-body">
              <div style={{ fontSize: 12, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Datos personales</div>
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label">Cédula *</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select className="form-control" style={{ width: 70, flexShrink: 0 }} value={form.letra_ci}
                      onChange={e => setForm({ ...form, letra_ci: e.target.value })}>
                      <option value="V">V</option>
                      <option value="E">E</option>
                    </select>
                    <input className="form-control" value={form.cedula}
                      onChange={e => setForm({ ...form, cedula: e.target.value })}
                      placeholder="12345678" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Primer nombre *</label>
                  <input className="form-control" value={form.nombre}
                    onChange={e => setForm({ ...form, nombre: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Segundo nombre</label>
                  <input className="form-control" value={form.segundo_nombre || ''}
                    onChange={e => setForm({ ...form, segundo_nombre: e.target.value })}
                    placeholder="Opcional" />
                </div>
                <div className="form-group">
                  <label className="form-label">Primer apellido *</label>
                  <input className="form-control" value={form.apellido}
                    onChange={e => setForm({ ...form, apellido: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Segundo apellido</label>
                  <input className="form-control" value={form.segundo_apellido || ''}
                    onChange={e => setForm({ ...form, segundo_apellido: e.target.value })}
                    placeholder="Opcional" />
                </div>
                <div className="form-group">
                  <label className="form-label">Correo electrónico *</label>
                  <input className="form-control" type="email" value={form.email || ''}
                    onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono móvil *</label>
                  <input className="form-control" value={form.telefono_movil || ''}
                    onChange={e => setForm({ ...form, telefono_movil: e.target.value })}
                    placeholder="04XX-XXXXXXX" />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono fijo</label>
                  <input className="form-control" value={form.telefono_fijo || ''}
                    onChange={e => setForm({ ...form, telefono_fijo: e.target.value })}
                    placeholder="Opcional" />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Dirección *</label>
                  <input className="form-control" value={form.direccion || ''}
                    onChange={e => setForm({ ...form, direccion: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Estado *</label>
                  <select className="form-control" value={form.estado_residencia || ''}
                    onChange={e => setForm({ ...form, estado_residencia: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {ESTADOS_VE.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #222', margin: '16px 0 12px', paddingTop: 12, fontSize: 12, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                Datos laborales
              </div>
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label">Fecha de ingreso *</label>
                  <input className="form-control" type="date" value={form.fecha_ingreso}
                    onChange={e => setForm({ ...form, fecha_ingreso: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de egreso</label>
                  <input className="form-control" type="date" value={form.fecha_egreso || ''}
                    onChange={e => setForm({ ...form, fecha_egreso: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de contrato *</label>
                  <select className="form-control" value={form.tipo_contrato}
                    onChange={e => setForm({ ...form, tipo_contrato: e.target.value })}>
                    <option value="FIJO">Tiempo indeterminado</option>
                    <option value="DETERMINADO">Tiempo determinado</option>
                    <option value="OBRA">Por obra o servicio</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de jornada *</label>
                  <select className="form-control" value={form.jornada || 'DIURNA'}
                    onChange={e => setForm({ ...form, jornada: e.target.value })}>
                    <option value="DIURNA">Diurna</option>
                    <option value="MIXTA">Mixta</option>
                    <option value="NOCTURNA">Nocturna</option>
                  </select>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #222', margin: '16px 0 12px', paddingTop: 12, fontSize: 12, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                Instrucción
              </div>
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label">Nivel de instrucción educativa *</label>
                  <select className="form-control" value={form.nivel_instruccion || ''}
                    onChange={e => setForm({ ...form, nivel_instruccion: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    <option value="PRIMARIA">Primaria</option>
                    <option value="SECUNDARIA">Secundaria / Media</option>
                    <option value="UNIVERSITARIO">Universitaria</option>
                    <option value="POSTGRADO">Postgrado</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Título obtenido</label>
                  <input className="form-control" value={form.titulo_obtenido || ''}
                    onChange={e => setForm({ ...form, titulo_obtenido: e.target.value })}
                    placeholder="Ej: Licenciado en Administración" />
                </div>
              </div>

              <div style={{ borderTop: '1px solid #222', margin: '16px 0 12px', paddingTop: 12, fontSize: 12, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                Datos bancarios
              </div>
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label">Banco</label>
                  <select className="form-control" value={form.banco}
                    onChange={e => setForm({ ...form, banco: e.target.value })}>
                    <option value="">Seleccionar banco...</option>
                    <option>Banco de Venezuela</option>
                    <option>Banesco</option>
                    <option>Mercantil</option>
                    <option>Provincial</option>
                    <option>BNC</option>
                    <option>Banco del Tesoro</option>
                    <option>Bicentenario</option>
                    <option>Exterior</option>
                    <option>Venezolano de Crédito</option>
                    <option>Bancaribe</option>
                    <option>Banplus</option>
                    <option>BFC</option>
                    <option>Banco Nacional de Crédito</option>
                    <option>Bancamiga</option>
                    <option>Banco Plaza</option>
                    <option>Banco Caroní</option>
                    <option>Bancrecer</option>
                    <option>Mi Banco</option>
                    <option>Banco Activo</option>
                    <option>Sofitasa</option>
                    <option>100% Banco</option>
                    <option>Banco Agrícola de Venezuela</option>
                    <option>Bangente</option>
                    <option>BOD</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de cuenta</label>
                  <select className="form-control" value={form.tipo_cuenta}
                    onChange={e => setForm({ ...form, tipo_cuenta: e.target.value })}>
                    <option value="AHORRO">Ahorro</option>
                    <option value="CORRIENTE">Corriente</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">N° de cuenta</label>
                  <input className="form-control" value={form.numero_cuenta}
                    onChange={e => setForm({ ...form, numero_cuenta: e.target.value })}
                    placeholder="20 dígitos" />
                </div>
              </div>

              <div style={{ borderTop: '1px solid #222', margin: '16px 0 12px', paddingTop: 12, fontSize: 12, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                Datos RNET / MPPPST
              </div>
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label">Código de ocupación</label>
                  <input className="form-control" value={form.codigo_ocupacion}
                    onChange={e => setForm({ ...form, codigo_ocupacion: e.target.value })}
                    placeholder="Cód. MPPPST" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 24, marginTop: 8, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.indigena}
                    onChange={e => setForm({ ...form, indigena: e.target.checked })} />
                  Trabajador indígena
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.discapacidad}
                    onChange={e => setForm({ ...form, discapacidad: e.target.checked })} />
                  Trabajador con discapacidad
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.embarazada}
                    onChange={e => setForm({ ...form, embarazada: e.target.checked })} />
                  Trabajadora embarazada
                </label>
              </div>

              {/* ── CONTACTOS DE EMERGENCIA ── */}
              <div style={{ borderTop: '1px solid #222', margin: '16px 0 12px', paddingTop: 12, fontSize: 12, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                Contactos de emergencia
              </div>

              {/* Contacto 1 */}
              <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Contacto 1</div>
              <div className="form-grid form-grid-2" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Nombre completo</label>
                  <input className="form-control" value={form.contacto1_nombre || ''}
                    onChange={e => setForm({ ...form, contacto1_nombre: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Parentesco</label>
                  <input className="form-control" value={form.contacto1_parentesco || ''}
                    onChange={e => setForm({ ...form, contacto1_parentesco: e.target.value })}
                    placeholder="Ej: Madre, Cónyuge..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono móvil</label>
                  <input className="form-control" value={form.contacto1_tel_movil || ''}
                    onChange={e => setForm({ ...form, contacto1_tel_movil: e.target.value })}
                    placeholder="04XX-XXXXXXX" />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono fijo (opcional)</label>
                  <input className="form-control" value={form.contacto1_tel_fijo || ''}
                    onChange={e => setForm({ ...form, contacto1_tel_fijo: e.target.value })} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Correo electrónico</label>
                  <input className="form-control" type="email" value={form.contacto1_email || ''}
                    onChange={e => setForm({ ...form, contacto1_email: e.target.value })} />
                </div>
              </div>

              {/* Contacto 2 */}
              <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Contacto 2</div>
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label">Nombre completo</label>
                  <input className="form-control" value={form.contacto2_nombre || ''}
                    onChange={e => setForm({ ...form, contacto2_nombre: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Parentesco</label>
                  <input className="form-control" value={form.contacto2_parentesco || ''}
                    onChange={e => setForm({ ...form, contacto2_parentesco: e.target.value })}
                    placeholder="Ej: Padre, Hermano..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono móvil</label>
                  <input className="form-control" value={form.contacto2_tel_movil || ''}
                    onChange={e => setForm({ ...form, contacto2_tel_movil: e.target.value })}
                    placeholder="04XX-XXXXXXX" />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono fijo (opcional)</label>
                  <input className="form-control" value={form.contacto2_tel_fijo || ''}
                    onChange={e => setForm({ ...form, contacto2_tel_fijo: e.target.value })} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Correo electrónico</label>
                  <input className="form-control" type="email" value={form.contacto2_email || ''}
                    onChange={e => setForm({ ...form, contacto2_email: e.target.value })} />
                </div>
              </div>

            </div></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => { setModal(false); setEditando(null); setForm(emptyForm); }}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave}>{editando ? 'Actualizar' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      {ficha && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div className="modal-title">Ficha del Trabajador</div>
              <button className="modal-close" onClick={() => setFicha(null)}>×</button>
            </div>
            <div className="modal-body">
              {ficha.numero_expediente && (
                <div style={{ background: '#1a1a1a', borderRadius: 6, padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>N° Expediente</span>
                  <strong style={{ fontFamily: 'monospace', fontSize: 16, color: '#CC0000', letterSpacing: 1 }}>{ficha.numero_expediente}</strong>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
                <div><span style={{ color: '#aaa' }}>CI:</span> <strong>{ficha.letra_ci || 'V'}-{ficha.cedula}</strong></div>
                <div><span style={{ color: '#aaa' }}>Nombres:</span> <strong>{ficha.nombre}{ficha.segundo_nombre ? ' '+ficha.segundo_nombre : ''} {ficha.apellido}{ficha.segundo_apellido ? ' '+ficha.segundo_apellido : ''}</strong></div>
                <div><span style={{ color: '#aaa' }}>Cargo:</span> <strong>{ficha.cargo || '—'}</strong></div>
                <div><span style={{ color: '#aaa' }}>Departamento:</span> <strong>{ficha.departamento || '—'}</strong></div>
                <div><span style={{ color: '#aaa' }}>Correo:</span> <strong>{ficha.email || '—'}</strong></div>
                <div><span style={{ color: '#aaa' }}>Teléfono móvil:</span> <strong>{ficha.telefono_movil || '—'}</strong></div>
                <div><span style={{ color: '#aaa' }}>Teléfono fijo:</span> <strong>{ficha.telefono_fijo || '—'}</strong></div>
                <div><span style={{ color: '#aaa' }}>Estado:</span> <strong>{ficha.estado_residencia || '—'}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#aaa' }}>Dirección:</span> <strong>{ficha.direccion || '—'}</strong></div>
                <div><span style={{ color: '#aaa' }}>Fecha de ingreso:</span> <strong>{ficha.fecha_ingreso ? dayjs(ficha.fecha_ingreso).format('DD/MM/YYYY') : '—'}</strong></div>
                <div><span style={{ color: '#aaa' }}>Fecha de egreso:</span> <strong style={{ color: ficha.fecha_egreso ? '#CC0000' : 'inherit' }}>{ficha.fecha_egreso ? dayjs(ficha.fecha_egreso).format('DD/MM/YYYY') : '—'}</strong></div>
                <div><span style={{ color: '#aaa' }}>Salario base:</span> <strong style={{ color: '#22c55e' }}>{monedaNomina === 'BS' ? 'Bs.' : '$'} {parseFloat(ficha.salario_base || 0).toFixed(2)}</strong></div>
                <div><span style={{ color: '#aaa' }}>Contrato:</span> <strong>{ficha.tipo_contrato}</strong></div>
                <div><span style={{ color: '#aaa' }}>Banco:</span> <strong>{ficha.banco || '—'} {ficha.tipo_cuenta ? `(${ficha.tipo_cuenta})` : ''}</strong></div>
                <div><span style={{ color: '#aaa' }}>N° cuenta:</span> <strong>{ficha.numero_cuenta || '—'}</strong></div>
                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #222', paddingTop: 8, marginTop: 4 }}>
                  {ficha.indigena ? <span className="badge badge-azul" style={{ marginRight: 6 }}>Indígena</span> : null}
                  {ficha.discapacidad ? <span className="badge badge-naranja" style={{ marginRight: 6 }}>Discapacidad</span> : null}
                  {ficha.embarazada ? <span className="badge badge-verde">Embarazada</span> : null}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setFicha(null); handleEdit(ficha); }}>Editar</button>
              <button className="btn btn-primary" onClick={() => setFicha(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NÓMINAS (períodos de pago)
// ─────────────────────────────────────────────────────────────
function NominasTab() {
  const { tasa: tasaBCV } = useContext(MonedaContext);
  const [nominas, setNominas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [modalNueva, setModalNueva] = useState(false);
  const [formNueva, setFormNueva] = useState({ periodo: dayjs().format('YYYY-MM'), tipoBase: 'MENSUAL', tipo: 'MENSUAL', subtipo: 'SALARIOS', observaciones: '' });
  const [editItem, setEditItem] = useState(null);
  const [formItem, setFormItem] = useState({});
  const [procesando, setProcesando] = useState(false);
  const [showPreNomina, setShowPreNomina] = useState(false);
  const [showResumen, setShowResumen] = useState(false);
  const [showRecibos, setShowRecibos] = useState(false);
  const [showReporteNomina, setShowReporteNomina] = useState(false);
  const [showReporteParafiscales, setShowReporteParafiscales] = useState(false);
  const [showReporteProvisiones, setShowReporteProvisiones] = useState(false);
  const [showTxtPago, setShowTxtPago] = useState(false);
  const [txtFechaPago, setTxtFechaPago] = useState(dayjs().format('YYYY-MM-DD'));
  const [recibosModo, setRecibosModo] = useState('inicio'); // 'inicio' | 'lista'
  const [reciboEnviando, setReciboEnviando] = useState(null); // id del item en envío
  const [prenominaData, setPrenominaData] = useState(null);
  const [monedaNomina, setMonedaNomina] = useState('USD');
  const [configNomina, setConfigNomina] = useState({});
  const [suspendTarget, setSuspendTarget] = useState(null); // item a suspender por vacaciones

  const load = () => api.get('/nomina').then(r =>
    setNominas(r.data.filter(n => (n.subtipo || 'SALARIOS') !== 'ALIMENTACION')));

  const loadDetalle = async (nom) => {
    setSelected(nom);
    const [det, res] = await Promise.all([
      api.get(`/nomina/${nom.id}`),
      api.get(`/nomina/${nom.id}/resumen`)
    ]);
    setItems(det.data.items || []);
    setResumen(res.data);
  };

  useEffect(() => {
    load();
    api.get('/nomina/config').then(r => {
      setMonedaNomina(r.data.moneda_nomina || 'USD');
      setConfigNomina(r.data);
    }).catch(() => {});
  }, []);

  const handleCrear = async () => {
    try {
      await api.post('/nomina', { ...formNueva, subtipo: 'SALARIOS' });
      setModalNueva(false); load();
    } catch (e) { alert(e.response?.data?.error || 'Error'); }
  };

  const handleEliminar = async (nom) => {
    if (!confirm(`¿Eliminar nómina ${nom.periodo}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/nomina/${nom.id}`);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Error al eliminar'); }
  };

  const handleProcesar = async () => {
    if (!confirm('¿Procesar nómina? Se calcularán los montos para todos los empleados activos.')) return;
    setProcesando(true);
    try {
      const r = await api.post(`/nomina/${selected.id}/procesar`);
      alert(`Nómina procesada: ${r.data.procesados} empleados`);
      loadDetalle(selected);
    } catch (e) {
      alert(e.response?.data?.error || 'Error al procesar');
    } finally { setProcesando(false); }
  };

  const handleCerrar = async () => {
    if (!confirm('¿Cerrar nómina? Ya no podrá editarse.')) return;
    await api.post(`/nomina/${selected.id}/cerrar`);
    load();
    setSelected({ ...selected, estado: 'CERRADA' });
  };

  const defDias = (tipo) => {
    if (tipo?.startsWith('SEMANAL')) return { habiles: 5, descanso: 2 };
    if (tipo?.startsWith('QUINCENAL')) return { habiles: 11, descanso: 4 };
    return { habiles: 22, descanso: 8 };
  };

  // Lunes del período por defecto según tipo (para base IVSS/RPE)
  const defLunes = (tipo) => {
    if (tipo?.startsWith('SEMANAL')) return 1;
    if (tipo?.startsWith('QUINCENAL')) return 2;
    return 4; // MENSUAL
  };

  // Cuenta los lunes reales dentro del rango de fechas del período
  const calcLunesPeriodo = (periodo, tipo) => {
    if (!periodo || tipo?.startsWith('SEMANAL')) return defLunes(tipo);
    const [yy, mm] = periodo.split('-');
    const yearNum  = Number(yy);
    const monthNum = Number(mm);
    const lastDay  = new Date(yearNum, monthNum, 0).getDate();
    const inicio   = tipo === 'QUINCENAL_2' ? 16 : 1;
    const fin      = tipo === 'QUINCENAL_1' ? 15 : lastDay;
    let count = 0;
    for (let d = inicio; d <= fin; d++) {
      if (new Date(yearNum, monthNum - 1, d).getDay() === 1) count++;
    }
    return count || 1;
  };

  const handleEditItem = (item) => {
    setEditItem(item);
    const def      = defDias(selected?.tipo);
    const autoLun  = calcLunesPeriodo(selected?.periodo, selected?.tipo);
    const storedLun = item.lunes_periodo > 0 ? item.lunes_periodo : autoLun;
    const lunesModo = (item.lunes_periodo > 0 && Number(item.lunes_periodo) !== autoLun) ? 'manual' : 'auto';
    setFormItem({
      dias_habiles: item.dias_habiles > 0 ? item.dias_habiles : def.habiles,
      dias_descanso: item.dias_descanso > 0 ? item.dias_descanso : def.descanso,
      he_diurnas_cantidad: item.he_diurnas_cantidad || 0,
      he_nocturnas_cantidad: item.he_nocturnas_cantidad || 0,
      dias_adicionales_cantidad: item.dias_adicionales_cantidad || 0,
      descuento_minutos_cantidad: item.descuento_minutos_cantidad || 0,
      descuento_ausencias_cantidad: item.descuento_ausencias_cantidad || 0,
      reposo_convalidado_cantidad: item.reposo_convalidado_cantidad || 0,
      otros_ingresos: item.otros_ingresos || 0,
      islr_retenido: item.islr_retenido || 0,
      islr_porcentaje: item.islr_porcentaje || 0,
      prestamos_deduc: item.prestamos_deduc || 0,
      prestamo_moneda: 'USD',
      prestamos_bs_input: 0,
      otras_deducciones: item.otras_deducciones || 0,
      cxc_moneda: 'USD',
      cxc_bs_input: 0,
      dias_feriados_cantidad: item.dias_feriados_cantidad || 0,
      bono_nocturno_tipo: item.bono_nocturno_tipo || '',   // '' | 'completo' | 'personalizado'
      bono_nocturno_dias: item.bono_nocturno_dias || 0,
      vacaciones_cantidad: item.vacaciones_cantidad || 0,
      vacaciones_bs: item.vacaciones_bs || 0,
      bono_vacacional_bs: item.bono_vacacional_bs || 0,
      lunes_periodo: storedLun,
      lunes_modo: lunesModo,
      notas: item.notas || '',
    });
  };

  const tasa = selected?.tasa_bcv || tasaBCV || 1;
  const isBS       = monedaNomina === 'BS';
  const monSimbolo = isBS ? 'Bs.' : '$';
  const priCur     = isBS ? 'Bs.' : 'USD';   // moneda primaria (en la que el usuario ingresa datos)
  const secCur     = isBS ? 'USD' : 'Bs.';   // moneda secundaria (se calcula automáticamente)
  const fmtUSD = v => `$ ${Number(v || 0).toFixed(2)}`;
  const fmtBS  = v => {
    const n = Number(v || 0);
    // Si la nómina es en Bs., el valor ya viene en Bs. desde la BD — no multiplicar por tasa
    return isBS
      ? `Bs. ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `Bs. ${(n * Number(tasa)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Cálculos automáticos del modal de ajuste
  // Si monedaNomina='USD': salario_base en USD, cálculos en USD, conversión auto a Bs.
  // Si monedaNomina='BS':  salario_base en Bs., cálculos en Bs., conversión auto a USD.
  const computed = (() => {
    if (!editItem) return {};
    const salBase   = Number(editItem.salario_base || 0);
    const salDiario = salBase / 30;   // LOTTT: salario diario = salario mensual ÷ 30
    const salHora   = salDiario / 8;  // salario hora = salario diario ÷ 8
    const t         = Number(tasa) || 1;
    const isBS      = monedaNomina === 'BS';
    // Helpers: convierte desde moneda primaria a USD o Bs.
    const toUSD = v => isBS ? v / t : v;
    const toBS  = v => isBS ? v : v * t;
    // Cálculos en moneda primaria (basados en salHora/salDiario que ya están en la moneda correcta)
    const he_diurnas_pri          = Number(formItem.he_diurnas_cantidad || 0) * salHora * 1.5;   // salHora × 1.50
    const he_nocturnas_pri        = Number(formItem.he_nocturnas_cantidad || 0) * salHora * 1.95;  // (salHora × 1.30) × 1.50
    const dias_adicionales_pri    = Number(formItem.dias_adicionales_cantidad || 0) * salDiario;
    const descuento_minutos_pri   = Number(formItem.descuento_minutos_cantidad || 0) * salDiario / 8 / 60;
    const descuento_ausencias_pri = Number(formItem.descuento_ausencias_cantidad || 0) * salDiario;
    const reposo_convalidado_pri  = Number(formItem.reposo_convalidado_cantidad || 0) * salDiario * 0.3333;
    // Días feriados: 50% recargo sobre salario diario (salDiario × 1.5 por día)
    const dias_feriados_pri = Number(formItem.dias_feriados_cantidad || 0) * salDiario * 1.5;
    // Bono nocturno: salario diario × 1.30 por día (salario diario + 30% recargo nocturno)
    // Período completo = salBase × 1.30  (30 días × salDiario × 1.30)
    // Personalizado   = diasPersonalizados × salDiario × 1.30
    const bono_nocturno_tipo = formItem.bono_nocturno_tipo || '';
    const bono_nocturno_pri = bono_nocturno_tipo === 'completo'
      ? salBase * 1.30
      : bono_nocturno_tipo === 'personalizado'
        ? Number(formItem.bono_nocturno_dias || 0) * salDiario * 1.30
        : 0;
    // Parafiscales: base IVSS/RPE = (salario mensual × 12 / 52) × lunes del período
    // Salario mínimo legal: Bs. 130 — Decreto N° 4.686 (01/05/2022), usado para topes
    const SALARIO_MIN_BS = 130;
    const salMinPri      = isBS ? SALARIO_MIN_BS : SALARIO_MIN_BS / t; // en moneda primaria
    const porcPatronal   = configNomina.riesgo_ivss === 'MAXIMO' ? 0.11
      : configNomina.riesgo_ivss === 'MEDIO' ? 0.10 : 0.09;
    const lunes          = Number(formItem.lunes_periodo || defLunes(selected?.tipo));
    const baseSemanal    = salBase * 12 / 52;
    const baseIvssRpe    = baseSemanal * lunes;
    // Topes legales
    const topeIvss       = salMinPri * 5;   // IVSS: tope = salMínimo × 5
    const topeRpe        = salMinPri * 10;  // RPE:  tope = salMínimo × 10
    const baseIvssEf     = Math.min(baseIvssRpe, topeIvss);
    const baseRpeEf      = Math.min(baseIvssRpe, topeRpe);
    // Retenciones al trabajador
    const ivss_trab_pri = baseIvssEf * 0.04;    // 4%
    const rpe_trab_pri  = baseRpeEf  * 0.005;   // 0.5%
    const faov_trab_pri = salBase    * 0.01;    // 1% del salario mensual (sin tope)
    const islr_porc     = Number(formItem.islr_porcentaje || 0);
    const islr_pri      = salBase * islr_porc / 100;
    // Préstamo: moneda seleccionada determina cuál campo es editable
    const prestamo_moneda  = formItem.prestamo_moneda || 'USD';
    const prestamo_usd_val = prestamo_moneda === 'USD'
      ? Number(formItem.prestamos_deduc    || 0)
      : Number(formItem.prestamos_bs_input || 0) / t;
    const prestamo_bs_val  = prestamo_moneda === 'BS'
      ? Number(formItem.prestamos_bs_input || 0)
      : Number(formItem.prestamos_deduc    || 0) * t;
    const prestamo_pri = isBS ? prestamo_bs_val : prestamo_usd_val;
    // CxC empleados: moneda seleccionada determina cuál campo es editable
    const cxc_moneda  = formItem.cxc_moneda || 'USD';
    const cxc_usd_val = cxc_moneda === 'USD'
      ? Number(formItem.otras_deducciones || 0)
      : Number(formItem.cxc_bs_input     || 0) / t;
    const cxc_bs_val  = cxc_moneda === 'BS'
      ? Number(formItem.cxc_bs_input     || 0)
      : Number(formItem.otras_deducciones || 0) * t;
    const cxc_pri = isBS ? cxc_bs_val : cxc_usd_val;
    // Vacaciones pagadas: Bs. editable → USD auto (÷ tasa)
    const vacaciones_bs_val = Number(formItem.vacaciones_bs || 0);
    const vacaciones_usd_val = vacaciones_bs_val / tasa;
    // Total asignaciones = días hábiles + días descanso + conceptos Sección 1
    const dias_habiles_pri  = Number(formItem.dias_habiles  || 0) * salDiario;
    const dias_descanso_pri = Number(formItem.dias_descanso || 0) * salDiario;
    const total_asig_pri = dias_habiles_pri + dias_descanso_pri
      + he_diurnas_pri + he_nocturnas_pri + dias_adicionales_pri
      + reposo_convalidado_pri + dias_feriados_pri + bono_nocturno_pri;
    // Total deducciones = Retenciones (IVSS+RPE+FAOV+ISLR) + Sección 4 + Vacaciones pagadas
    const total_deduc_bs = toBS(ivss_trab_pri) + toBS(rpe_trab_pri) + toBS(faov_trab_pri) + toBS(islr_pri)
      + toBS(descuento_minutos_pri) + toBS(descuento_ausencias_pri)
      + toBS(prestamo_pri) + toBS(cxc_pri)
      + vacaciones_bs_val;
    const total_deduc_usd = total_deduc_bs / tasa;
    // Neto a cobrar = Total asignaciones - Total deducciones (en Bs. y USD)
    const neto_bs  = toBS(total_asig_pri)  - total_deduc_bs;
    const neto_usd = toUSD(total_asig_pri) - total_deduc_usd;
    // Aportes patronales
    const ivss_pat_pri  = baseIvssEf * porcPatronal; // riesgo patronal (9/10/11%) sobre base con tope
    const rpe_pat_pri   = baseRpeEf  * 0.02;         // 2% sobre base con tope
    const faov_pat_pri  = salBase    * 0.02;          // 2% del salario mensual (sin tope)
    const inces_pat_pri = salBase    * 0.02;          // 2% patronal
    return {
      salDiario, salHora, isBS,
      dias_habiles_usd:        toUSD(Number(formItem.dias_habiles  || 0) * salDiario),
      dias_habiles_bs:         toBS(Number(formItem.dias_habiles   || 0) * salDiario),
      dias_descanso_usd:       toUSD(Number(formItem.dias_descanso || 0) * salDiario),
      dias_descanso_bs:        toBS(Number(formItem.dias_descanso  || 0) * salDiario),
      he_diurnas_usd:          toUSD(he_diurnas_pri),          he_diurnas_bs:          toBS(he_diurnas_pri),
      he_nocturnas_usd:        toUSD(he_nocturnas_pri),        he_nocturnas_bs:        toBS(he_nocturnas_pri),
      dias_adicionales_usd:    toUSD(dias_adicionales_pri),    dias_adicionales_bs:    toBS(dias_adicionales_pri),
      descuento_minutos_usd:   toUSD(descuento_minutos_pri),   descuento_minutos_bs:   toBS(descuento_minutos_pri),
      descuento_ausencias_usd: toUSD(descuento_ausencias_pri), descuento_ausencias_bs: toBS(descuento_ausencias_pri),
      reposo_convalidado_usd:  toUSD(reposo_convalidado_pri),  reposo_convalidado_bs:  toBS(reposo_convalidado_pri),
      dias_feriados_usd:       toUSD(dias_feriados_pri),       dias_feriados_bs:       toBS(dias_feriados_pri),
      bono_nocturno_usd:       toUSD(bono_nocturno_pri),       bono_nocturno_bs:       toBS(bono_nocturno_pri),
      total_asignaciones_usd:  toUSD(total_asig_pri),          total_asignaciones_bs:  toBS(total_asig_pri),
      ivss_trab_usd:           toUSD(ivss_trab_pri),           ivss_trab_bs:           toBS(ivss_trab_pri),
      rpe_trab_usd:            toUSD(rpe_trab_pri),            rpe_trab_bs:            toBS(rpe_trab_pri),
      faov_trab_usd:           toUSD(faov_trab_pri),           faov_trab_bs:           toBS(faov_trab_pri),
      islr_usd:                toUSD(islr_pri),                islr_bs:                toBS(islr_pri),
      prestamos_usd:           prestamo_usd_val,               prestamos_bs:           prestamo_bs_val,
      cxc_usd:                 cxc_usd_val,                    cxc_bs:                 cxc_bs_val,
      vacaciones_usd:          vacaciones_usd_val,
      total_deducciones_usd:   total_deduc_usd,                total_deducciones_bs:   total_deduc_bs,
      neto_usd,                neto_bs,
      ivss_pat_usd:            toUSD(ivss_pat_pri),            ivss_pat_bs:            toBS(ivss_pat_pri),
      rpe_pat_usd:             toUSD(rpe_pat_pri),             rpe_pat_bs:             toBS(rpe_pat_pri),
      faov_pat_usd:            toUSD(faov_pat_pri),            faov_pat_bs:            toBS(faov_pat_pri),
      inces_pat_usd:           toUSD(inces_pat_pri),           inces_pat_bs:           toBS(inces_pat_pri),
      // Provisiones patronales (en Bs. siempre — referencia para declaración)
      prov_ciclos_anuales: (selected?.tipo?.startsWith('SEMANAL') ? 52
        : selected?.tipo?.startsWith('QUINCENAL') ? 24 : 12),
      prov_fraccion_dias: (() => {
        const ciclos = selected?.tipo?.startsWith('SEMANAL') ? 52
          : selected?.tipo?.startsWith('QUINCENAL') ? 24 : 12;
        return (Number(configNomina.dias_utilidades || 30)) / ciclos;
      })(),
      prov_salario_prom_diario_bs: (() => {
        const salBs = isBS ? salBase : salBase * t;
        return (salBs + Number(formItem.bono_vacacional_bs || 0)) / 30;
      })(),
      prov_fraccion_bs: (() => {
        const ciclos = selected?.tipo?.startsWith('SEMANAL') ? 52
          : selected?.tipo?.startsWith('QUINCENAL') ? 24 : 12;
        const fracDias = Number(configNomina.dias_utilidades || 30) / ciclos;
        const salBs = isBS ? salBase : salBase * t;
        const salPromDiaBs = (salBs + Number(formItem.bono_vacacional_bs || 0)) / 30;
        return salPromDiaBs * fracDias;
      })(),
    };
  })();

  const handleSaveItem = async () => {
    // Cuando la nómina es en Bs., los campos "_usd" del backend deben recibir
    // los valores en Bs. (moneda primaria) para que totalAsig/neto queden en Bs.
    // Cuando es en USD, se envían los valores en USD como siempre.
    const pri = (bsVal, usdVal) => isBS ? bsVal : usdVal;
    const payload = {
      ...formItem,
      he_diurnas_usd:          pri(computed.he_diurnas_bs,          computed.he_diurnas_usd),
      he_nocturnas_usd:        pri(computed.he_nocturnas_bs,        computed.he_nocturnas_usd),
      dias_adicionales_usd:    pri(computed.dias_adicionales_bs,    computed.dias_adicionales_usd),
      descuento_minutos_usd:   pri(computed.descuento_minutos_bs,   computed.descuento_minutos_usd),
      descuento_ausencias_usd: pri(computed.descuento_ausencias_bs, computed.descuento_ausencias_usd),
      reposo_convalidado_usd:  pri(computed.reposo_convalidado_bs,  computed.reposo_convalidado_usd),
      islr_retenido:           pri(computed.islr_bs,                computed.islr_usd),
      prestamos_deduc:         computed.prestamos_usd,
      prestamos_bs:            computed.prestamos_bs,
      otras_deducciones:       computed.cxc_usd,
      cxc_empleados_bs:        computed.cxc_bs,
      vacaciones_usd:          pri(Number(formItem.vacaciones_bs || 0), computed.vacaciones_usd),
      lunes_periodo:           Number(formItem.lunes_periodo || defLunes(selected?.tipo)),
    };
    try {
      await api.put(`/nomina/${selected.id}/items/${editItem.id}`, payload);
      setEditItem(null);
      loadDetalle(selected);
    } catch (e) { alert(e.response?.data?.error || 'Error al guardar'); }
  };

  const handleConfirmSuspender = async () => {
    if (!suspendTarget) return;
    try {
      await api.post(`/nomina/${selected.id}/items/${suspendTarget.id}/suspender-vacaciones`);
      setSuspendTarget(null);
      loadDetalle(selected);
    } catch (e) { alert(e.response?.data?.error || 'Error al suspender'); }
  };

  const handleVerPreNomina = async () => {
    try {
      const r = await api.get(`/nomina/${selected.id}/prenomina`);
      setPrenominaData(r.data);
      setShowPreNomina(true);
    } catch (e) { alert('Error al cargar pre-nómina'); }
  };

  const handleVerResumen = async () => {
    try {
      const r = await api.get(`/nomina/${selected.id}/prenomina`);
      setPrenominaData(r.data);
      setShowResumen(true);
    } catch (e) { alert('Error al cargar resumen de nómina'); }
  };

  const handleVerRecibos = async () => {
    try {
      const r = await api.get(`/nomina/${selected.id}/prenomina`);
      setPrenominaData(r.data);
      setRecibosModo('inicio');
      setShowRecibos(true);
    } catch (e) { alert('Error al cargar recibos de pago'); }
  };

  const handleVerReporteNomina = async () => {
    try {
      const r = await api.get(`/nomina/${selected.id}/prenomina`);
      setPrenominaData(r.data);
      setShowReporteNomina(true);
    } catch (e) { alert('Error al cargar reporte de nómina'); }
  };

  const handleVerReporteParafiscales = async () => {
    try {
      const r = await api.get(`/nomina/${selected.id}/prenomina`);
      setPrenominaData(r.data);
      setShowReporteParafiscales(true);
    } catch (e) { alert('Error al cargar reporte de parafiscales'); }
  };

  const handleVerReporteProvisiones = async () => {
    try {
      const r = await api.get(`/nomina/${selected.id}/prenomina`);
      setPrenominaData(r.data);
      setShowReporteProvisiones(true);
    } catch (e) { alert('Error al cargar reporte de provisiones'); }
  };

  const handleAbrirTxtPago = async () => {
    try {
      if (!(prenominaData?.nomina?.id === selected?.id)) {
        const r = await api.get(`/nomina/${selected.id}/prenomina`);
        setPrenominaData(r.data);
      }
      setTxtFechaPago(dayjs().format('YYYY-MM-DD'));
      setShowTxtPago(true);
    } catch (e) { alert('Error al cargar la nómina'); }
  };

  // Genera el archivo .TXT de pago según Configuración > Parámetros bancarios
  const handleGenerarTXT = () => {
    try {
      const { nomina: pnom, empresa: pemp, items: pitems } = prenominaData;
      const ptasa = Number(pnom.tasa_bcv || 1);
      const pIsBS = monedaNomina === 'BS';
      const toBS  = v => pIsBS ? Number(v||0) : Number(v||0) * ptasa;

      const formato   = configNomina.formato_txt || 'TAB';
      const incEnc    = configNomina.incluir_encabezado === undefined ? 1 : configNomina.incluir_encabezado;
      const sep       = formato === 'CSV_COMA' ? ',' : formato === 'CSV_PUNTOCOMA' ? ';' : '\t';
      const fechaPago = dayjs(txtFechaPago).format('DD/MM/YYYY');
      const totalBs   = pitems.reduce((a, i) => a + toBS(i.neto_pagar), 0);

      // Una fila por trabajador: cédula, tipo cuenta, cuenta, nombre, monto Bs.
      const rows = pitems.map((i, idx) => ({
        nro:    String(idx + 1),
        cedula: `${i.letra_ci || 'V'}${i.cedula || ''}`,
        tipo:   (i.tipo_cuenta || 'CORRIENTE').toUpperCase(),
        cuenta: String(i.numero_cuenta || '').replace(/[^0-9]/g, ''),
        nombre: i.empleado_nombre || '',
        monto:  toBS(i.neto_pagar).toFixed(2),
      }));

      let lines = [];

      if (formato === 'ANCHO_FIJO') {
        // Columnas de ancho fijo alineadas
        const pad  = (s, n) => String(s).padEnd(n).slice(0, n);
        const padL = (s, n) => String(s).padStart(n).slice(0, n);
        if (incEnc) {
          lines.push(pad('CEDULA', 12) + pad('TIPO CTA', 12) + pad('CUENTA', 22) + pad('NOMBRE', 40) + padL('MONTO Bs.', 16));
        }
        rows.forEach(r => {
          lines.push(pad(r.cedula, 12) + pad(r.tipo, 12) + pad(r.cuenta, 22) + pad(r.nombre, 40) + padL(r.monto, 16));
        });
      } else {
        // Delimitado (TAB / coma / punto y coma)
        if (incEnc) {
          lines.push(['CEDULA', 'TIPO_CUENTA', 'CUENTA', 'NOMBRE', 'MONTO_BS'].join(sep));
        }
        rows.forEach(r => {
          lines.push([r.cedula, r.tipo, r.cuenta, r.nombre, r.monto].join(sep));
        });
      }

      // Bloque de cabecera con los parámetros bancarios (opcional)
      if (incEnc) {
        const header = [
          `EMPRESA${sep}${pemp?.razon_social || ''}`,
          `RIF${sep}${pemp?.rif || ''}`,
          `BANCO PAGADOR${sep}${configNomina.banco_pagador || 'NO CONFIGURADO'}`,
          `CUENTA ORIGEN${sep}${configNomina.tipo_cuenta_origen || 'CORRIENTE'} ${configNomina.cuenta_origen || 'NO CONFIGURADA'}`,
          `CONCEPTO${sep}${configNomina.concepto_pago || 'PAGO DE NOMINA'}`,
          `PERIODO${sep}${pnom.periodo}`,
          `FECHA DE PAGO${sep}${fechaPago}`,
          `TRABAJADORES${sep}${rows.length}`,
          `TOTAL Bs.${sep}${totalBs.toFixed(2)}`,
          ``,
        ];
        lines = [...header, ...lines];
      }

      const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `PAGO_NOMINA_${pnom.periodo}_${pnom.tipo}_${dayjs(txtFechaPago).format('YYYYMMDD')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Error al generar archivo'); }
  };

  const downloadFile = async (endpoint, filename) => {
    try {
      const r = await api.get(`/nomina/${selected.id}/${endpoint}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Error al generar archivo'); }
  };

  const downloadRNET = async () => {
    const r = await api.get(`/nomina/${selected.id}/archivo-rnet`);
    const d = r.data;
    const dl = (content, name) => {
      const url = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    };
    dl(d.trabajadores_csv, `rnet_trabajadores_${d.periodo}.csv`);
    setTimeout(() => dl(d.nomina_csv, `rnet_nomina_${d.periodo}.csv`), 300);
  };

  // ── RECIBOS DE PAGO ─────────────────────────────────────────
  if (showRecibos && prenominaData) {
    const { nomina: pnom, empresa: pemp, items: pitems, usuario_nombre: pusuario } = prenominaData;
    const ptasa = Number(pnom.tasa_bcv || 1);
    const pIsBS = monedaNomina === 'BS';
    const rToUSD = v => pIsBS ? Number(v||0) / ptasa : Number(v||0);
    const rToBS  = v => pIsBS ? Number(v||0) : Number(v||0) * ptasa;

    const cicloLabel = (() => {
      const t = pnom.tipo;
      if (t === 'MENSUAL')     return 'Mensual';
      if (t === 'QUINCENAL_1') return '1ra quincena';
      if (t === 'QUINCENAL_2') return '2da quincena';
      if (t?.startsWith('SEMANAL_')) return 'Semana ' + t.split('_')[1];
      return t || '';
    })();
    const fmtBs    = n => `Bs. ${Number(n||0).toFixed(2)}`;
    const fechaFmt = d => d ? dayjs(d).format('DD/MM/YYYY') : '—';

    // Filas de conceptos (asignaciones + retenciones/deducciones) de un trabajador
    const conceptosHTML = (i) => {
      const salDia    = Number(i.salario_base||0) / 30;
      const diasHabBs = rToBS(Number(i.dias_habiles||0) * salDia);
      const diasDesBs = rToBS(Number(i.dias_descanso||0) * salDia);
      const totalAsigBs = diasHabBs + diasDesBs
        + rToBS(i.he_diurnas_usd) + rToBS(i.he_nocturnas_usd)
        + rToBS(i.dias_adicionales_usd) + rToBS(i.reposo_convalidado_usd)
        + rToBS(i.dias_feriados_usd) + rToBS(i.bono_nocturno_usd);
      const totalDedBs = rToBS(i.total_deducciones);
      const row = (label, cant, asig, dedu) =>
        (asig > 0 || dedu > 0)
          ? `<tr><td>${label}</td><td style="text-align:center;color:#666;font-size:9px">${cant||''}</td><td style="text-align:right;color:#15803d">${asig>0?fmtBs(asig):''}</td><td style="text-align:right;color:#c00">${dedu>0?fmtBs(dedu):''}</td></tr>`
          : '';
      return [
        `<tr><td colspan="4" style="padding:4px 0 2px;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#15803d;border-bottom:1px solid #ddd">Asignaciones</td></tr>`,
        row('Días hábiles', `${i.dias_habiles||0} días`, diasHabBs, 0),
        row('Días de descanso', `${i.dias_descanso||0} días`, diasDesBs, 0),
        row('H.E. diurnas (×1.50)', `${i.he_diurnas_cantidad||0} h`, rToBS(i.he_diurnas_usd), 0),
        row('H.E. nocturnas (×1.95)', `${i.he_nocturnas_cantidad||0} h`, rToBS(i.he_nocturnas_usd), 0),
        row('Días adicionales', `${i.dias_adicionales_cantidad||0} días`, rToBS(i.dias_adicionales_usd), 0),
        row('Reposo convalidado (×1.33)', `${i.reposo_convalidado_cantidad||0} días`, rToBS(i.reposo_convalidado_usd), 0),
        row('Domingos y feriados (×1.50)', `${i.dias_feriados_cantidad||0} días`, rToBS(i.dias_feriados_usd), 0),
        row('Bono nocturno (×1.30)', `${i.bono_nocturno_dias||0} días`, rToBS(i.bono_nocturno_usd), 0),
        `<tr><td style="font-weight:700;color:#111">TOTAL ASIGNACIONES</td><td></td><td style="text-align:right;font-weight:700;color:#111">${fmtBs(totalAsigBs)}</td><td></td></tr>`,
        `<tr><td colspan="4" style="padding:4px 0 2px;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#c00;border-bottom:1px solid #ddd">Retenciones y Deducciones</td></tr>`,
        row('S.S.O. (IVSS) trabajador', '4%', 0, rToBS(i.ivss_trabajador)),
        row('P.I.E. (RPE) trabajador', '0.5%', 0, rToBS(i.rpe_trabajador)),
        row('F.A.O.V. (BANAVIH)', '1%', 0, rToBS(i.faov_trabajador)),
        row('ISLR retenido', i.islr_porcentaje > 0 ? `${i.islr_porcentaje}%` : '', 0, rToBS(i.islr_retenido)),
        row('Desc. por minutos', `${i.descuento_minutos_cantidad||0} min`, 0, rToBS(i.descuento_minutos_usd)),
        row('Desc. por ausencias', `${i.descuento_ausencias_cantidad||0} días`, 0, rToBS(i.descuento_ausencias_usd)),
        row('Préstamo', '', 0, rToBS(i.prestamos_deduc)),
        row('CxC empleado', '', 0, rToBS(i.otras_deducciones)),
        totalDedBs > 0 ? `<tr><td style="font-weight:700;color:#c00">TOTAL DEDUCCIONES</td><td></td><td></td><td style="text-align:right;font-weight:700;color:#c00">${fmtBs(totalDedBs)}</td></tr>` : '',
      ].join('');
    };

    // HTML de un recibo individual (1 trabajador por hoja, carta, vertical)
    const reciboInner = (i) => {
      const netoBs  = rToBS(i.neto_pagar);
      const netoUSD = rToUSD(i.neto_pagar);
      const dato = (lbl, val) =>
        `<div class="rec-dato"><span class="rec-dlbl">${lbl}</span><span class="rec-dval">${val||'—'}</span></div>`;
      return `
        <div class="recibo">
          <div class="rec-emp">
            <div style="font-size:13px;font-weight:700">${pemp?.razon_social||'Empresa'}</div>
            <div style="font-size:9px;color:#555">RIF: ${pemp?.rif||'—'} | N° Patronal IVSS: ${pemp?.numero_patronal_ivss||'—'}</div>
          </div>
          <div class="rec-title">RECIBO DE PAGO DE NÓMINA DE SALARIO</div>
          <div class="rec-datos">
            ${dato('Nombre', i.empleado_nombre)}
            ${dato('C.I.', `${i.letra_ci||'V'}-${i.cedula||''}`)}
            ${dato('Expediente', i.numero_expediente)}
            ${dato('Cargo', i.cargo)}
            ${dato('Departamento', i.departamento)}
            ${dato('Fecha de ingreso', fechaFmt(i.fecha_ingreso))}
            ${dato('Cuenta bancaria', i.numero_cuenta ? `${i.banco||''} ${i.numero_cuenta}`.trim() : '—')}
            ${dato('Correo', i.email)}
            ${dato('Período de nómina', `${pnom.periodo} — ${cicloLabel}`)}
          </div>
          <table class="rec-table">
            <thead><tr>
              <th style="text-align:left">CONCEPTOS</th>
              <th style="text-align:center">CANT./PORC.</th>
              <th style="text-align:right;color:#15803d">ASIG. (Bs.)</th>
              <th style="text-align:right;color:#c00">RET./DEDU. (Bs.)</th>
            </tr></thead>
            <tbody>${conceptosHTML(i)}</tbody>
          </table>
          <div class="rec-neto">
            <span class="rec-neto-label">NETO A COBRAR</span>
            <div class="rec-neto-vals">
              <span class="rec-neto-usd">$ ${netoUSD.toFixed(2)}</span>
              <span class="rec-neto-bs">Bs. ${netoBs.toFixed(2)}</span>
            </div>
          </div>
          <div class="rec-firma">
            <div class="firma-box"><div class="firma-line"></div><div>Firma del trabajador</div></div>
            <div class="firma-box"><div class="firma-line"></div><div>Firma de la empresa</div></div>
          </div>
          <div class="rec-footer">${pusuario?`Procesado por: ${pusuario} | `:''}Generado el ${new Date().toLocaleDateString('es-VE')}</div>
        </div>`;
    };

    const reciboCSS = `
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0;padding:10px}
      .recibo{border:1px solid #ccc;border-radius:6px;padding:16px;margin:0 auto 16px;page-break-after:always;max-width:680px}
      .recibo:last-child{page-break-after:auto}
      .rec-emp{text-align:center;border-bottom:1px solid #ddd;padding-bottom:6px;margin-bottom:6px}
      .rec-title{text-align:center;font-weight:700;font-size:13px;letter-spacing:1px;background:#111;color:#fff;padding:6px;border-radius:4px;margin-bottom:10px}
      .rec-datos{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;margin-bottom:10px}
      .rec-dato{display:flex;justify-content:space-between;font-size:10px;border-bottom:1px dotted #e0e0e0;padding:3px 0;gap:8px}
      .rec-dlbl{color:#777;white-space:nowrap}
      .rec-dval{font-weight:700;color:#111;text-align:right}
      .rec-table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:4px}
      .rec-table thead th{padding:4px 6px;border-bottom:2px solid #ddd;font-size:9px;font-weight:700}
      .rec-table tbody td{padding:3px 6px;border-bottom:1px solid #f0f0f0}
      .rec-neto{display:flex;justify-content:space-between;align-items:center;background:#f0fdf4;border-top:2px solid #86efac;padding:10px 12px;border-radius:4px;margin:8px 0}
      .rec-neto-label{font-weight:700;font-size:13px;color:#15803d}
      .rec-neto-vals{display:flex;gap:16px;align-items:baseline}
      .rec-neto-usd{font-weight:700;font-size:16px;color:#15803d}
      .rec-neto-bs{font-size:12px;color:#166534;font-weight:600}
      .rec-firma{display:flex;gap:40px;margin-top:24px}
      .firma-box{flex:1;text-align:center;font-size:9px;color:#555}
      .firma-line{border-top:1px solid #999;margin-bottom:4px;margin-top:30px}
      .rec-footer{font-size:9px;color:#888;margin-top:8px;text-align:right}
      @media print{body{padding:0} @page{size:letter portrait;margin:1.5cm} button{display:none}}
    `;

    const abrirVentana = (titulo, cuerpo, autoprint) => {
      const w = window.open('', '_blank', 'width=900,height=900');
      w.document.write(`<html><head><title>${titulo}</title><style>${reciboCSS}</style></head><body>${cuerpo}</body></html>`);
      w.document.close();
      if (autoprint) setTimeout(() => w.print(), 400);
    };

    const verRecibo = (i) =>
      abrirVentana(`Recibo — ${i.empleado_nombre}`, reciboInner(i), false);

    const descargarReciboPDF = (i) =>
      abrirVentana(`Recibo ${i.empleado_nombre} — ${pnom.periodo}`, reciboInner(i), true);

    const descargarTodos = () =>
      abrirVentana(`Recibos de pago — ${pnom.periodo}`, pitems.map(reciboInner).join(''), true);

    const enviarReciboEmail = async (i) => {
      if (!i.email) { alert(`${i.empleado_nombre} no tiene correo registrado.`); return; }
      if (!window.confirm(`¿Enviar el recibo de pago a ${i.email}?`)) return;
      setReciboEnviando(i.id);
      try {
        await api.post('/nomina/recibo/email', {
          empleado_id: i.empleado_id,
          asunto: `Recibo de pago de nómina de salario — ${pnom.periodo}`,
          html: `<html><head><meta charset="utf-8"><style>${reciboCSS}</style></head><body>${reciboInner(i)}</body></html>`,
        });
        alert(`Recibo enviado a ${i.email}`);
      } catch (e) {
        alert(e.response?.data?.error || 'No se pudo enviar el correo');
      } finally {
        setReciboEnviando(null);
      }
    };

    const iconBtn = (titulo, contenido, onClick, color) => (
      <button title={titulo} onClick={onClick}
        style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd', background: '#fff',
          cursor: 'pointer', fontSize: 15, lineHeight: 1, color: color || '#444' }}>
        {contenido}
      </button>
    );

    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>Recibos de pago de nómina de salarios</span>
            <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft: 8 }}>{pnom.estado}</span>
          </div>
          <button className="btn btn-secondary"
            onClick={() => recibosModo === 'lista' ? setRecibosModo('inicio') : setShowRecibos(false)}>
            ← Volver
          </button>
        </div>
        <div style={{ color: '#555', fontSize: 13, marginBottom: 20 }}>
          {pemp?.razon_social} | Período: <strong>{pnom.periodo}</strong> — {cicloLabel} | {pitems.length} trabajador{pitems.length !== 1 ? 'es' : ''}
        </div>

        {recibosModo === 'inicio' && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <button onClick={() => setRecibosModo('lista')}
              style={{ flex: '1 1 280px', maxWidth: 360, textAlign: 'left', cursor: 'pointer',
                border: '1px solid #ddd', borderRadius: 10, padding: 20, background: '#fff' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>👁️</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>Ver recibos de pago</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                Listado de trabajadores: visualizar, enviar por correo o descargar el recibo de cada uno.
              </div>
            </button>
            <button onClick={descargarTodos}
              style={{ flex: '1 1 280px', maxWidth: 360, textAlign: 'left', cursor: 'pointer',
                border: '1px solid #ddd', borderRadius: 10, padding: 20, background: '#fff' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⬇️</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>Descargar todos los recibos de pago</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                Genera un único PDF con un recibo por hoja (tamaño carta, vertical) para todos los trabajadores.
              </div>
            </button>
          </div>
        )}

        {recibosModo === 'lista' && (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Trabajador</th>
                <th>C.I.</th>
                <th>Cargo</th>
                <th>Departamento</th>
                <th>Correo</th>
                <th style={{ textAlign: 'right' }}>Neto a cobrar</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pitems.map((i, idx) => (
                <tr key={i.id}>
                  <td>{idx + 1}</td>
                  <td className="fw-600">{i.empleado_nombre}</td>
                  <td>{i.letra_ci || 'V'}-{i.cedula}</td>
                  <td>{i.cargo || '—'}</td>
                  <td>{i.departamento || '—'}</td>
                  <td style={{ fontSize: 12, color: i.email ? '#444' : '#c00' }}>
                    {i.email || 'Sin correo'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>
                    {fmtBs(rToBS(i.neto_pagar))}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      {iconBtn('Ver recibo', '👁️', () => verRecibo(i), '#1d4ed8')}
                      {iconBtn(
                        i.email ? 'Enviar al correo del trabajador' : 'Sin correo registrado',
                        reciboEnviando === i.id ? '…' : '✉️',
                        () => enviarReciboEmail(i),
                        '#b45309'
                      )}
                      {iconBtn('Descargar PDF individual', '⬇️', () => descargarReciboPDF(i), '#15803d')}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── RESUMEN DE NÓMINA (nómina cerrada) ──────────────────────
  if (showResumen && prenominaData) {
    const { nomina: pnom, empresa: pemp, items: pitems } = prenominaData;
    const ptasa = Number(pnom.tasa_bcv || 1);
    const pIsBS = monedaNomina === 'BS';
    const toUSDr = v => pIsBS ? Number(v||0) / ptasa : Number(v||0);
    const toBSr  = v => pIsBS ? Number(v||0) : Number(v||0) * ptasa;
    const usd = v => `$ ${toUSDr(v).toFixed(2)}`;
    const bs  = v => `Bs. ${toBSr(v).toFixed(2)}`;
    const sumR = key => pitems.reduce((a, i) => a + Number(i[key] || 0), 0);

    const cicloLabel = (() => {
      const t = pnom.tipo;
      if (t === 'MENSUAL')     return 'Mensual';
      if (t === 'QUINCENAL_1') return '1ra quincena';
      if (t === 'QUINCENAL_2') return '2da quincena';
      if (t === 'SEMANAL_1')   return 'Semana 1';
      if (t === 'SEMANAL_2')   return 'Semana 2';
      if (t === 'SEMANAL_3')   return 'Semana 3';
      if (t === 'SEMANAL_4')   return 'Semana 4';
      if (t === 'SEMANAL_5')   return 'Semana 5';
      return t;
    })();

    const handlePrintResumen = () => {
      const content = document.getElementById('resumen-nomina-content').innerHTML;
      const w = window.open('', '_blank', 'width=1000,height=700');
      w.document.write(`<html><head><title>Resumen de Nómina — ${pnom.periodo}</title>
        <style>
          body{font-family:Arial,sans-serif;font-size:10px;color:#000;margin:14px}
          h2{font-size:14px;margin:0 0 2px;text-align:center;font-weight:700}
          .titulo{text-align:center;font-weight:700;font-size:12px;margin:0 0 8px;letter-spacing:0.5px}
          .meta{display:flex;gap:20px;margin-bottom:10px;font-size:10px;flex-wrap:wrap;justify-content:center}
          table{width:100%;border-collapse:collapse;margin-top:8px}
          th,td{border:1px solid #bbb;padding:4px 7px}
          th{background:#e8e8e8;font-weight:700;text-align:center;font-size:10px}
          td{font-size:10px}
          .r{text-align:right} .c{text-align:center}
          .sub{display:block;color:#888;font-size:8px}
          tfoot td{font-weight:700;background:#f5f5f5}
          .neto{background:#f0fdf4}
          .footer{margin-top:10px;font-size:9px;color:#666;text-align:right}
          @page{size:A4 landscape;margin:1cm}
        </style>
        </head><body>${content}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 400);
    };

    const dcell = (v, red, bold) => (
      <td style={{ textAlign:'right', whiteSpace:'nowrap', fontWeight: bold ? 700 : 400 }}>
        <span style={{ display:'block', color: red ? '#CC0000' : '#1d4ed8', fontWeight: bold ? 700 : 400 }}>{usd(v)}</span>
        <span style={{ display:'block', color: red ? '#c47a00' : '#b45309', fontSize:10 }}>{bs(v)}</span>
      </td>
    );
    const dNetocell = (v) => (
      <td style={{ textAlign:'right', whiteSpace:'nowrap', background:'#f0fdf4' }}>
        <span style={{ display:'block', color:'#15803d', fontWeight:700, fontSize:13 }}>{usd(v)}</span>
        <span style={{ display:'block', color:'#166534', fontSize:11, fontWeight:600 }}>{bs(v)}</span>
      </td>
    );
    const dfoot = (v, red) => (
      <td style={{ textAlign:'right', fontWeight:700, whiteSpace:'nowrap', background:'#f5f5f5' }}>
        <span style={{ display:'block', color: red ? '#CC0000' : '#1d4ed8' }}>{usd(v)}</span>
        <span style={{ display:'block', color: red ? '#c47a00' : '#b45309', fontSize:10 }}>{bs(v)}</span>
      </td>
    );

    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>Resumen de Nómina de Salarios</span>
            <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft: 8 }}>{pnom.estado}</span>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handlePrintResumen}>Imprimir / Guardar PDF</button>
            <button className="btn btn-secondary" onClick={() => setShowResumen(false)}>← Volver</button>
          </div>
        </div>

        <div id="resumen-nomina-content">
          <h2 style={{ color: '#111', textAlign: 'center', marginBottom: 2 }}>{pemp?.razon_social || 'Empresa'}</h2>
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, color: '#111', letterSpacing: 0.5, marginBottom: 10 }}>
            RESUMEN DE NÓMINA / {pnom.periodo} — {cicloLabel}
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: '#555', marginBottom: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span>RIF: <strong style={{ color: '#111' }}>{pemp?.rif || '—'}</strong></span>
            <span>Tasa BCV: <strong style={{ color: '#111' }}>Bs. {ptasa.toFixed(2)}</strong></span>
            <span>Moneda: <strong style={{ color: pIsBS ? '#b45309' : '#1d4ed8' }}>{pIsBS ? 'Bolívares (Bs.)' : 'Dólares (USD)'}</strong></span>
            <span>Trabajadores: <strong style={{ color: '#111' }}>{pitems.length}</strong></span>
          </div>

          <div className="table-wrapper">
            <table style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', minWidth: 170 }}>Nombre trabajador</th>
                  <th style={{ minWidth: 90 }}>C.I.</th>
                  <th style={{ minWidth: 120 }}>Salario base</th>
                  <th style={{ background: '#f0fdf4', color: '#15803d', minWidth: 140 }}>Total asignaciones</th>
                  <th style={{ background: '#fff0f0', color: '#CC0000', minWidth: 140 }}>Total deduc. y retenc.</th>
                  <th style={{ background: '#f0fdf4', color: '#15803d', fontWeight: 700, minWidth: 140 }}>NETO A COBRAR</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let lastDepto = null;
                  return pitems.flatMap(i => {
                    const rows = [];
                    const depto = i.departamento || '(Sin departamento)';
                    if (depto !== lastDepto) {
                      lastDepto = depto;
                      rows.push(
                        <tr key={`dept-${depto}`}>
                          <td colSpan={6} style={{ background: '#e8f4ff', color: '#1d4ed8', fontWeight: 700, fontSize: 10, padding: '5px 8px', letterSpacing: 1, textTransform: 'uppercase' }}>
                            Departamento: {depto}
                          </td>
                        </tr>
                      );
                    }
                    const sp = Number(i.salario_base||0) / 30;
                    const totalAsigPri = Number(i.dias_habiles||0)*sp + Number(i.dias_descanso||0)*sp
                      + Number(i.he_diurnas_usd||0) + Number(i.he_nocturnas_usd||0)
                      + Number(i.dias_adicionales_usd||0) + Number(i.reposo_convalidado_usd||0)
                      + Number(i.dias_feriados_usd||0) + Number(i.bono_nocturno_usd||0);
                    const totalDeduRet = Number(i.ivss_trabajador||0) + Number(i.rpe_trabajador||0)
                      + Number(i.faov_trabajador||0) + Number(i.islr_retenido||0)
                      + Number(i.total_deducciones||0);
                    rows.push(
                      <tr key={i.id}>
                        <td style={{ fontWeight: 600 }}>{i.empleado_nombre}</td>
                        <td style={{ textAlign: 'center' }}>{i.letra_ci||'V'}-{i.cedula}</td>
                        {dcell(i.salario_base)}
                        {dcell(totalAsigPri, false, true)}
                        {dcell(totalDeduRet, true, true)}
                        {dNetocell(i.neto_pagar)}
                      </tr>
                    );
                    return rows;
                  });
                })()}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ fontWeight: 700, background: '#f5f5f5' }}>TOTALES ({pitems.length} trabajadores)</td>
                  {dfoot(sumR('salario_base'))}
                  {dfoot(pitems.reduce((a, i) => {
                    const sp = Number(i.salario_base||0) / 30;
                    return a + Number(i.dias_habiles||0)*sp + Number(i.dias_descanso||0)*sp
                      + Number(i.he_diurnas_usd||0) + Number(i.he_nocturnas_usd||0)
                      + Number(i.dias_adicionales_usd||0) + Number(i.reposo_convalidado_usd||0)
                      + Number(i.dias_feriados_usd||0) + Number(i.bono_nocturno_usd||0);
                  }, 0))}
                  {dfoot(pitems.reduce((a, i) =>
                    a + Number(i.ivss_trabajador||0) + Number(i.rpe_trabajador||0)
                      + Number(i.faov_trabajador||0) + Number(i.islr_retenido||0)
                      + Number(i.total_deducciones||0), 0), true)}
                  <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', background: '#f0fdf4' }}>
                    <span style={{ display: 'block', color: '#15803d', fontSize: 13 }}>{usd(sumR('neto_pagar'))}</span>
                    <span style={{ display: 'block', color: '#166534', fontSize: 11 }}>{bs(sumR('neto_pagar'))}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: '#666' }}>
            Reporte generado el {dayjs().format('DD/MM/YYYY HH:mm')} — Nómina en estado {pnom.estado}.
          </div>
        </div>
      </div>
    );
  }

  // ── PRE-NÓMINA / REPORTE DE NÓMINA ──────────────────────────
  if ((showPreNomina || showReporteNomina) && prenominaData) {
    const modoReporte = showReporteNomina;
    const { nomina: pnom, empresa: pemp, items: pitems, usuario_nombre: pusuario } = prenominaData;
    const ptasa = Number(pnom.tasa_bcv || 1);
    const pIsBS = monedaNomina === 'BS';
    // cc: moneda primaria de la nómina; ccbs: moneda secundaria (conversión inversa si es BS)
    const cc   = v => pIsBS ? `Bs. ${Number(v || 0).toFixed(2)}` : `$ ${Number(v || 0).toFixed(2)}`;
    const ccbs = v => pIsBS
      ? `$ ${(Number(v || 0) / ptasa).toFixed(2)}`
      : `Bs. ${(Number(v || 0) * ptasa).toFixed(0)}`;
    const sum = key => pitems.reduce((a, i) => a + Number(i[key] || 0), 0);

    // Helpers para convertir valor primario ↔ USD/Bs.
    const toUSDp = v => pIsBS ? Number(v||0) / ptasa : Number(v||0);
    const toBSp  = v => pIsBS ? Number(v||0) : Number(v||0) * ptasa;
    const fUSD   = v => `$ ${toUSDp(v).toFixed(2)}`;
    const fBS    = v => `Bs. ${toBSp(v).toFixed(2)}`;

    const handlePrint = () => {
      const content = document.getElementById('prenomina-content').innerHTML;
      const w = window.open('', '_blank', 'width=900,height=800');
      w.document.write(`<html><head><title>${modoReporte ? 'Reporte de Nómina' : 'Pre-nómina'} ${pnom.periodo}</title>
        <style>
          body{font-family:Arial,sans-serif;font-size:10px;color:#000;margin:15px}
          h2{font-size:14px;margin:0 0 4px}
          .meta{display:flex;gap:20px;margin-bottom:10px;font-size:11px;flex-wrap:wrap}
          .worker-card{border:1px solid #ccc;border-radius:6px;margin-bottom:16px;page-break-inside:avoid}
          .card-header{background:#f0f0f0;padding:8px 12px;border-radius:6px 6px 0 0}
          .card-header h3{margin:0;font-size:12px}
          .card-header .sub{font-size:10px;color:#555;margin-top:2px}
          .section-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:4px 12px;margin:0}
          .sec-asig{background:#f0fdf4;color:#15803d}
          .sec-ret{background:#fff0f0;color:#c00}
          .sec-ded{background:#fff0f0;color:#c00}
          .sec-pat{background:#f5f5f5;color:#555}
          table.detail{width:100%;border-collapse:collapse;font-size:10px}
          table.detail thead th{padding:4px 8px;border-bottom:2px solid #ddd;font-size:9px;color:#666;font-weight:700}
          table.detail thead th:nth-child(2){text-align:center}
          table.detail thead th:nth-child(3),table.detail thead th:nth-child(4){text-align:right}
          table.detail td{padding:3px 8px;border-bottom:1px solid #eee}
          table.detail td:nth-child(2){text-align:center;color:#666;font-size:9px;white-space:nowrap}
          table.detail td:nth-child(3){text-align:right;white-space:nowrap;color:#15803d}
          table.detail td:nth-child(4){text-align:right;white-space:nowrap;color:#c00;width:100px}
          .total-row td{font-weight:700;background:#f9f9f9}
          .neto-row{padding:10px 14px;display:flex;justify-content:space-between;align-items:center;background:#f0fdf4;border-top:2px solid #86efac}
          .neto-label{font-weight:700;font-size:13px;color:#15803d}
          .neto-vals{display:flex;gap:20px;align-items:baseline}
          .neto-usd{font-weight:700;font-size:16px;color:#15803d}
          .neto-bs{font-size:12px;color:#166534;font-weight:600}
          .dept-header{background:#dbeafe;color:#1e40af;font-weight:700;font-size:10px;padding:4px 8px;text-transform:uppercase;letter-spacing:1px}
          .notas-block{padding:4px 12px 8px;font-size:10px;color:#555}
          .totales-card{border:2px solid #333;border-radius:6px;margin-top:20px;page-break-inside:avoid}
          .footer{margin-top:8px;font-size:10px;color:#666}
          @page{size:portrait;margin:1.5cm}
        </style>
        </head><body>${content}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 400);
    };

    // Fila: CONCEPTOS | CANT./PORC. | ASIG. (Bs.) | RET./DEDU. (Bs.)
    // isDedu=true → valor en columna RET./DEDU.; isDedu=false → en ASIG.
    const PRow = ({ label, priVal, bold, red, colLabel, cantPorc, isDedu }) => {
      const bsVal = toBSp(priVal);
      if (bsVal === 0 && !bold) return null;
      const isRet = red || isDedu;
      return (
        <tr>
          <td style={{ color: colLabel || (isRet ? '#CC0000' : (bold ? '#111' : '#333')), fontWeight: bold ? 700 : 400 }}>{label}</td>
          <td style={{ textAlign:'center', color:'#666', fontSize:10 }}>{cantPorc || ''}</td>
          <td style={{ textAlign:'right', color: bold && !isRet ? '#111' : '#15803d', fontWeight: bold ? 700 : 400 }}>
            {!isRet && bsVal !== 0 ? `Bs. ${bsVal.toFixed(2)}` : ''}
          </td>
          <td style={{ textAlign:'right', color: '#CC0000', fontWeight: bold ? 700 : 400 }}>
            {isRet && bsVal !== 0 ? `Bs. ${bsVal.toFixed(2)}` : ''}
          </td>
        </tr>
      );
    };

    // Fila con cantidad de días/horas — siempre en columna ASIG.
    const PRowQty = ({ label, qty, priVal, cantLabel }) => {
      const bsVal = toBSp(priVal);
      if (bsVal === 0 && qty === 0) return null;
      return (
        <tr>
          <td style={{ color:'#333' }}>{label}</td>
          <td style={{ textAlign:'center', color:'#666', fontSize:10 }}>{cantLabel || (qty > 0 ? `${qty} días` : '')}</td>
          <td style={{ textAlign:'right', color:'#15803d' }}>Bs. {bsVal.toFixed(2)}</td>
          <td></td>
        </tr>
      );
    };

    const SecTitle = ({ label, color }) => (
      <tr>
        <td colSpan={4} style={{ padding:'5px 0 3px', fontWeight:700, fontSize:10, textTransform:'uppercase', letterSpacing:1, color, paddingLeft: 0, borderBottom:'1px solid #ddd', borderTop:'6px solid transparent' }}>
          {label}
        </td>
      </tr>
    );

    // Fila patronal informativa (en ASIG. con color neutro)
    const PRowPat = ({ label, priVal, cantPorc }) => {
      const bsVal = toBSp(priVal);
      if (bsVal === 0) return null;
      return (
        <tr>
          <td style={{ color:'#555' }}>{label}</td>
          <td style={{ textAlign:'center', color:'#888', fontSize:10 }}>{cantPorc || ''}</td>
          <td style={{ textAlign:'right', color:'#555' }}>Bs. {bsVal.toFixed(2)}</td>
          <td></td>
        </tr>
      );
    };

    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>
              {modoReporte ? 'Reporte de Nómina de Salarios' : 'Pre-nómina'}
            </span>
            {modoReporte
              ? <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft: 8 }}>{pnom.estado}</span>
              : <span className="badge badge-naranja" style={{ marginLeft: 8 }}>BORRADOR — pendiente de cierre</span>
            }
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handlePrint}>Imprimir / Guardar PDF</button>
            <button className="btn btn-secondary" onClick={() => modoReporte ? setShowReporteNomina(false) : setShowPreNomina(false)}>← Volver</button>
          </div>
        </div>

        <div id="prenomina-content">
          {/* ENCABEZADO EMPRESA */}
          {(() => {
            const cicloLabel = (() => {
              const t = pnom.tipo;
              if (t === 'MENSUAL')      return 'Mensual';
              if (t === 'QUINCENAL_1')  return '1ra quincena';
              if (t === 'QUINCENAL_2')  return '2da quincena';
              if (t === 'SEMANAL_1')    return 'Semana 1';
              if (t === 'SEMANAL_2')    return 'Semana 2';
              if (t === 'SEMANAL_3')    return 'Semana 3';
              if (t === 'SEMANAL_4')    return 'Semana 4';
              if (t === 'SEMANAL_5')    return 'Semana 5';
              return t;
            })();
            return (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <h2 style={{ color: '#111', margin: 0 }}>{pemp?.razon_social || 'Empresa'}</h2>
                  </div>
                  {pemp?.logo_path && (
                    <ImagenProtegida src="/empresas/logo" alt="Logo empresa"
                      style={{ height: 56, maxWidth: 160, objectFit: 'contain' }} />
                  )}
                </div>
                {/* TÍTULO DEL REPORTE — centrado, negrita */}
                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#111', letterSpacing: 0.5, marginBottom: 8 }}>
                  {modoReporte ? 'REPORTE DE NÓMINA' : 'PRE-NÓMINA'} / {pnom.periodo} — {cicloLabel}
                </div>
                <div style={{ display: 'flex', gap: 24, fontSize: 12, color: '#555', marginBottom: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span>RIF: <strong style={{ color: '#111' }}>{pemp?.rif || '—'}</strong></span>
                  <span>Nómina: <strong style={{ color: '#111' }}>{pnom.subtipo || 'SALARIOS'}</strong></span>
                  {!modoReporte && <span>Tasa BCV: <strong style={{ color: '#111' }}>Bs. {ptasa.toFixed(2)}</strong></span>}
                  {!modoReporte && <span>Moneda: <strong style={{ color: pIsBS ? '#b45309' : '#1d4ed8' }}>{pIsBS ? 'Bs.' : 'USD'}</strong></span>}
                  <span>Trabajadores: <strong style={{ color: '#111' }}>{pitems.length}</strong></span>
                </div>
                {pnom.observaciones && (
                  <div style={{ marginTop: 6, padding: '5px 10px', background: '#fffbeb', borderRadius: 4, fontSize: 12, color: '#555', borderLeft: '3px solid #f59e0b', textAlign: 'left' }}>
                    <span style={{ fontWeight: 700, color: '#92400e' }}>Observaciones de la nómina: </span>{pnom.observaciones}
                  </div>
                )}
                <div style={{ borderBottom: '1px solid #ddd', marginTop: 10 }} />
              </div>
            );
          })()}

          {/* TARJETAS POR TRABAJADOR — agrupadas por departamento */}
          {(() => {
            let lastDepto = null;
            return pitems.map(i => {
              const salDiarioPri = Number(i.salario_base || 0) / 30;
              const diasHabPri   = Number(i.dias_habiles  || 0) * salDiarioPri;
              const diasDesPri   = Number(i.dias_descanso || 0) * salDiarioPri;
              const totalAsigPri = diasHabPri + diasDesPri
                + Number(i.he_diurnas_usd||0) + Number(i.he_nocturnas_usd||0)
                + Number(i.dias_adicionales_usd||0) + Number(i.reposo_convalidado_usd||0)
                + Number(i.dias_feriados_usd||0) + Number(i.bono_nocturno_usd||0);
              const totalDedPri  = Number(i.total_deducciones || 0);
              const netoPri      = Number(i.neto_pagar || 0);
              const depto = i.departamento || '(Sin departamento)';
              const showDeptHeader = depto !== lastDepto;
              lastDepto = depto;

              return (
                <React.Fragment key={i.id}>
                  {showDeptHeader && (
                    <div style={{ background:'#dbeafe', color:'#1e40af', fontWeight:700, fontSize:11, padding:'6px 12px', marginBottom:8, marginTop:8, borderRadius:4, letterSpacing:1, textTransform:'uppercase' }}>
                      Departamento: {depto}
                    </div>
                  )}
                  <div style={{ border:'1px solid #ddd', borderRadius:8, marginBottom:16, overflow:'hidden' }}>
                    {/* Encabezado trabajador */}
                    <div style={{ background:'#f8f8f8', borderBottom:'1px solid #ddd', padding:'10px 16px' }}>
                      <div style={{ fontWeight:700, fontSize:14, color:'#111' }}>{i.empleado_nombre}</div>
                      <div style={{ fontSize:12, color:'#555', marginTop:4, display:'flex', gap:20, flexWrap:'wrap' }}>
                        <span>C.I.: <strong style={{ color:'#111' }}>{i.cedula}</strong></span>
                        {i.numero_expediente && <span>Exp.: <strong style={{ color:'#111' }}>{i.numero_expediente}</strong></span>}
                        {i.cargo && <span>Cargo: <strong style={{ color:'#111' }}>{i.cargo}</strong></span>}
                        {i.fecha_ingreso && <span>Ingreso: <strong style={{ color:'#111' }}>{String(i.fecha_ingreso).slice(0,10)}</strong></span>}
                        <span>Salario base: <strong style={{ color: '#b45309' }}>{modoReporte ? `Bs. ${toBSp(i.salario_base).toFixed(2)}` : cc(i.salario_base)}</strong></span>
                      </div>
                    </div>

                    <div style={{ padding:'0 16px 16px' }}>
                      {/* TABLA CONCEPTOS 4 COLUMNAS */}
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <colgroup>
                          <col style={{ width:'48%' }} />
                          <col style={{ width:'18%' }} />
                          <col style={{ width:'17%' }} />
                          <col style={{ width:'17%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th style={{ textAlign:'left', padding:'8px 8px 4px', borderBottom:'2px solid #eee', fontSize:10, color:'#555', fontWeight:700 }}>CONCEPTOS</th>
                            <th style={{ textAlign:'center', padding:'8px 8px 4px', borderBottom:'2px solid #eee', fontSize:10, color:'#555', fontWeight:700 }}>CANT./PORC.</th>
                            <th style={{ textAlign:'right', padding:'8px 8px 4px', borderBottom:'2px solid #eee', fontSize:10, color:'#15803d', fontWeight:700 }}>ASIG. (Bs.)</th>
                            <th style={{ textAlign:'right', padding:'8px 8px 4px', borderBottom:'2px solid #eee', fontSize:10, color:'#CC0000', fontWeight:700 }}>RET./DEDU. (Bs.)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <SecTitle label="Asignaciones" color="#15803d" />
                          <PRowQty label="Días hábiles"    qty={Number(i.dias_habiles||0)}  priVal={diasHabPri} cantLabel={`${Number(i.dias_habiles||0)} días`} />
                          <PRowQty label="Días de descanso" qty={Number(i.dias_descanso||0)} priVal={diasDesPri} cantLabel={`${Number(i.dias_descanso||0)} días`} />
                          <PRow label="H.E. diurnas (×1.50)"        priVal={i.he_diurnas_usd}         cantPorc={Number(i.he_diurnas_cantidad||0) > 0 ? `${i.he_diurnas_cantidad} h` : ''} />
                          <PRow label="H.E. nocturnas (×1.95)"      priVal={i.he_nocturnas_usd}       cantPorc={Number(i.he_nocturnas_cantidad||0) > 0 ? `${i.he_nocturnas_cantidad} h` : ''} />
                          <PRow label="Días adicionales"             priVal={i.dias_adicionales_usd}   cantPorc={Number(i.dias_adicionales_cantidad||0) > 0 ? `${i.dias_adicionales_cantidad} días` : ''} />
                          <PRow label="Reposo convalidado (×1.33)"   priVal={i.reposo_convalidado_usd} cantPorc={Number(i.reposo_convalidado_cantidad||0) > 0 ? `${i.reposo_convalidado_cantidad} días` : ''} />
                          <PRow label="Domingos y feriados (×1.50)"  priVal={i.dias_feriados_usd}      cantPorc={Number(i.dias_feriados_cantidad||0) > 0 ? `${i.dias_feriados_cantidad} días` : ''} />
                          <PRow label="Bono nocturno (×1.30)"        priVal={i.bono_nocturno_usd}      cantPorc={Number(i.bono_nocturno_dias||0) > 0 ? `${i.bono_nocturno_dias} días` : ''} />
                          <PRow label="TOTAL ASIGNACIONES"           priVal={totalAsigPri} bold />

                          <SecTitle label="Retenciones y Deducciones" color="#CC0000" />
                          <PRow label="S.S.O. (IVSS) trabajador"   priVal={i.ivss_trabajador}          cantPorc="4%"    isDedu />
                          <PRow label="P.I.E. (RPE) trabajador"    priVal={i.rpe_trabajador}            cantPorc="0.5%"  isDedu />
                          <PRow label="F.A.O.V. (BANAVIH)"         priVal={i.faov_trabajador}           cantPorc="1%"    isDedu />
                          <PRow label="ISLR retenido"               priVal={i.islr_retenido}             cantPorc={i.islr_porcentaje > 0 ? `${i.islr_porcentaje}%` : ''} isDedu />
                          <PRow label="Desc. por minutos de retraso" priVal={i.descuento_minutos_usd}   cantPorc={Number(i.descuento_minutos_cantidad||0) > 0 ? `${i.descuento_minutos_cantidad} min` : ''} isDedu />
                          <PRow label="Desc. por ausencias"          priVal={i.descuento_ausencias_usd} cantPorc={Number(i.descuento_ausencias_cantidad||0) > 0 ? `${i.descuento_ausencias_cantidad} días` : ''} isDedu />
                          <PRow label="Préstamo"                     priVal={i.prestamos_deduc}          isDedu />
                          <PRow label="CxC empleado"                 priVal={i.otras_deducciones}        isDedu />
                          <PRow label="TOTAL RETENCIONES Y DEDUCCIONES" priVal={totalDedPri} bold isDedu />
                        </tbody>
                      </table>

                      {/* NETO A COBRAR */}
                      <div style={{ margin:'12px 0 10px', padding:'12px 16px', background:'#f0fdf4', borderRadius:6, borderTop:'2px solid #86efac', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontWeight:700, fontSize:14, color:'#15803d' }}>NETO A COBRAR</span>
                        <div style={{ display:'flex', gap:20, alignItems:'baseline' }}>
                          {!modoReporte && <span style={{ fontWeight:700, fontSize:18, color:'#15803d' }}>{fUSD(netoPri)}</span>}
                          <span style={{ fontWeight:700, fontSize: modoReporte ? 20 : 13, color:'#166534' }}>{fBS(netoPri)}</span>
                        </div>
                      </div>

                      {/* NOTAS DEL TRABAJADOR */}
                      {i.notas && (
                        <div style={{ marginBottom:10, padding:'7px 12px', background:'#fffbeb', borderRadius:4, fontSize:12, color:'#444', borderLeft:'4px solid #f59e0b' }}>
                          <span style={{ fontWeight:700, color:'#92400e' }}>Notas: </span>{i.notas}
                        </div>
                      )}

                      {/* APORTES PATRONALES */}
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                        <colgroup>
                          <col style={{ width:'48%' }} />
                          <col style={{ width:'18%' }} />
                          <col style={{ width:'17%' }} />
                          <col style={{ width:'17%' }} />
                        </colgroup>
                        <tbody>
                          <SecTitle label="Aportes patronales (informativo)" color="#555" />
                          <PRowPat label="S.S.O. (IVSS) patronal"      priVal={i.ivss_patronal}  cantPorc="9%" />
                          <PRowPat label="P.I.E. (RPE) patronal"       priVal={i.rpe_patronal}   cantPorc="2%" />
                          <PRowPat label="F.A.O.V. (BANAVIH) patronal" priVal={i.faov_patronal}  cantPorc="2%" />
                          <PRowPat label="Provisión INCES patronal"     priVal={i.inces_patronal} cantPorc="2%" />
                          <PRowPat label="TOTAL APORTES PATRONALES"
                            priVal={Number(i.ivss_patronal||0)+Number(i.rpe_patronal||0)+Number(i.faov_patronal||0)+Number(i.inces_patronal||0)} />
                        </tbody>
                      </table>
                    </div>
                  </div>
                </React.Fragment>
              );
            });
          })()}

          {/* TOTALES GENERALES */}
          {(() => {
            const sumIVSSp  = pitems.reduce((a,i)=>a+Number(i.ivss_patronal||0),0);
            const sumRPEp   = pitems.reduce((a,i)=>a+Number(i.rpe_patronal||0),0);
            const sumFAOVp  = pitems.reduce((a,i)=>a+Number(i.faov_patronal||0),0);
            const sumINCESp = pitems.reduce((a,i)=>a+Number(i.inces_patronal||0),0);
            const sumPatTot = sumIVSSp + sumRPEp + sumFAOVp + sumINCESp;

            const RRow = ({ label, priVal, bold, red, gray }) => {
              const cLabel = gray ? '#555' : (bold ? (red ? '#CC0000' : '#15803d') : (red ? '#CC0000' : '#111'));
              const cUSD   = gray ? '#888' : (bold ? (red ? '#CC0000' : '#15803d') : '#1d4ed8');
              const cBS    = gray ? '#888' : (bold ? (red ? '#CC0000' : '#15803d') : (red ? '#CC0000' : '#b45309'));
              return (
                <tr style={{ borderBottom:'1px solid #eee', background: bold && !red && !gray ? '#f0fdf4' : (gray ? '#fafafa' : 'transparent') }}>
                  <td style={{ padding:'5px 0', fontWeight: bold ? 700 : 400, fontSize: bold && !gray ? 14 : 12, color: cLabel, paddingLeft: gray ? 16 : 0 }}>{label}</td>
                  {!modoReporte && <td style={{ textAlign:'right', padding:'5px 0', fontWeight: bold ? 700 : 400, fontSize: bold && !gray ? 14 : 12, color: cUSD }}>$ {toUSDp(priVal).toFixed(2)}</td>}
                  <td style={{ textAlign:'right', padding:'5px 0', fontWeight: bold ? 700 : 400, fontSize: bold && !gray ? 14 : 12, color: cBS }}>Bs. {toBSp(priVal).toFixed(2)}</td>
                </tr>
              );
            };

            return (
              <div style={{ border:'2px solid #333', borderRadius:8, overflow:'hidden', marginTop:16 }}>
                <div style={{ background:'#111', color:'#fff', padding:'8px 16px', fontWeight:700, fontSize:13 }}>
                  Resumen General — {pitems.length} trabajador{pitems.length !== 1 ? 'es' : ''}
                </div>
                <div style={{ padding:'0 16px 16px' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginTop:8 }}>
                    <colgroup>
                      <col style={{ width: modoReporte ? '70%' : '50%' }} />
                      {!modoReporte && <col style={{ width:'25%' }} />}
                      <col style={{ width: modoReporte ? '30%' : '25%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={{ textAlign:'left',  padding:'6px 0 4px', borderBottom:'2px solid #ddd', fontSize:10, color:'#888' }}>Concepto</th>
                        {!modoReporte && <th style={{ textAlign:'right', padding:'6px 0 4px', borderBottom:'2px solid #ddd', fontSize:10, color:'#1d4ed8' }}>USD (total)</th>}
                        <th style={{ textAlign:'right', padding:'6px 0 4px', borderBottom:'2px solid #ddd', fontSize:10, color:'#b45309' }}>Bs. (total)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <RRow label="Total asignaciones"             priVal={pitems.reduce((a,i)=>a+Number(i.total_asignaciones||0),0)} />
                      <RRow label="Total retenciones + deducciones" priVal={pitems.reduce((a,i)=>a+Number(i.total_deducciones||0),0)} red />
                      <RRow label="NETO A COBRAR"                  priVal={pitems.reduce((a,i)=>a+Number(i.neto_pagar||0),0)} bold />
                      {/* Separador aportes */}
                      <tr><td colSpan={3} style={{ padding:'8px 0 2px', fontWeight:700, fontSize:10, textTransform:'uppercase', letterSpacing:1, color:'#555', borderBottom:'1px solid #ddd', borderTop:'6px solid transparent' }}>Aportes patronales (informativo)</td></tr>
                      <RRow label="S.S.O. (IVSS) patronal (9%)"      priVal={sumIVSSp}  gray />
                      <RRow label="P.I.E. (RPE) patronal (2%)"        priVal={sumRPEp}   gray />
                      <RRow label="F.A.O.V. (BANAVIH) patronal (2%)"  priVal={sumFAOVp}  gray />
                      <RRow label="Provisión INCES patronal (2%)"      priVal={sumINCESp} gray />
                      <RRow label="TOTAL APORTES PATRONALES"           priVal={sumPatTot} bold gray />
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          <div style={{ marginTop: 12, fontSize: 11, color: '#666' }}>
            {modoReporte
              ? <>Reporte generado el {dayjs().format('DD/MM/YYYY HH:mm')} — Nómina en estado {pnom.estado}.</>
              : <>Pre-nómina generada el {dayjs().format('DD/MM/YYYY HH:mm')} — Estado BORRADOR, sujeta a cambios antes del cierre.</>
            }
            {pusuario && <span> — Procesado por: <strong>{pusuario}</strong></span>}
          </div>
        </div>
      </div>
    );
  }

  // ── REPORTE DE PARAFISCALES ──────────────────────────────────
  if (showReporteParafiscales && prenominaData) {
    const { nomina: pnom, empresa: pemp, items: pitems } = prenominaData;
    const ptasa = Number(pnom.tasa_bcv || 1);
    const pIsBS = monedaNomina === 'BS';
    const toBS  = v => pIsBS ? Number(v||0) : Number(v||0) * ptasa;
    const fBs   = v => `Bs. ${toBS(v).toFixed(2)}`;
    const sumP  = key => pitems.reduce((a,i) => a + toBS(i[key]||0), 0);
    const cicloLabel = (() => {
      const t = pnom.tipo;
      if (t==='MENSUAL')     return 'Mensual';
      if (t==='QUINCENAL_1') return '1ra quincena';
      if (t==='QUINCENAL_2') return '2da quincena';
      return t.replace('SEMANAL_','Semana ');
    })();

    // Totales por concepto para Resumen General
    const totSSO  = sumP('ivss_trabajador')  + sumP('ivss_patronal');
    const totPIE  = sumP('rpe_trabajador')   + sumP('rpe_patronal');
    const totFAOV = sumP('faov_trabajador')  + sumP('faov_patronal');
    const totGral = totSSO + totPIE + totFAOV;

    const handlePrint = () => {
      const content = document.getElementById('reporte-parafiscales-content').innerHTML;
      const w = window.open('', '_blank', 'width=1200,height=800');
      w.document.write(`<html><head><title>Reporte Parafiscales ${pnom.periodo}</title>
        <style>
          body{font-family:Arial,sans-serif;font-size:9px;color:#000;margin:10px}
          h2{font-size:13px;margin:0 0 2px;text-align:center;font-weight:700}
          .titulo{text-align:center;font-weight:700;font-size:11px;margin:0 0 6px;letter-spacing:0.5px}
          .meta{display:flex;gap:16px;margin-bottom:8px;font-size:9px;flex-wrap:wrap;justify-content:center}
          table{width:100%;border-collapse:collapse;margin-top:6px}
          th,td{border:1px solid #bbb;padding:3px 5px}
          th{background:#e8e8e8;font-weight:700;text-align:center;font-size:8px}
          td{font-size:8px} .r{text-align:right} .l{text-align:left}
          tfoot td{font-weight:700;background:#f5f5f5}
          .resumen{margin-top:14px;border:2px solid #333;border-radius:4px;overflow:hidden}
          .resumen-header{background:#111;color:#fff;padding:5px 10px;font-weight:700;font-size:10px}
          .resumen table{margin-top:0}
          .resumen th{font-size:9px} .resumen td{font-size:9px}
          .footer{margin-top:8px;font-size:8px;color:#666}
          @page{size:landscape;margin:0.8cm}
          @media print{button{display:none}}
        </style></head><body>${content}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 400);
    };

    return (
      <div style={{ background:'#fff', minHeight:'100%', padding:16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize:18, fontWeight:700, color:'#111' }}>Reporte de Parafiscales</span>
            <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft:8 }}>{pnom.estado}</span>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handlePrint}>Imprimir / Guardar PDF</button>
            <button className="btn btn-secondary" onClick={() => setShowReporteParafiscales(false)}>← Volver</button>
          </div>
        </div>

        <div id="reporte-parafiscales-content">
          <h2 style={{ color:'#111', textAlign:'center', marginBottom:2 }}>{pemp?.razon_social || 'Empresa'}</h2>
          <div style={{ textAlign:'center', fontWeight:700, fontSize:14, color:'#111', letterSpacing:0.5, marginBottom:10 }}>
            REPORTE DE PARAFISCALES / {pnom.periodo} — {cicloLabel}
          </div>
          <div style={{ display:'flex', gap:20, fontSize:12, color:'#555', marginBottom:12, flexWrap:'wrap', justifyContent:'center' }}>
            <span>RIF: <strong style={{ color:'#111' }}>{pemp?.rif||'—'}</strong></span>
            <span>N° Patronal IVSS: <strong style={{ color:'#111' }}>{pemp?.numero_patronal_ivss||'—'}</strong></span>
            <span>Trabajadores: <strong style={{ color:'#111' }}>{pitems.length}</strong></span>
          </div>

          {/* TABLA PRINCIPAL */}
          <div className="table-wrapper">
            <table style={{ fontSize:11 }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ textAlign:'left', minWidth:160 }}>Nombre</th>
                  <th rowSpan={2} style={{ minWidth:90 }}>C.I.</th>
                  <th colSpan={3} style={{ background:'#fef3c7', color:'#92400e' }}>Aportes trabajador</th>
                  <th colSpan={3} style={{ background:'#fde8c8', color:'#7c3f00' }}>Aportes patronales</th>
                  <th rowSpan={2} style={{ background:'#f0fdf4', color:'#15803d', fontWeight:700, minWidth:120 }}>Total renglón</th>
                </tr>
                <tr>
                  <th style={{ background:'#fef3c7', color:'#92400e', minWidth:95 }}>S.S.O. (4%)</th>
                  <th style={{ background:'#fef3c7', color:'#92400e', minWidth:95 }}>P.I.E. (0.5%)</th>
                  <th style={{ background:'#fef3c7', color:'#92400e', minWidth:95 }}>F.A.O.V. (1%)</th>
                  <th style={{ background:'#fde8c8', color:'#7c3f00', minWidth:95 }}>S.S.O. (9%)</th>
                  <th style={{ background:'#fde8c8', color:'#7c3f00', minWidth:95 }}>P.I.E. (2%)</th>
                  <th style={{ background:'#fde8c8', color:'#7c3f00', minWidth:95 }}>F.A.O.V. (2%)</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let lastDepto = null;
                  return pitems.flatMap(i => {
                    const rows = [];
                    const depto = i.departamento || '(Sin departamento)';
                    if (depto !== lastDepto) {
                      lastDepto = depto;
                      rows.push(
                        <tr key={`dept-${depto}`}>
                          <td colSpan={9} style={{ background:'#e8f4ff', color:'#1d4ed8', fontWeight:700, fontSize:10, padding:'5px 8px', letterSpacing:1, textTransform:'uppercase' }}>
                            Departamento: {depto}
                          </td>
                        </tr>
                      );
                    }
                    const totalRenglon = toBS(i.ivss_trabajador) + toBS(i.rpe_trabajador) + toBS(i.faov_trabajador)
                      + toBS(i.ivss_patronal) + toBS(i.rpe_patronal) + toBS(i.faov_patronal);
                    rows.push(
                      <tr key={i.id}>
                        <td style={{ fontWeight:600 }}>{i.empleado_nombre}</td>
                        <td style={{ textAlign:'center', color:'#555' }}>{i.letra_ci||'V'}-{i.cedula}</td>
                        <td style={{ textAlign:'right', color:'#92400e' }}>{fBs(i.ivss_trabajador)}</td>
                        <td style={{ textAlign:'right', color:'#92400e' }}>{fBs(i.rpe_trabajador)}</td>
                        <td style={{ textAlign:'right', color:'#92400e' }}>{fBs(i.faov_trabajador)}</td>
                        <td style={{ textAlign:'right', color:'#7c3f00' }}>{fBs(i.ivss_patronal)}</td>
                        <td style={{ textAlign:'right', color:'#7c3f00' }}>{fBs(i.rpe_patronal)}</td>
                        <td style={{ textAlign:'right', color:'#7c3f00' }}>{fBs(i.faov_patronal)}</td>
                        <td style={{ textAlign:'right', fontWeight:700, color:'#15803d' }}>Bs. {totalRenglon.toFixed(2)}</td>
                      </tr>
                    );
                    return rows;
                  });
                })()}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ fontWeight:700 }}>TOTALES ({pitems.length} trabajadores)</td>
                  <td style={{ textAlign:'right', fontWeight:700, color:'#92400e' }}>Bs. {sumP('ivss_trabajador').toFixed(2)}</td>
                  <td style={{ textAlign:'right', fontWeight:700, color:'#92400e' }}>Bs. {sumP('rpe_trabajador').toFixed(2)}</td>
                  <td style={{ textAlign:'right', fontWeight:700, color:'#92400e' }}>Bs. {sumP('faov_trabajador').toFixed(2)}</td>
                  <td style={{ textAlign:'right', fontWeight:700, color:'#7c3f00' }}>Bs. {sumP('ivss_patronal').toFixed(2)}</td>
                  <td style={{ textAlign:'right', fontWeight:700, color:'#7c3f00' }}>Bs. {sumP('rpe_patronal').toFixed(2)}</td>
                  <td style={{ textAlign:'right', fontWeight:700, color:'#7c3f00' }}>Bs. {sumP('faov_patronal').toFixed(2)}</td>
                  <td style={{ textAlign:'right', fontWeight:700, color:'#15803d', fontSize:13 }}>
                    Bs. {(sumP('ivss_trabajador')+sumP('rpe_trabajador')+sumP('faov_trabajador')+sumP('ivss_patronal')+sumP('rpe_patronal')+sumP('faov_patronal')).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* RESUMEN GENERAL */}
          <div style={{ border:'2px solid #333', borderRadius:8, overflow:'hidden', marginTop:20 }}>
            <div style={{ background:'#111', color:'#fff', padding:'8px 16px', fontWeight:700, fontSize:13 }}>
              Resumen General — Total por concepto
            </div>
            <div style={{ padding:'0 16px 16px' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginTop:8 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign:'left', padding:'6px 0 4px', borderBottom:'2px solid #ddd', fontSize:11, color:'#555' }}>Concepto</th>
                    <th style={{ textAlign:'right', padding:'6px 0 4px', borderBottom:'2px solid #ddd', fontSize:11, color:'#92400e' }}>Trabajador</th>
                    <th style={{ textAlign:'right', padding:'6px 0 4px', borderBottom:'2px solid #ddd', fontSize:11, color:'#7c3f00' }}>Patronal</th>
                    <th style={{ textAlign:'right', padding:'6px 0 4px', borderBottom:'2px solid #ddd', fontSize:11, color:'#111', fontWeight:700 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label:'S.S.O. (IVSS)', trab: sumP('ivss_trabajador'), pat: sumP('ivss_patronal') },
                    { label:'P.I.E. (RPE)',  trab: sumP('rpe_trabajador'),  pat: sumP('rpe_patronal')  },
                    { label:'F.A.O.V. (BANAVIH)', trab: sumP('faov_trabajador'), pat: sumP('faov_patronal') },
                  ].map(({ label, trab, pat }) => (
                    <tr key={label} style={{ borderBottom:'1px solid #eee' }}>
                      <td style={{ padding:'6px 0', fontWeight:500 }}>{label}</td>
                      <td style={{ textAlign:'right', padding:'6px 0', color:'#92400e' }}>Bs. {trab.toFixed(2)}</td>
                      <td style={{ textAlign:'right', padding:'6px 0', color:'#7c3f00' }}>Bs. {pat.toFixed(2)}</td>
                      <td style={{ textAlign:'right', padding:'6px 0', fontWeight:700, color:'#111' }}>Bs. {(trab+pat).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr style={{ background:'#f0fdf4' }}>
                    <td style={{ padding:'8px 0', fontWeight:700, fontSize:13, color:'#15803d' }}>TOTAL PARAFISCALES</td>
                    <td style={{ textAlign:'right', padding:'8px 0', fontWeight:700, color:'#92400e' }}>
                      Bs. {(sumP('ivss_trabajador')+sumP('rpe_trabajador')+sumP('faov_trabajador')).toFixed(2)}
                    </td>
                    <td style={{ textAlign:'right', padding:'8px 0', fontWeight:700, color:'#7c3f00' }}>
                      Bs. {(sumP('ivss_patronal')+sumP('rpe_patronal')+sumP('faov_patronal')).toFixed(2)}
                    </td>
                    <td style={{ textAlign:'right', padding:'8px 0', fontWeight:700, fontSize:14, color:'#15803d' }}>
                      Bs. {totGral.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop:10, fontSize:11, color:'#666' }}>
            Generado el {dayjs().format('DD/MM/YYYY HH:mm')}. Montos en Bs.
          </div>
        </div>
      </div>
    );
  }

  // ── REPORTE DE PROVISIONES PATRONALES ───────────────────────
  if (showReporteProvisiones && prenominaData) {
    const { nomina: pnom, empresa: pemp, items: pitems } = prenominaData;
    const ptasa = Number(pnom.tasa_bcv || 1);
    const pIsBS = monedaNomina === 'BS';
    const toBS  = v => pIsBS ? Number(v||0) : Number(v||0) * ptasa;
    const cicloLabel = (() => {
      const t = pnom.tipo;
      if (t==='MENSUAL')     return 'Mensual';
      if (t==='QUINCENAL_1') return '1ra quincena';
      if (t==='QUINCENAL_2') return '2da quincena';
      return t.replace('SEMANAL_','Semana ');
    })();
    const ciclosAnuales = pnom.tipo?.startsWith('SEMANAL') ? 52 : pnom.tipo?.startsWith('QUINCENAL') ? 24 : 12;
    const diasUtil = Number(configNomina.dias_utilidades || 30);
    const fracDias = diasUtil / ciclosAnuales;
    const totalFrac = pitems.reduce((a, i) => a + (toBS(i.salario_base) / 30 * fracDias), 0);

    const handlePrint = () => {
      const content = document.getElementById('reporte-provisiones-content').innerHTML;
      const w = window.open('', '_blank', 'width=700,height=800');
      w.document.write(`<html><head><title>Reporte Provisiones ${pnom.periodo}</title>
        <style>
          body{font-family:Arial,sans-serif;font-size:10px;color:#000;margin:14px}
          h2{font-size:14px;margin:0 0 2px;text-align:center;font-weight:700}
          .titulo{text-align:center;font-weight:700;font-size:12px;margin:0 0 8px;letter-spacing:0.5px}
          .meta{display:flex;gap:16px;margin-bottom:10px;font-size:10px;flex-wrap:wrap;justify-content:center}
          table{width:100%;border-collapse:collapse;margin-top:8px}
          th,td{border:1px solid #bbb;padding:4px 8px}
          th{background:#e8e8e8;font-weight:700;font-size:10px}
          tfoot td{font-weight:700;background:#f0fdf4;color:#15803d}
          .footer{margin-top:10px;font-size:9px;color:#666}
          @page{size:A4 portrait;margin:1.5cm}
        </style></head><body>${content}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 400);
    };

    return (
      <div style={{ background:'#fff', minHeight:'100%', padding:16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize:18, fontWeight:700, color:'#111' }}>Reporte de Provisiones Patronales</span>
            <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft:8 }}>{pnom.estado}</span>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handlePrint}>Imprimir / Guardar PDF</button>
            <button className="btn btn-secondary" onClick={() => setShowReporteProvisiones(false)}>← Volver</button>
          </div>
        </div>

        <div id="reporte-provisiones-content">
          <h2 style={{ color:'#111', textAlign:'center', marginBottom:2 }}>{pemp?.razon_social || 'Empresa'}</h2>
          <div style={{ textAlign:'center', fontWeight:700, fontSize:14, color:'#111', letterSpacing:0.5, marginBottom:10 }}>
            REPORTE DE PROVISIONES PATRONALES / {pnom.periodo} — {cicloLabel}
          </div>
          <div style={{ display:'flex', gap:16, fontSize:12, color:'#555', marginBottom:12, flexWrap:'wrap', justifyContent:'center' }}>
            <span>RIF: <strong style={{ color:'#111' }}>{pemp?.rif||'—'}</strong></span>
            <span>Trabajadores: <strong style={{ color:'#111' }}>{pitems.length}</strong></span>
            <span>Días de utilidades: <strong style={{ color:'#111' }}>{diasUtil}</strong></span>
            <span>Fracción período: <strong style={{ color:'#111' }}>{fracDias.toFixed(4)} días</strong></span>
          </div>

          <table style={{ fontSize:12, width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign:'left', padding:'8px 10px', background:'#f5f5f5', borderBottom:'2px solid #ddd' }}>Nombre trabajador</th>
                <th style={{ textAlign:'center', padding:'8px 10px', background:'#f5f5f5', borderBottom:'2px solid #ddd', minWidth:110 }}>C.I.</th>
                <th style={{ textAlign:'right', padding:'8px 10px', background:'#f0fdf4', color:'#15803d', borderBottom:'2px solid #ddd', minWidth:200, fontWeight:700 }}>
                  Fracción de provisión de utilidades del período (Bs.)
                </th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let lastDepto = null;
                return pitems.flatMap(i => {
                  const rows = [];
                  const depto = i.departamento || '(Sin departamento)';
                  if (depto !== lastDepto) {
                    lastDepto = depto;
                    rows.push(
                      <tr key={`dept-${depto}`}>
                        <td colSpan={3} style={{ background:'#e8f4ff', color:'#1d4ed8', fontWeight:700, fontSize:11, padding:'5px 10px', letterSpacing:1, textTransform:'uppercase' }}>
                          Departamento: {depto}
                        </td>
                      </tr>
                    );
                  }
                  const provUtil = toBS(i.salario_base) / 30 * fracDias;
                  rows.push(
                    <tr key={i.id} style={{ borderBottom:'1px solid #eee' }}>
                      <td style={{ padding:'7px 10px', fontWeight:500 }}>{i.empleado_nombre}</td>
                      <td style={{ padding:'7px 10px', textAlign:'center', color:'#555' }}>{i.letra_ci||'V'}-{i.cedula}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', color:'#15803d', fontWeight:600 }}>Bs. {provUtil.toFixed(2)}</td>
                    </tr>
                  );
                  return rows;
                });
              })()}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ padding:'8px 10px', fontWeight:700, background:'#f0fdf4', color:'#15803d' }}>
                  TOTAL ({pitems.length} trabajadores)
                </td>
                <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, background:'#f0fdf4', color:'#15803d', fontSize:14 }}>
                  Bs. {totalFrac.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
          <div style={{ marginTop:10, fontSize:11, color:'#666' }}>
            Fórmula: (Salario mensual Bs. ÷ 30) × ({diasUtil} días ÷ {ciclosAnuales} ciclos/año) = {fracDias.toFixed(4)} días por período.
            Generado el {dayjs().format('DD/MM/YYYY HH:mm')}.
          </div>
        </div>
      </div>
    );
  }

  // ── ARCHIVO .TXT PARA PAGO ───────────────────────────────────
  if (showTxtPago && prenominaData) {
    const { nomina: pnom, empresa: pemp, items: pitems } = prenominaData;
    const ptasa = Number(pnom.tasa_bcv || 1);
    const pIsBS = monedaNomina === 'BS';
    const toBS  = v => pIsBS ? Number(v||0) : Number(v||0) * ptasa;
    const totalBs = pitems.reduce((a, i) => a + toBS(i.neto_pagar), 0);
    const bancoOk = !!configNomina.banco_pagador && !!configNomina.cuenta_origen;
    const formatoLabel = {
      TAB: 'Texto delimitado por tabulación',
      CSV_COMA: 'CSV — separado por coma',
      CSV_PUNTOCOMA: 'CSV — separado por punto y coma',
      ANCHO_FIJO: 'Ancho fijo (columnas alineadas)',
    }[configNomina.formato_txt || 'TAB'];

    const dato = (label, val) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee' }}>
        <span style={{ color: '#666' }}>{label}</span>
        <strong style={{ color: '#111' }}>{val}</strong>
      </div>
    );

    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>Archivo .TXT para pago de nómina</span>
            <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft: 8 }}>{pnom.estado}</span>
          </div>
          <button className="btn btn-secondary" onClick={() => setShowTxtPago(false)}>← Volver</button>
        </div>

        <div style={{ maxWidth: 640 }}>
          <div className="card mb-4">
            <div className="card-header"><div className="card-title">Parámetros del pago</div></div>
            <div className="card-body">
              {dato('Empresa', pemp?.razon_social || '—')}
              {dato('Período', `${pnom.periodo} — ${pnom.tipo}`)}
              {dato('Trabajadores', pitems.length)}
              {dato('Total a pagar', `Bs. ${totalBs.toFixed(2)}`)}
              {dato('Banco pagador', configNomina.banco_pagador || 'No configurado')}
              {dato('Cuenta origen', configNomina.cuenta_origen
                ? `${configNomina.tipo_cuenta_origen || 'CORRIENTE'} · ${configNomina.cuenta_origen}`
                : 'No configurada')}
              {dato('Concepto', configNomina.concepto_pago || 'PAGO DE NOMINA')}
              {dato('Formato del archivo', formatoLabel)}

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Fecha de ejecución del pago *</label>
                <input className="form-control" type="date" value={txtFechaPago}
                  onChange={e => setTxtFechaPago(e.target.value)} style={{ maxWidth: 220 }} />
                <div className="text-sm text-gris" style={{ marginTop: 4 }}>
                  Fecha en que el banco debitará la cuenta origen
                </div>
              </div>

              {!bancoOk && (
                <div className="alert alert-warning" style={{ fontSize: 12, marginTop: 8 }}>
                  Faltan datos del banco pagador o la cuenta origen. Complételos en{' '}
                  <strong>Remuneraciones → Configuración → Parámetros bancarios</strong> para
                  que el archivo incluya la información del débito.
                </div>
              )}

              <div style={{ marginTop: 18 }}>
                <button className="btn btn-primary" onClick={handleGenerarTXT} disabled={!txtFechaPago}>
                  Generar archivo .TXT
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── DETALLE DE NÓMINA ────────────────────────────────────────
  if (selected) {
    const roStyle  = { background: '#1a1a1a', color: '#ccc' };
    const autoLunes = calcLunesPeriodo(selected.periodo, selected.tipo);

    const fi = (key, label, step = '0.01') => (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <input className="form-control" type="number" min="0" step={step}
          value={formItem[key] ?? ''} onChange={e => setFormItem({ ...formItem, [key]: e.target.value })} />
      </div>
    );
    const ro = (label, val, red = false) => (
      <div className="form-group">
        <label className="form-label" style={{ color: red ? '#CC0000' : undefined }}>{label}</label>
        <input className="form-control" readOnly value={val} style={roStyle} />
      </div>
    );

    return (
      <div>
        <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>← Volver</button>
            <span style={{ marginLeft: 12, fontWeight: 700, fontSize: 16 }}>
              Nómina {selected.periodo} — {selected.tipo}
            </span>
            <span className="badge badge-azul" style={{ marginLeft: 6 }}>{selected.subtipo || 'SALARIOS'}</span>
            <span className={`badge ${estadoNomBadge[selected.estado]}`} style={{ marginLeft: 6 }}>
              {selected.estado}
            </span>
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {selected.estado === 'BORRADOR' && (
              <>
                <button className="btn btn-secondary" onClick={handleProcesar} disabled={procesando}>
                  {procesando ? 'Procesando...' : 'Calcular automático'}
                </button>
                {items.length > 0 && (
                  <button className="btn btn-secondary" onClick={handleVerPreNomina}>
                    Ver Pre-nómina
                  </button>
                )}
                <button className="btn btn-primary" onClick={handleCerrar}>Cerrar nómina</button>
              </>
            )}
            {selected.estado !== 'BORRADOR' && (
              <>
                <button className="btn btn-secondary" onClick={handleVerResumen}>
                  Resumen de nómina de salarios
                </button>
                <button className="btn btn-secondary" onClick={handleVerReporteNomina}>
                  Reporte de nómina de salarios
                </button>
                <button className="btn btn-secondary" onClick={handleVerReporteParafiscales}>
                  Reporte de parafiscales
                </button>
                <button className="btn btn-secondary" onClick={handleVerReporteProvisiones}>
                  Reporte de provisiones patronales
                </button>
                <button className="btn btn-secondary" onClick={handleAbrirTxtPago}>
                  Archivo .TXT para pago
                </button>
                <button className="btn btn-secondary" onClick={handleVerRecibos}>
                  Recibos de pago de nómina de salarios
                </button>
              </>
            )}
          </div>
        </div>

        {/* KPIs */}
        {resumen?.totales && (() => {
          const t = resumen.totales;
          const parafiscalesUSD = Number(t.total_ivss_t||0) + Number(t.total_ivss_p||0)
            + Number(t.total_rpe_t||0) + Number(t.total_rpe_p||0)
            + Number(t.total_faov_t||0) + Number(t.total_faov_p||0);
          const totalEmpresaUSD = Number(t.total_neto||0) + parafiscalesUSD;
          return (
            <div className="kpi-grid mb-4">
              <div className="kpi-card azul">
                <div className="kpi-label">Trabajadores</div>
                <div className="kpi-value">{t.total_empleados || 0}</div>
              </div>
              <div className="kpi-card verde">
                <div className="kpi-label">Total neto a pagar a trabajadores</div>
                <div className="kpi-value">{isBS ? `Bs. ${Number(t.total_neto||0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : fmt(t.total_neto)}</div>
                <div className="kpi-sub">{isBS ? `$ ${(Number(t.total_neto||0) / tasa).toFixed(2)}` : `Bs. ${(Number(t.total_neto||0) * tasa).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`}</div>
              </div>
              <div className="kpi-card rojo">
                <div className="kpi-label">Parafiscales</div>
                <div className="kpi-value">{isBS ? `Bs. ${parafiscalesUSD.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : fmt(parafiscalesUSD)}</div>
                <div className="kpi-sub">{isBS ? `$ ${(parafiscalesUSD / tasa).toFixed(2)}` : `Bs. ${(parafiscalesUSD * tasa).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`}</div>
              </div>
              <div className="kpi-card naranja">
                <div className="kpi-label">Total a pagar</div>
                <div className="kpi-value">{isBS ? `Bs. ${totalEmpresaUSD.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : fmt(totalEmpresaUSD)}</div>
                <div className="kpi-sub">{isBS ? `$ ${(totalEmpresaUSD / tasa).toFixed(2)}` : `Bs. ${(totalEmpresaUSD * tasa).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`}</div>
              </div>
            </div>
          );
        })()}

        {/* Tabla items */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Detalle por trabajador</div>
            <div className="text-sm text-gris">Tasa BCV: Bs. {Number(tasa).toFixed(2)} | Moneda primaria: <strong style={{ color: isBS ? '#f59e0b' : '#60a5fa' }}>{isBS ? 'Bolívares (Bs.)' : 'Dólares (USD)'}</strong> — los cálculos se realizan en {priCur} y se convierten automáticamente a {secCur}</div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Trabajador</th><th>Cédula</th>
                  <th style={{ textAlign: 'right' }}>Salario base (Bs.)</th>
                  <th style={{ textAlign: 'right', color: '#60a5fa' }}>Total asignaciones (Bs.)</th>
                  <th style={{ textAlign: 'right', color: '#f87171' }}>Total deducciones (Bs.)</th>
                  <th style={{ textAlign: 'right', color: '#4ade80' }}>Neto a cobrar (Bs.)</th>
                  {selected.estado === 'BORRADOR' && <th>Ajustar nómina de trabajador</th>}
                  {selected.estado === 'BORRADOR' && <th>Vacaciones</th>}
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} style={i.suspendido_vacaciones ? { opacity: 0.6 } : {}}>
                    <td className="fw-600">
                      {i.empleado_nombre}
                      {i.suspendido_vacaciones ? (
                        <span style={{ marginLeft: 8, fontSize: 10, background: '#78350f', color: '#fbbf24', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                          Suspensión por vacaciones
                        </span>
                      ) : null}
                    </td>
                    <td className="text-gris text-sm">{i.cedula}</td>
                    <td style={{ textAlign: 'right' }}>{fmtBS(i.salario_base)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#60a5fa' }}>{fmtBS(i.total_asignaciones)}</td>
                    <td style={{ textAlign: 'right', color: '#f87171' }}>{fmtBS(i.total_deducciones)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#4ade80' }}>{fmtBS(i.neto_pagar)}</td>
                    {selected.estado === 'BORRADOR' && (
                      <td>
                        {i.suspendido_vacaciones ? (
                          <span style={{ fontSize: 12, color: '#aaa' }}>—</span>
                        ) : (
                          <button className="btn btn-secondary btn-sm" onClick={() => handleEditItem(i)}>
                            Ajustar nómina de trabajador
                          </button>
                        )}
                      </td>
                    )}
                    {selected.estado === 'BORRADOR' && (
                      <td>
                        {i.suspendido_vacaciones ? (
                          <span style={{ fontSize: 12, color: '#fbbf24' }}>Suspendido</span>
                        ) : (
                          <button className="btn btn-sm" style={{ background: '#78350f', color: '#fbbf24', border: 'none' }}
                            onClick={() => setSuspendTarget(i)}>
                            Suspender
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={8} className="text-gris text-sm" style={{ textAlign: 'center', padding: 24 }}>
                    Sin datos. Usa "Calcular automático" para procesar la nómina.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal confirmación suspensión por vacaciones */}
        {suspendTarget && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <div className="modal-title">Suspender por vacaciones</div>
                <button className="modal-close" onClick={() => setSuspendTarget(null)}>×</button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: 8 }}>
                  ¿Desea suspender al trabajador <strong>{suspendTarget.empleado_nombre}</strong> de la nómina por concepto de vacaciones?
                </p>
                <p style={{ fontSize: 13, color: '#aaa', marginBottom: 0 }}>
                  Sus montos quedarán en cero y no podrá ajustarse durante la suspensión. Seguirá activo en la nómina de Cesta Ticket. (LOTTT Cap. IX, art. 189–203)
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setSuspendTarget(null)}>Cancelar</button>
                <button className="btn btn-primary" style={{ background: '#78350f', borderColor: '#78350f' }}
                  onClick={handleConfirmSuspender}>Sí, suspender</button>
              </div>
            </div>
          </div>
        )}

        {/* Vista de ajuste — página completa */}
        {editItem && (
          <div style={{ position: 'fixed', left: 'var(--sidebar-w)', top: 'var(--header-h)', right: 0, bottom: 0, background: 'var(--gris-claro)', zIndex: 500, overflowY: 'auto', padding: 24 }}>
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
              <div className="flex items-center justify-between mb-4">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditItem(null)}>← Volver</button>
                <span style={{ fontWeight: 700, fontSize: 16 }}>Ajustar nómina: {editItem.empleado_nombre}</span>
                <div />
              </div>
              <div className="card"><div className="card-body">

                {/* Info base */}
                <div style={{ background: '#1a1a1a', borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 13, color: '#ccc' }}>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <span><strong>Salario base:</strong> {monSimbolo} {Number(editItem.salario_base || 0).toFixed(2)}</span>
                    <span><strong>Salario diario:</strong> {monSimbolo} {(Number(editItem.salario_base || 0) / 30).toFixed(4)}</span>
                    <span><strong>Salario/hora:</strong> {monSimbolo} {(Number(editItem.salario_base || 0) / 30 / 8).toFixed(4)}</span>
                    <span><strong>Tasa BCV:</strong> Bs. {Number(tasa).toFixed(2)}</span>
                  </div>
                  <div className="text-sm" style={{ marginTop: 4, color: '#aaa' }}>
                    Moneda primaria: <strong>{priCur}</strong> — los campos de entrada usan {priCur}, los campos auto muestran {secCur}.
                    Salario diario = salario mensual ÷ 30 · Salario/hora = salario diario ÷ 8 (LOTTT)
                  </div>
                </div>

                {/* ── SECCIÓN 1: ASIGNACIONES ── */}
                <div style={{ borderBottom: '2px solid #2563eb', marginBottom: 16, paddingBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 1 }}>Asignaciones</div>
                </div>

                {/* 1. Días hábiles */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Días del período</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 8 }}>
                  {fi('dias_habiles', 'Días hábiles', '1')}
                  {ro('Días hábiles en USD (auto)', `$ ${Number(computed.dias_habiles_usd || 0).toFixed(4)}`)}
                  {ro('Días hábiles en Bs. (auto)', `Bs. ${Number(computed.dias_habiles_bs || 0).toFixed(2)}`)}
                </div>

                {/* 2. Días de descanso */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {fi('dias_descanso', 'Días de descanso', '1')}
                  {ro('Días de descanso en USD (auto)', `$ ${Number(computed.dias_descanso_usd || 0).toFixed(4)}`)}
                  {ro('Días de descanso en Bs. (auto)', `Bs. ${Number(computed.dias_descanso_bs || 0).toFixed(2)}`)}
                </div>

                {/* 3. Días adicionales */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Días adicionales a pagar</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {fi('dias_adicionales_cantidad', 'Cantidad de días')}
                  {ro('Días adicionales en USD (auto)', `$ ${Number(computed.dias_adicionales_usd || 0).toFixed(4)}`)}
                  {ro('Días adicionales en Bs. (auto)', `Bs. ${Number(computed.dias_adicionales_bs || 0).toFixed(2)}`)}
                </div>

                {/* 4. Bono nocturno */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                    Bono nocturno (salario diario × 1.30)
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <button
                      className={`btn btn-sm ${formItem.bono_nocturno_tipo === 'completo' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setFormItem(f => ({ ...f, bono_nocturno_tipo: f.bono_nocturno_tipo === 'completo' ? '' : 'completo' }))}
                    >Período completo</button>
                    <button
                      className={`btn btn-sm ${formItem.bono_nocturno_tipo === 'personalizado' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setFormItem(f => ({ ...f, bono_nocturno_tipo: f.bono_nocturno_tipo === 'personalizado' ? '' : 'personalizado', bono_nocturno_dias: 0 }))}
                    >Personalizado</button>
                  </div>
                  {formItem.bono_nocturno_tipo === 'completo' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {ro('Bono nocturno en USD (auto)', `$ ${Number(computed.bono_nocturno_usd || 0).toFixed(4)}`)}
                      {ro('Bono nocturno en Bs. (auto)', `Bs. ${Number(computed.bono_nocturno_bs || 0).toFixed(2)}`)}
                    </div>
                  )}
                  {formItem.bono_nocturno_tipo === 'personalizado' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      {fi('bono_nocturno_dias', 'Cantidad de días', '1')}
                      {ro('Bono nocturno en USD (auto)', `$ ${Number(computed.bono_nocturno_usd || 0).toFixed(4)}`)}
                      {ro('Bono nocturno en Bs. (auto)', `Bs. ${Number(computed.bono_nocturno_bs || 0).toFixed(2)}`)}
                    </div>
                  )}
                </div>

                {/* 5. Horas extra diurnas */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Horas extra diurnas (recargo 50%)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {fi('he_diurnas_cantidad', 'Cantidad de horas')}
                  {ro('Monto en USD (auto)', `$ ${Number(computed.he_diurnas_usd || 0).toFixed(4)}`)}
                  {ro('Monto en Bs. (auto)', `Bs. ${Number(computed.he_diurnas_bs || 0).toFixed(2)}`)}
                </div>

                {/* 6. Horas extra nocturnas */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Horas extra nocturnas (hora × 1.30 × 1.50)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {fi('he_nocturnas_cantidad', 'Cantidad de horas')}
                  {ro('Monto en USD (auto)', `$ ${Number(computed.he_nocturnas_usd || 0).toFixed(4)}`)}
                  {ro('Monto en Bs. (auto)', `Bs. ${Number(computed.he_nocturnas_bs || 0).toFixed(2)}`)}
                </div>

                {/* 7. Domingos y feriados */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Domingos y feriados (50% recargo sobre salario diario)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {fi('dias_feriados_cantidad', 'Domingos y feriados (cant.)', '1')}
                  {ro('Domingos y feriados en USD (auto)', `$ ${Number(computed.dias_feriados_usd || 0).toFixed(4)}`)}
                  {ro('Domingos y feriados en Bs. (auto)', `Bs. ${Number(computed.dias_feriados_bs || 0).toFixed(2)}`)}
                </div>

                {/* 8. Reposo convalidado */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Pago por días de reposo convalidado (33.33% del salario diario)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {fi('reposo_convalidado_cantidad', 'Cantidad de días')}
                  {ro('Reposo convalidado en USD (auto)', `$ ${Number(computed.reposo_convalidado_usd || 0).toFixed(4)}`)}
                  {ro('Reposo convalidado en Bs. (auto)', `Bs. ${Number(computed.reposo_convalidado_bs || 0).toFixed(2)}`)}
                </div>

                {/* ── SUBTOTAL ASIGNACIONES ── */}
                <div style={{ background: '#0f2040', border: '1px solid #2563eb', borderRadius: 6, padding: 12, marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Total asignaciones</div>
                  <div className="form-grid form-grid-2">
                    {ro('Total asignaciones en USD', `$ ${Number(computed.total_asignaciones_usd || 0).toFixed(2)}`)}
                    {ro('Total asignaciones en Bs.', `Bs. ${Number(computed.total_asignaciones_bs || 0).toFixed(2)}`)}
                  </div>
                </div>

                {/* ── SECCIÓN 3: RETENCIONES ── */}
                <div style={{ borderBottom: '2px solid #2563eb', marginBottom: 16, paddingBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 1 }}>Retenciones</div>
                </div>

                {/* Cant. de Lunes del Período — base de cálculo IVSS/RPE */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    Cant. de Lunes del Período (base IVSS/RPE)
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, padding: '6px 16px', fontFamily: 'monospace', fontSize: 18, color: '#ccc', minWidth: 48, textAlign: 'center', fontWeight: 700 }}>
                      {Number(formItem.lunes_periodo) || autoLunes}
                    </div>
                    <button
                      className={`btn btn-sm ${formItem.lunes_modo !== 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setFormItem(f => ({ ...f, lunes_modo: 'auto', lunes_periodo: autoLunes }))}
                    >Auto ({autoLunes} lunes)</button>
                    <button
                      className={`btn btn-sm ${formItem.lunes_modo === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setFormItem(f => ({ ...f, lunes_modo: 'manual' }))}
                    >Personalizar</button>
                  </div>
                  {formItem.lunes_modo === 'manual' && (
                    <input className="form-control" type="number" min="1" max="6" step="1"
                      style={{ maxWidth: 120, marginBottom: 8 }}
                      value={formItem.lunes_periodo}
                      onChange={e => setFormItem(f => ({ ...f, lunes_periodo: e.target.value }))} />
                  )}
                  <div className="text-sm text-gris">
                    Base IVSS/RPE = (sal.mensual × 12 / 52) × lunes. Tope IVSS: sal.mín. × 5 · Tope RPE: sal.mín. × 10
                  </div>
                </div>

                {/* S.S.O. (IVSS) trabajador 4% */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>S.S.O. (IVSS) trabajador (4% sobre base con tope)</div>
                <div className="form-grid form-grid-2" style={{ marginBottom: 16 }}>
                  {ro('S.S.O. (IVSS) trabajador (USD)', `$ ${Number(computed.ivss_trab_usd || 0).toFixed(2)}`)}
                  {ro('S.S.O. (IVSS) trabajador (Bs.)', `Bs. ${Number(computed.ivss_trab_bs || 0).toFixed(2)}`)}
                </div>

                {/* P.I.E. (RPE) trabajador 0.5% */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>P.I.E. (RPE) trabajador (0.5% sobre base con tope)</div>
                <div className="form-grid form-grid-2" style={{ marginBottom: 16 }}>
                  {ro('P.I.E. (RPE) trabajador (USD)', `$ ${Number(computed.rpe_trab_usd || 0).toFixed(2)}`)}
                  {ro('P.I.E. (RPE) trabajador (Bs.)', `Bs. ${Number(computed.rpe_trab_bs || 0).toFixed(2)}`)}
                </div>

                {/* F.A.O.V. (BANAVIH) trabajador 1% */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>F.A.O.V. (BANAVIH) trabajador (1% del salario mensual)</div>
                <div className="form-grid form-grid-2" style={{ marginBottom: 16 }}>
                  {ro('F.A.O.V. (BANAVIH) trabajador (USD)', `$ ${Number(computed.faov_trab_usd || 0).toFixed(2)}`)}
                  {ro('F.A.O.V. (BANAVIH) trabajador (Bs.)', `Bs. ${Number(computed.faov_trab_bs || 0).toFixed(2)}`)}
                </div>

                {/* ISLR — porcentaje editable → auto USD + Bs. */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>ISLR retenido</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                  {fi('islr_porcentaje', 'Porcentaje ISLR (%)')}
                  {ro('ISLR retenido (USD)', `$ ${Number(computed.islr_usd || 0).toFixed(2)}`)}
                  {ro('ISLR retenido (Bs.)', `Bs. ${Number(computed.islr_bs || 0).toFixed(2)}`)}
                </div>

                {/* ── SECCIÓN 4: DEDUCCIONES Y DESCUENTOS ── */}
                <div style={{ borderBottom: '2px solid #CC0000', marginBottom: 16, paddingBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#f87171', textTransform: 'uppercase', letterSpacing: 1 }}>Deducciones y descuentos</div>
                </div>

                {/* Descuento por minutos de retraso */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Descuento por minutos de retraso (salario diario ÷ 8 ÷ 60)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {fi('descuento_minutos_cantidad', 'Minutos a descontar')}
                  {ro('Descuento en USD (auto)', `$ ${Number(computed.descuento_minutos_usd || 0).toFixed(4)}`, true)}
                  {ro('Descuento en Bs. (auto)', `Bs. ${Number(computed.descuento_minutos_bs || 0).toFixed(2)}`, true)}
                </div>

                {/* Descuento por días de ausencia */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Descuento por días de ausencia (salario diario × días)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {fi('descuento_ausencias_cantidad', 'Días de ausencia')}
                  {ro('Descuento en USD (auto)', `$ ${Number(computed.descuento_ausencias_usd || 0).toFixed(4)}`, true)}
                  {ro('Descuento en Bs. (auto)', `Bs. ${Number(computed.descuento_ausencias_bs || 0).toFixed(2)}`, true)}
                </div>

                {/* Préstamo */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Préstamo</div>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label">Moneda del préstamo</label>
                  <select className="form-control" value={formItem.prestamo_moneda || 'USD'}
                    onChange={e => setFormItem({ ...formItem, prestamo_moneda: e.target.value })}>
                    <option value="USD">Cargar préstamo en USD</option>
                    <option value="BS">Cargar préstamo en Bs.</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#CC0000' }}>
                      Préstamo en USD{formItem.prestamo_moneda === 'BS' ? ' (auto)' : ''}
                    </label>
                    {(formItem.prestamo_moneda || 'USD') === 'USD'
                      ? <input className="form-control" type="number" min="0" step="0.01"
                          value={formItem.prestamos_deduc ?? ''}
                          onChange={e => setFormItem({ ...formItem, prestamos_deduc: e.target.value })} />
                      : <input className="form-control" readOnly
                          value={`$ ${Number(computed.prestamos_usd || 0).toFixed(2)}`}
                          style={roStyle} />}
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#CC0000' }}>
                      Préstamo en Bs.{formItem.prestamo_moneda !== 'BS' ? ' (auto)' : ''}
                    </label>
                    {formItem.prestamo_moneda === 'BS'
                      ? <input className="form-control" type="number" min="0" step="0.01"
                          value={formItem.prestamos_bs_input ?? ''}
                          onChange={e => setFormItem({ ...formItem, prestamos_bs_input: e.target.value })} />
                      : <input className="form-control" readOnly
                          value={`Bs. ${Number(computed.prestamos_bs || 0).toFixed(2)}`}
                          style={roStyle} />}
                  </div>
                </div>

                {/* Cuenta por cobrar a empleados */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Cuenta por cobrar a empleados</div>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label">Moneda de la cuenta por cobrar</label>
                  <select className="form-control" value={formItem.cxc_moneda || 'USD'}
                    onChange={e => setFormItem({ ...formItem, cxc_moneda: e.target.value })}>
                    <option value="USD">Cargar cuenta por cobrar en USD</option>
                    <option value="BS">Cargar cuenta por cobrar en Bs.</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#CC0000' }}>
                      Cuenta por cobrar en USD{formItem.cxc_moneda === 'BS' ? ' (auto)' : ''}
                    </label>
                    {(formItem.cxc_moneda || 'USD') === 'USD'
                      ? <input className="form-control" type="number" min="0" step="0.01"
                          value={formItem.otras_deducciones ?? ''}
                          onChange={e => setFormItem({ ...formItem, otras_deducciones: e.target.value })} />
                      : <input className="form-control" readOnly
                          value={`$ ${Number(computed.cxc_usd || 0).toFixed(2)}`}
                          style={roStyle} />}
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#CC0000' }}>
                      Cuenta por cobrar en Bs.{formItem.cxc_moneda !== 'BS' ? ' (auto)' : ''}
                    </label>
                    {formItem.cxc_moneda === 'BS'
                      ? <input className="form-control" type="number" min="0" step="0.01"
                          value={formItem.cxc_bs_input ?? ''}
                          onChange={e => setFormItem({ ...formItem, cxc_bs_input: e.target.value })} />
                      : <input className="form-control" readOnly
                          value={`Bs. ${Number(computed.cxc_bs || 0).toFixed(2)}`}
                          style={roStyle} />}
                  </div>
                </div>

                {/* ── SUBTOTAL DEDUCCIONES ── */}
                <div style={{ background: '#200a0a', border: '1px solid #CC0000', borderRadius: 6, padding: 12, marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#f87171', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Total deducciones</div>
                  <div className="form-grid form-grid-2">
                    {ro('Total deducciones en USD', `$ ${Number(computed.total_deducciones_usd || 0).toFixed(2)}`)}
                    {ro('Total deducciones en Bs.', `Bs. ${Number(computed.total_deducciones_bs || 0).toFixed(2)}`)}
                  </div>
                </div>

                {/* ── NETO A COBRAR ── */}
                <div style={{ background: '#0a200a', border: '2px solid #16a34a', borderRadius: 6, padding: 14, marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Neto a cobrar</div>
                  <div className="form-grid form-grid-2">
                    {ro('Neto a cobrar en USD', `$ ${Number(computed.neto_usd || 0).toFixed(2)}`)}
                    {ro('Neto a cobrar en Bs.', `Bs. ${Number(computed.neto_bs || 0).toFixed(2)}`)}
                  </div>
                </div>

                {/* ── NOTAS ── */}
                <div className="form-group" style={{ marginBottom: 20 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Notas / Observaciones
                  </label>
                  <textarea className="form-control" rows={3}
                    placeholder="Anotaciones u observaciones sobre la nómina de este trabajador..."
                    value={formItem.notas || ''}
                    onChange={e => setFormItem({ ...formItem, notas: e.target.value })}
                    style={{ resize: 'vertical' }} />
                </div>

                {/* ── SECCIÓN 6: APORTES PATRONALES (informativa) ── */}
                <div style={{ borderBottom: '2px solid #6b7280', marginBottom: 16, paddingBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Aportes patronales</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Informativo — no afecta el neto del trabajador</div>
                </div>

                {/* S.S.O. (IVSS) patronal */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>S.S.O. (IVSS) patronal (10%)</div>
                <div className="form-grid form-grid-2" style={{ marginBottom: 16 }}>
                  {ro('S.S.O. (IVSS) patronal (USD)', `$ ${Number(computed.ivss_pat_usd || 0).toFixed(2)}`)}
                  {ro('S.S.O. (IVSS) patronal (Bs.)', `Bs. ${Number(computed.ivss_pat_bs || 0).toFixed(2)}`)}
                </div>

                {/* P.I.E. (RPE) patronal */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>P.I.E. (RPE) patronal (2%)</div>
                <div className="form-grid form-grid-2" style={{ marginBottom: 16 }}>
                  {ro('P.I.E. (RPE) patronal (USD)', `$ ${Number(computed.rpe_pat_usd || 0).toFixed(2)}`)}
                  {ro('P.I.E. (RPE) patronal (Bs.)', `Bs. ${Number(computed.rpe_pat_bs || 0).toFixed(2)}`)}
                </div>

                {/* F.A.O.V. (BANAVIH) patronal */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>F.A.O.V. (BANAVIH) patronal (2%)</div>
                <div className="form-grid form-grid-2" style={{ marginBottom: 16 }}>
                  {ro('F.A.O.V. (BANAVIH) patronal (USD)', `$ ${Number(computed.faov_pat_usd || 0).toFixed(2)}`)}
                  {ro('F.A.O.V. (BANAVIH) patronal (Bs.)', `Bs. ${Number(computed.faov_pat_bs || 0).toFixed(2)}`)}
                </div>

                {/* INCES — provisión */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Provisión INCES (2%)</div>
                <div className="form-grid form-grid-2" style={{ marginBottom: 8 }}>
                  {ro('INCES patronal (USD)', `$ ${Number(computed.inces_pat_usd || 0).toFixed(2)}`)}
                  {ro('INCES patronal (Bs.)', `Bs. ${Number(computed.inces_pat_bs || 0).toFixed(2)}`)}
                </div>

                {/* ── SECCIÓN 7: PROVISIONES PATRONALES ── */}
                <div style={{ borderBottom: '2px solid #6b7280', marginBottom: 16, paddingBottom: 6, marginTop: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Provisiones patronales</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Informativo — no afecta el neto del trabajador</div>
                </div>

                {/* Bono vacacional pagado */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Bono vacacional pagado en el período (si aplica)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Bono vacacional pagado en Bs.</label>
                    <input className="form-control" type="number" min="0" step="0.01"
                      value={formItem.bono_vacacional_bs ?? ''}
                      onChange={e => setFormItem({ ...formItem, bono_vacacional_bs: e.target.value })}
                      placeholder="0.00" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ color: '#6b7280', fontSize: 11 }}>Equivalente en USD (auto)</label>
                    <input className="form-control" readOnly
                      value={`$ ${(Number(formItem.bono_vacacional_bs || 0) / Number(tasa || 1)).toFixed(2)}`}
                      style={{ background: '#0d0d0d', color: '#6b7280', cursor: 'default' }} />
                  </div>
                </div>

                {/* Provisión de utilidades */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Provisión de utilidades / bonificación de fin de año
                </div>
                <div style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 6, padding: 14, marginBottom: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                        Ciclos al año ({
                          selected?.tipo?.startsWith('SEMANAL') ? 'semanal = 52'
                          : selected?.tipo?.startsWith('QUINCENAL') ? 'quincenal = 24'
                          : 'mensual = 12'
                        })
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#ccc' }}>
                        {configNomina.dias_utilidades || 30} días ÷ {computed.prov_ciclos_anuales} ciclos
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Días de utilidades configurados: {configNomina.dias_utilidades || 30}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Fracción de días de utilidades del período</div>
                      <div style={{ fontWeight: 700, fontSize: 18, color: '#9ca3af' }}>
                        {Number(computed.prov_fraccion_dias || 0).toFixed(4)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Sal. promedio diario Bs. (sal. mens. + bono vac.) ÷ 30</div>
                      <div style={{ fontWeight: 700, fontSize: 18, color: '#9ca3af' }}>
                        Bs. {Number(computed.prov_salario_prom_diario_bs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      Fracción de provisión = sal. promedio diario × fracción de días
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#9ca3af' }}>
                      Bs. {Number(computed.prov_fraccion_bs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

              </div></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => setEditItem(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSaveItem}>Guardar ajustes</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── LISTA DE NÓMINAS ─────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 style={{ fontWeight: 700 }}>Períodos de nómina</h3>
        <button className="btn btn-primary" onClick={() => setModalNueva(true)}>+ Nueva nómina</button>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Período</th><th>Tipo</th><th>Estado</th><th>Tasa BCV</th><th>Fecha cierre</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {nominas.map(n => (
                <tr key={n.id}>
                  <td className="fw-600">{n.periodo}</td>
                  <td>{n.tipo}</td>
                  <td><span className={`badge ${estadoNomBadge[n.estado]}`}>{n.estado}</span></td>
                  <td>{n.tasa_bcv ? `Bs. ${Number(n.tasa_bcv).toFixed(2)}` : '—'}</td>
                  <td>{n.closed_at ? dayjs(n.closed_at).format('DD/MM/YY HH:mm') : '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => loadDetalle(n)}>
                      Ver detalle
                    </button>
                    {n.estado === 'BORRADOR' && (
                      <button className="btn btn-sm" style={{ background: '#7f1d1d', color: '#fff' }}
                        onClick={() => handleEliminar(n)}>
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {nominas.length === 0 && (
                <tr><td colSpan={6} className="text-gris text-sm" style={{ textAlign: 'center', padding: 24 }}>
                  No hay nóminas de salarios. Crea una para comenzar.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalNueva && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title">Nueva nómina</div>
              <button className="modal-close" onClick={() => setModalNueva(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Período *</label>
                <input type="month" className="form-control" value={formNueva.periodo}
                  onChange={e => setFormNueva({ ...formNueva, periodo: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de nómina</label>
                <select className="form-control" value={formNueva.tipoBase}
                  onChange={e => {
                    const base = e.target.value;
                    const defaultTipo = base === 'QUINCENAL' ? 'QUINCENAL_1'
                      : base === 'SEMANAL' ? 'SEMANAL_1' : 'MENSUAL';
                    setFormNueva({ ...formNueva, tipoBase: base, tipo: defaultTipo });
                  }}>
                  <option value="MENSUAL">Mensual</option>
                  <option value="QUINCENAL">Quincenal</option>
                  <option value="SEMANAL">Semanal</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Ciclo *</label>
                {formNueva.tipoBase === 'MENSUAL' && (
                  <select className="form-control" value={formNueva.tipo}
                    onChange={e => setFormNueva({ ...formNueva, tipo: e.target.value })}>
                    <option value="MENSUAL">Único</option>
                  </select>
                )}
                {formNueva.tipoBase === 'QUINCENAL' && (
                  <select className="form-control" value={formNueva.tipo}
                    onChange={e => setFormNueva({ ...formNueva, tipo: e.target.value })}>
                    <option value="QUINCENAL_1">1ra quincena</option>
                    <option value="QUINCENAL_2">2da quincena</option>
                  </select>
                )}
                {formNueva.tipoBase === 'SEMANAL' && (() => {
                  const [y, m] = (formNueva.periodo || '').split('-').map(Number);
                  const firstDay = y && m ? new Date(y, m - 1, 1).getDay() : 0;
                  const daysInMonth = y && m ? new Date(y, m, 0).getDate() : 30;
                  const hasSemana5 = Math.ceil((firstDay + daysInMonth) / 7) > 4;
                  return (
                    <select className="form-control" value={formNueva.tipo}
                      onChange={e => setFormNueva({ ...formNueva, tipo: e.target.value })}>
                      <option value="SEMANAL_1">Semana 1</option>
                      <option value="SEMANAL_2">Semana 2</option>
                      <option value="SEMANAL_3">Semana 3</option>
                      <option value="SEMANAL_4">Semana 4</option>
                      {hasSemana5 && <option value="SEMANAL_5">Semana 5</option>}
                    </select>
                  );
                })()}
              </div>
              <div className="form-group">
                <label className="form-label">Observaciones</label>
                <textarea className="form-control" rows={2} value={formNueva.observaciones}
                  onChange={e => setFormNueva({ ...formNueva, observaciones: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalNueva(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCrear}>Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN NÓMINA (parámetros legales)
// ─────────────────────────────────────────────────────────────
function ConfigNominaTab() {
  const { tasa: tasaBCV } = useContext(MonedaContext);
  const { user } = useAuth();
  const puedeEditar = ['ADMIN_SR', 'SUPERADMIN'].includes(user?.rol);
  const emptyForm = {
    cesta_ticket_dias: 40,
    cesta_ticket_valor_dia: 0,
    dias_utilidades: 30,
    dias_vacaciones: 15,
    dias_bono_vacacional: 15,
    riesgo_ivss: 'MINIMO',
    aplica_inces: 1,
    moneda_nomina: 'USD',
    tipo_nomina: 'MENSUAL',
    banco_pagador: '',
    tipo_cuenta_origen: 'CORRIENTE',
    cuenta_origen: '',
    concepto_pago: 'PAGO DE NOMINA',
    formato_txt: 'TAB',
    incluir_encabezado: 1
  };
  const [form, setForm] = useState(emptyForm);
  const [empresaForm, setEmpresaForm] = useState({ numero_patronal_ivss: '', numero_afiliacion_faov: '', rif: '' });
  const [bancosForm, setBancosForm] = useState(() =>
    Object.fromEntries(TIPOS_NOMINA_BANCOS.map(t => [t.key, { banco: '', cuenta_origen: '' }]))
  );
  const [previewBanco, setPreviewBanco] = useState({}); // { tipoKey: previewString | 'NO_PARAM' | null }
  const [savingBanco, setSavingBanco] = useState(null); // tipo key currently saving
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/nomina/config').then(r => setForm({ ...emptyForm, ...r.data })).catch(() => {});
    api.get('/empresas/me').then(r => setEmpresaForm({
      numero_patronal_ivss:   r.data?.numero_patronal_ivss   || '',
      numero_afiliacion_faov: r.data?.numero_afiliacion_faov || '',
      rif:                    r.data?.rif                    || '',
    })).catch(() => {});
    api.get('/nomina/bancos').then(r => {
      const next = Object.fromEntries(TIPOS_NOMINA_BANCOS.map(t => [t.key, { banco: '', cuenta_origen: '' }]));
      (r.data || []).forEach(row => {
        if (next[row.tipo_nomina]) next[row.tipo_nomina] = { banco: row.banco || '', cuenta_origen: row.cuenta_origen || '' };
      });
      setBancosForm(next);
    }).catch(() => {});
  }, []);

  const handleGuardarBanco = async (tipoKey) => {
    if (!puedeEditar) return;
    setSavingBanco(tipoKey);
    try {
      await api.put('/nomina/bancos', {
        tipo_nomina:   tipoKey,
        banco:         bancosForm[tipoKey].banco || null,
        cuenta_origen: bancosForm[tipoKey].cuenta_origen || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e) { alert(e.response?.data?.error || 'Error al guardar'); }
    setSavingBanco(null);
  };

  const handlePrevisualizar = (tipoKey) => {
    const { banco, cuenta_origen } = bancosForm[tipoKey];
    if (!banco) { setPreviewBanco(p => ({ ...p, [tipoKey]: null })); return; }
    const sample = previsualizarTXTBanco(banco, cuenta_origen, { rif: empresaForm.rif });
    setPreviewBanco(p => ({ ...p, [tipoKey]: sample === null ? 'NO_PARAM' : sample }));
  };

  const handleSave = async () => {
    if (!puedeEditar) return;
    const tasa = Number(tasaBCV) || 1;
    const valorDia = (Number(form.cesta_ticket_dias) * tasa) / 30;
    await api.put('/nomina/config', { ...form, cesta_ticket_valor_dia: valorDia });
    await api.put('/empresas/me', {
      numero_patronal_ivss:   empresaForm.numero_patronal_ivss   || null,
      numero_afiliacion_faov: empresaForm.numero_afiliacion_faov || null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const porcIVSS = form.riesgo_ivss === 'MEDIO' ? 10 : form.riesgo_ivss === 'MAXIMO' ? 11 : 9;
  const tasa = Number(tasaBCV) || 1;
  const valorDiaCalculado = ((Number(form.cesta_ticket_dias) || 40) * tasa / 30).toFixed(2);

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header">
          <div className="card-title">Parámetros legales</div>
          {!puedeEditar && (
            <span className="badge badge-gris" style={{ marginLeft: 10 }}>
              Solo lectura — requiere Administrador Senior
            </span>
          )}
        </div>
        <div className="card-body">
          <div className="alert alert-info mb-4" style={{ fontSize: 12 }}>
            <strong>Legislación vigente:</strong> Los valores mínimos están establecidos por la LOTTT y leyes especiales.
            Solo puede aumentarlos, no disminuirlos. IVSS: Ley del Seguro Social (2012) art. 65 y 66 |
            FAOV: Ley del Régimen Prestacional de Vivienda y Hábitat (2014) art. 33 |
            Cesta Ticket: Ley de Alimentación | INCES: Ley del INCES (2014) art. 49 y 50
          </div>
          {!puedeEditar && (
            <div className="alert alert-warning mb-4" style={{ fontSize: 12 }}>
              Esta sección solo puede ser editada por un <strong>Administrador Senior</strong>.
              Los demás roles pueden consultar los parámetros vigentes.
            </div>
          )}

          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Salario mínimo legal mensual</label>
              <input className="form-control" value="Bs. 130,00" readOnly
                style={{ background: '#1a1a1a', color: '#ccc' }} />
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>Referencia para topes de IVSS y RPE</div>
            </div>
            <div className="form-group">
              <label className="form-label">Vigente desde</label>
              <input className="form-control" value="01/05/2022" readOnly
                style={{ background: '#1a1a1a', color: '#ccc' }} />
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>Decreto N° 4.686 — Gaceta Oficial N° 42.377</div>
            </div>
            <div className="form-group">
              <label className="form-label">Cesta Ticket — Monto mensual en USD</label>
              <input className="form-control" type="number" min="40" step="0.01" value={form.cesta_ticket_dias}
                disabled={!puedeEditar}
                onChange={e => setForm({ ...form, cesta_ticket_dias: e.target.value })} />
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>Mínimo legal: 40 USD</div>
            </div>
            <div className="form-group">
              <label className="form-label">Cesta Ticket — Valor por día (Bs.)</label>
              <input className="form-control" value={`Bs. ${valorDiaCalculado}`} readOnly
                style={{ background: '#1a1a1a', color: '#ccc' }} />
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>Calculado: monto USD × tasa BCV ÷ 30 días</div>
            </div>
            <div className="form-group">
              <label className="form-label">Días de utilidades / Bonificación de fin de año</label>
              <input className="form-control" type="number" min="30" value={form.dias_utilidades}
                disabled={!puedeEditar}
                onChange={e => setForm({ ...form, dias_utilidades: e.target.value })} />
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>Mínimo legal: 30 días (LOTTT art. 131)</div>
            </div>
            <div className="form-group">
              <label className="form-label">Días de vacaciones</label>
              <input className="form-control" type="number" min="15" value={form.dias_vacaciones}
                disabled={!puedeEditar}
                onChange={e => setForm({ ...form, dias_vacaciones: e.target.value })} />
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>Mínimo: 15 días + 1 día/año adicional (LOTTT art. 190)</div>
            </div>
            <div className="form-group">
              <label className="form-label">Días de bono vacacional</label>
              <input className="form-control" type="number" min="15" value={form.dias_bono_vacacional}
                disabled={!puedeEditar}
                onChange={e => setForm({ ...form, dias_bono_vacacional: e.target.value })} />
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>Mínimo: 15 días + 1 día/año adicional (LOTTT art. 192)</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #222', margin: '16px 0', paddingTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Moneda de la nómina de salarios</div>
            <div style={{ display: 'flex', gap: 24 }}>
              {['USD','BS'].map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: puedeEditar ? 'pointer' : 'not-allowed', opacity: puedeEditar ? 1 : .6 }}>
                  <input type="radio" name="moneda_nomina" value={m} checked={(form.moneda_nomina || 'USD') === m}
                    disabled={!puedeEditar}
                    onChange={() => setForm({ ...form, moneda_nomina: m })} />
                  <span>{m === 'USD' ? 'Dólares (USD)' : 'Bolívares (Bs.)'}</span>
                </label>
              ))}
            </div>
            <div className="text-sm text-gris" style={{ marginTop: 6 }}>Indica si los salarios de la empresa están fijados en USD o en Bs.</div>
          </div>

          <div style={{ borderTop: '1px solid #222', margin: '16px 0', paddingTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>IVSS — Riesgo patronal</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {['MINIMO','MEDIO','MAXIMO'].map(r => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: puedeEditar ? 'pointer' : 'not-allowed', opacity: puedeEditar ? 1 : .6 }}>
                  <input type="radio" name="riesgo" value={r} checked={form.riesgo_ivss === r}
                    disabled={!puedeEditar}
                    onChange={() => setForm({ ...form, riesgo_ivss: r })} />
                  <span>{r} — {r === 'MINIMO' ? '9%' : r === 'MEDIO' ? '10%' : '11%'} patronal</span>
                </label>
              ))}
            </div>
            <div className="text-sm text-gris" style={{ marginTop: 8 }}>
              Aporte trabajador: siempre 4% · Aporte patronal seleccionado: <strong>{porcIVSS}%</strong>
            </div>
            <div className="form-group" style={{ marginTop: 14, maxWidth: 360 }}>
              <label className="form-label">N° patronal de la empresa</label>
              <input className="form-control" type="text" maxLength={30}
                placeholder="Ej.: A12345678"
                value={empresaForm.numero_patronal_ivss || ''}
                disabled={!puedeEditar}
                onChange={e => setEmpresaForm({ ...empresaForm, numero_patronal_ivss: e.target.value })} />
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>
                Identificación de la empresa ante el IVSS. Aparece en la Forma 13-12 y archivos TIUNA.
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #222', margin: '16px 0', paddingTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>FAOV — Régimen Prestacional de Vivienda</div>
            <div className="form-group" style={{ maxWidth: 360 }}>
              <label className="form-label">N° de Afiliación de la Nómina de FAOV</label>
              <input className="form-control" type="text" maxLength={30}
                placeholder="Ej.: 1234567890"
                value={empresaForm.numero_afiliacion_faov || ''}
                disabled={!puedeEditar}
                onChange={e => setEmpresaForm({ ...empresaForm, numero_afiliacion_faov: e.target.value })} />
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>
                Número de afiliación de la empresa ante BANAVIH/FAOV. Requerido para la carga masiva.
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #222', margin: '16px 0', paddingTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: puedeEditar ? 'pointer' : 'not-allowed', opacity: puedeEditar ? 1 : .6 }}>
              <input type="checkbox" checked={!!form.aplica_inces}
                disabled={!puedeEditar}
                onChange={e => setForm({ ...form, aplica_inces: e.target.checked ? 1 : 0 })} />
              <span>
                <strong>Aplicar INCES</strong> (tildar si la empresa tiene 5 o más trabajadores) — 2% patronal sobre total salarios,
                0.5% trabajador sobre utilidades/bonificaciones · <span className="text-gris text-sm">Ley del INCES (2014) art. 49 y 50</span>
              </span>
            </label>
          </div>

          {puedeEditar && (
            <div style={{ marginTop: 20 }}>
              <button className="btn btn-primary" onClick={handleSave}>
                {saved ? '✓ Guardado' : 'Guardar configuración'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Parámetros de nóminas — tipo de nómina por defecto */}
      <div className="card mb-4">
        <div className="card-header">
          <div className="card-title">Parámetros de nóminas</div>
          {!puedeEditar && (
            <span className="badge badge-gris" style={{ marginLeft: 10 }}>
              Solo lectura — requiere Administrador Senior
            </span>
          )}
        </div>
        <div className="card-body">
          <div className="alert alert-warning mb-4" style={{ fontSize: 12, lineHeight: 1.5 }}>
            <strong>Importante:</strong> La configuración de este parámetro afectará los cálculos
            de utilidades y prestaciones sociales; por lo tanto, en caso de desear cambiar el tipo
            de nómina, es recomendable que se realice al inicio del año fiscal.
          </div>

          <div style={{ fontWeight: 600, marginBottom: 12 }}>Tipo de nómina</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              ['SEMANAL',   'Semanal',   '52 ciclos al año · pagos cada 7 días'],
              ['QUINCENAL', 'Quincenal', '24 ciclos al año · pagos cada 15 días'],
              ['MENSUAL',   'Mensual',   '12 ciclos al año · 1 pago por mes'],
            ].map(([val, label, desc]) => {
              const checked = (form.tipo_nomina || 'MENSUAL') === val;
              return (
                <label key={val}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    cursor: puedeEditar ? 'pointer' : 'not-allowed',
                    opacity: puedeEditar ? 1 : .6,
                    border: `1.5px solid ${checked ? '#CC0000' : '#e5e7eb'}`,
                    borderRadius: 8, padding: '12px 16px', minWidth: 220, flex: '1 1 220px',
                    background: checked ? 'rgba(204,0,0,0.04)' : '#fff',
                  }}>
                  <input type="radio" name="tipo_nomina" value={val} checked={checked}
                    disabled={!puedeEditar}
                    onChange={() => setForm({ ...form, tipo_nomina: val })}
                    style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ fontWeight: 600, color: '#111' }}>{label}</div>
                    <div className="text-sm text-gris" style={{ marginTop: 2 }}>{desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="text-sm text-gris" style={{ marginTop: 10 }}>
            Define el ciclo por defecto al crear nuevas nóminas de salarios. Influye en el cálculo
            de provisiones de utilidades (ciclos anuales) y de prestaciones sociales.
          </div>

          {puedeEditar && (
            <div style={{ marginTop: 20 }}>
              <button className="btn btn-primary" onClick={handleSave}>
                {saved ? '✓ Guardado' : 'Guardar configuración'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* R5-11.3 — Parámetros bancarios por tipo de nómina */}
      <div className="card mb-4">
        <div className="card-header">
          <div className="card-title">Parámetros bancarios</div>
          {!puedeEditar && (
            <span className="badge badge-gris" style={{ marginLeft: 10 }}>
              Solo lectura — requiere Administrador Senior
            </span>
          )}
        </div>
        <div className="card-body">
          <div className="alert alert-info mb-4" style={{ fontSize: 12, lineHeight: 1.5 }}>
            Configure el <strong>banco pagador</strong> y la <strong>cuenta origen (20 dígitos)</strong>
            por tipo de nómina. Cada banco tiene su propio formato de archivo .TXT — use
            "Previsualizar" para verificar el ejemplo de cómo quedará el archivo de pago.
          </div>

          {TIPOS_NOMINA_BANCOS.map(({ key, label }) => {
            const row     = bancosForm[key] || { banco: '', cuenta_origen: '' };
            const preview = previewBanco[key];
            const bancoInfo = BANCOS_VE.find(b => b.nombre === row.banco);
            const noParam   = bancoInfo && !bancoInfo.formato;
            return (
              <div key={key} style={{ borderTop: '1px solid #222', padding: '14px 0 8px', marginBottom: 4 }}>
                <div style={{ fontWeight: 600, marginBottom: 10 }}>{label}</div>
                <div className="form-grid form-grid-2" style={{ alignItems: 'end' }}>
                  <div className="form-group">
                    <label className="form-label">Banco</label>
                    <select className="form-control"
                      value={row.banco}
                      disabled={!puedeEditar}
                      onChange={e => {
                        setBancosForm(b => ({ ...b, [key]: { ...b[key], banco: e.target.value } }));
                        setPreviewBanco(p => ({ ...p, [key]: undefined }));
                      }}>
                      <option value="">Seleccionar banco...</option>
                      {BANCOS_VE.map(b => (
                        <option key={b.nombre} value={b.nombre}>
                          {b.nombre}{!b.formato ? ' — sin formato .TXT' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Número de cuenta origen (20 dígitos)</label>
                    <input className="form-control" type="text" inputMode="numeric"
                      maxLength={20} placeholder="01020001020000123456"
                      value={row.cuenta_origen}
                      disabled={!puedeEditar || !row.banco}
                      onChange={e => {
                        const onlyDigits = e.target.value.replace(/[^0-9]/g, '').slice(0, 20);
                        setBancosForm(b => ({ ...b, [key]: { ...b[key], cuenta_origen: onlyDigits } }));
                        setPreviewBanco(p => ({ ...p, [key]: undefined }));
                      }} />
                    {row.banco && row.cuenta_origen && row.cuenta_origen.length !== 20 && (
                      <div className="text-sm" style={{ color: '#b45309', marginTop: 4 }}>
                        La cuenta debe tener exactamente 20 dígitos ({row.cuenta_origen.length}/20).
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  <button className="btn btn-secondary btn-sm"
                    disabled={!row.banco}
                    onClick={() => handlePrevisualizar(key)}>
                    Previsualizar
                  </button>
                  {puedeEditar && (
                    <button className="btn btn-primary btn-sm"
                      disabled={!row.banco || savingBanco === key}
                      onClick={() => handleGuardarBanco(key)}>
                      {savingBanco === key ? 'Guardando...' : 'Guardar banco'}
                    </button>
                  )}
                </div>
                {preview !== undefined && (
                  <div style={{ marginTop: 10 }}>
                    {preview === 'NO_PARAM' || noParam ? (
                      <div className="alert alert-warning" style={{ fontSize: 12 }}>
                        Información no parametrizada. Contacte a soporte.
                      </div>
                    ) : preview ? (
                      <div>
                        <div className="text-sm" style={{ color: '#666', marginBottom: 4 }}>
                          Ejemplo de archivo .TXT para <strong>{row.banco}</strong>
                          {' '}(3 trabajadores ficticios):
                        </div>
                        <pre style={{
                          background: '#0f0f0f', color: '#d4d4d4', border: '1px solid #2a2a2a',
                          padding: '12px 14px', borderRadius: 6, fontSize: 11.5, lineHeight: 1.55,
                          overflowX: 'auto', whiteSpace: 'pre', margin: 0,
                        }}>{preview}</pre>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Configuración del archivo .TXT — formato y cabecera (heredado R5-6.11) */}
      <div className="card mb-4">
        <div className="card-header">
          <div className="card-title">Configuración del archivo .TXT</div>
        </div>
        <div className="card-body">
          <div className="alert alert-info mb-4" style={{ fontSize: 12 }}>
            Estos datos definen el <strong>archivo .TXT para pago de nómina</strong> que se descarga
            desde una nómina cerrada. El banco pagador y la cuenta origen identifican el débito;
            el formato determina la estructura del archivo que se carga en la banca electrónica.
          </div>

          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Banco pagador</label>
              <select className="form-control" value={form.banco_pagador || ''}
                onChange={e => setForm({ ...form, banco_pagador: e.target.value })}>
                <option value="">Seleccionar banco...</option>
                <option>Banco de Venezuela</option>
                <option>Banesco</option>
                <option>Mercantil</option>
                <option>Provincial</option>
                <option>BNC</option>
                <option>Banco del Tesoro</option>
                <option>Bicentenario</option>
                <option>Exterior</option>
                <option>Venezolano de Crédito</option>
                <option>Bancaribe</option>
                <option>Banplus</option>
                <option>BFC</option>
                <option>Banco Nacional de Crédito</option>
                <option>Bancamiga</option>
                <option>Banco Plaza</option>
                <option>Banco Caroní</option>
                <option>Bancrecer</option>
                <option>Mi Banco</option>
                <option>Banco Activo</option>
                <option>Sofitasa</option>
                <option>100% Banco</option>
                <option>Banco Agrícola de Venezuela</option>
                <option>Bangente</option>
                <option>BOD</option>
              </select>
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>Banco desde el que se ejecuta el pago</div>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de cuenta origen</label>
              <select className="form-control" value={form.tipo_cuenta_origen || 'CORRIENTE'}
                onChange={e => setForm({ ...form, tipo_cuenta_origen: e.target.value })}>
                <option value="CORRIENTE">Corriente</option>
                <option value="AHORRO">Ahorro</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Número de cuenta origen</label>
              <input className="form-control" type="text" maxLength={30}
                placeholder="0000-0000-00-0000000000"
                value={form.cuenta_origen || ''}
                onChange={e => setForm({ ...form, cuenta_origen: e.target.value })} />
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>Cuenta de la empresa desde la que se debita</div>
            </div>
            <div className="form-group">
              <label className="form-label">Concepto del pago</label>
              <input className="form-control" type="text" maxLength={80}
                value={form.concepto_pago || ''}
                onChange={e => setForm({ ...form, concepto_pago: e.target.value })} />
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>Descripción que acompaña la transferencia</div>
            </div>
            <div className="form-group">
              <label className="form-label">Formato del archivo .TXT</label>
              <select className="form-control" value={form.formato_txt || 'TAB'}
                onChange={e => setForm({ ...form, formato_txt: e.target.value })}>
                <option value="TAB">Texto delimitado por tabulación</option>
                <option value="CSV_COMA">CSV — separado por coma</option>
                <option value="CSV_PUNTOCOMA">CSV — separado por punto y coma</option>
                <option value="ANCHO_FIJO">Ancho fijo (columnas alineadas)</option>
              </select>
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>Elija el que acepte su banca electrónica</div>
            </div>
            <div className="form-group">
              <label className="form-label">Encabezado de columnas</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 8 }}>
                <input type="checkbox" checked={!!form.incluir_encabezado}
                  onChange={e => setForm({ ...form, incluir_encabezado: e.target.checked ? 1 : 0 })} />
                <span>Incluir fila de títulos y bloque de cabecera en el .TXT</span>
              </label>
              <div className="text-sm text-gris" style={{ marginTop: 4 }}>Desactívelo si su banco solo acepta filas de datos</div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <button className="btn btn-primary" onClick={handleSave}>
              {saved ? '✓ Guardado' : 'Guardar configuración'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabla resumen de porcentajes legales */}
      <div className="card">
        <div className="card-header"><div className="card-title">Resumen de deducciones legales vigentes</div></div>
        <div className="card-body">
          <table>
            <thead>
              <tr><th>Concepto</th><th>Base de cálculo</th><th>% Trabajador</th><th>% Patronal</th><th>Norma</th></tr>
            </thead>
            <tbody>
              <tr>
                <td className="fw-600">IVSS (Seguro Social)</td>
                <td>Salario normal mensual</td>
                <td>4%</td>
                <td>{porcIVSS}%</td>
                <td className="text-gris text-sm">Ley del Seguro Social (2012) art. 65 y 66</td>
              </tr>
              <tr>
                <td className="fw-600">Régimen Prestacional de Empleo</td>
                <td>Salario normal mensual</td>
                <td>0.5%</td>
                <td>2%</td>
                <td className="text-gris text-sm">Ley del Régimen Prestacional de Empleo (2005) art. 46</td>
              </tr>
              <tr>
                <td className="fw-600">FAOV / BANAVIH</td>
                <td>Salario normal mensual</td>
                <td>1%</td>
                <td>2%</td>
                <td className="text-gris text-sm">Ley del Régimen Prestacional de Vivienda y Hábitat (2014) art. 33</td>
              </tr>
              <tr>
                <td className="fw-600">INCES</td>
                <td>Total sueldos y salarios</td>
                <td>0.5% (utilidades)</td>
                <td>2%</td>
                <td className="text-gris text-sm">Ley del INCES (2014) art. 49 y 50</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FORMA 13-12 IVSS (Registro de asegurados)
// ─────────────────────────────────────────────────────────────
function Forma1312Tab() {
  const [nominas, setNominas] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/nomina').then(r => setNominas(r.data.filter(n => n.estado !== 'BORRADOR')));
  }, []);

  const loadForma = async () => {
    if (!selectedId) return;
    const r = await api.get(`/nomina/${selectedId}/forma-13-12`);
    setData(r.data);
  };

  const imprimir = () => window.print();

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header"><div className="card-title">Generar Forma 13-12 IVSS</div></div>
        <div className="card-body">
          <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
            <select className="form-control" style={{ maxWidth: 260 }} value={selectedId}
              onChange={e => setSelectedId(e.target.value)}>
              <option value="">Seleccionar período...</option>
              {nominas.map(n => (
                <option key={n.id} value={n.id}>{n.periodo} — {n.tipo}</option>
              ))}
            </select>
            <button className="btn btn-secondary" onClick={loadForma} disabled={!selectedId}>
              Generar
            </button>
            {data && (
              <button className="btn btn-primary" onClick={imprimir}>Imprimir</button>
            )}
          </div>
        </div>
      </div>

      {data && (
        <div className="card" id="forma-13-12-print">
          <div className="card-body" style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {/* Encabezado oficial */}
            <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '2px solid #333', paddingBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>INSTITUTO VENEZOLANO DE LOS SEGUROS SOCIALES</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>FORMA 13-12 — REGISTRO DE ASEGURADOS</div>
              <div style={{ fontSize: 11, color: '#666' }}>Según Ley del Seguro Social y su Reglamento</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 11 }}>
              <div><strong>Razón Social:</strong> {data.empresa.razon_social}</div>
              <div><strong>RIF:</strong> {data.empresa.rif}</div>
              <div><strong>N° Patronal IVSS:</strong> {data.empresa.numero_patronal_ivss || '_______________'}</div>
              <div><strong>Período:</strong> {data.periodo}</div>
              <div><strong>Dirección:</strong> {data.empresa.direccion}</div>
              <div><strong>Tasa BCV:</strong> Bs. {Number(data.tasa_bcv).toFixed(2)}</div>
            </div>

            <div className="table-wrapper">
              <table style={{ fontSize: 10 }}>
                <thead>
                  <tr>
                    <th>Apellidos y Nombres</th>
                    <th>Cédula</th>
                    <th>Cargo</th>
                    <th>F. Ingreso</th>
                    <th>F. Egreso</th>
                    <th style={{ textAlign: 'right' }}>Sal. Diario Bs.</th>
                    <th style={{ textAlign: 'right' }}>Sal. Mensual Bs.</th>
                    <th style={{ textAlign: 'right' }}>IVSS Trab.</th>
                    <th style={{ textAlign: 'right' }}>IVSS Patr.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trabajadores.map((t, i) => (
                    <tr key={i}>
                      <td>{t.apellidos_nombres}</td>
                      <td>{t.cedula}</td>
                      <td>{t.cargo || '—'}</td>
                      <td>{t.fecha_ingreso ? dayjs(t.fecha_ingreso).format('DD/MM/YYYY') : '—'}</td>
                      <td>{t.fecha_egreso ? dayjs(t.fecha_egreso).format('DD/MM/YYYY') : '—'}</td>
                      <td style={{ textAlign: 'right' }}>Bs. {(Number(t.salario_diario_usd) * data.tasa_bcv).toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>Bs. {t.salario_mensual_bs}</td>
                      <td style={{ textAlign: 'right' }}>Bs. {t.ivss_trabajador_bs}</td>
                      <td style={{ textAlign: 'right' }}>Bs. {t.ivss_patronal_bs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16, fontSize: 11, color: '#666' }}>
              Generado el {dayjs().format('DD/MM/YYYY HH:mm')} — {data.trabajadores.length} trabajadores registrados
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CESTA TICKET (nómina de alimentación — siempre mensual)
// ─────────────────────────────────────────────────────────────
function CestaTicketTab() {
  const { tasa: tasaBCV } = useContext(MonedaContext);
  const [nominas, setNominas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [modalNueva, setModalNueva] = useState(false);
  const [formNueva, setFormNueva] = useState({ periodo: dayjs().format('YYYY-MM'), observaciones: '' });
  const [editItem, setEditItem] = useState(null);
  const [formItem, setFormItem] = useState({});
  const [procesando, setProcesando] = useState(false);
  const [showPreNomina, setShowPreNomina] = useState(false);
  const [showResumen, setShowResumen] = useState(false);
  const [showReporte, setShowReporte] = useState(false);
  const [showTxtPago, setShowTxtPago] = useState(false);
  const [showRecibos, setShowRecibos] = useState(false);
  const [recibosModo, setRecibosModo] = useState('inicio'); // 'inicio' | 'lista'
  const [reciboEnviando, setReciboEnviando] = useState(null);
  const [txtFechaPago, setTxtFechaPago] = useState(dayjs().format('YYYY-MM-DD'));
  const [configNomina, setConfigNomina] = useState({});
  const [prenominaData, setPrenominaData] = useState(null);

  const load = () => api.get('/nomina').then(r =>
    setNominas(r.data.filter(n => n.subtipo === 'ALIMENTACION')));

  const loadDetalle = async (nom) => {
    setSelected(nom);
    const [det, res] = await Promise.all([
      api.get(`/nomina/${nom.id}`),
      api.get(`/nomina/${nom.id}/resumen`)
    ]);
    setItems(det.data.items || []);
    setResumen(res.data);
  };

  useEffect(() => {
    load();
    api.get('/nomina/config').then(r => setConfigNomina(r.data || {})).catch(() => {});
  }, []);

  const handleCrear = async () => {
    try {
      await api.post('/nomina', { ...formNueva, tipo: 'MENSUAL', subtipo: 'ALIMENTACION' });
      setModalNueva(false); load();
    } catch (e) { alert(e.response?.data?.error || 'Error'); }
  };

  const handleEliminar = async (nom) => {
    if (!confirm(`¿Eliminar nómina Cesta Ticket ${nom.periodo}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/nomina/${nom.id}`);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Error al eliminar'); }
  };

  const handleProcesar = async () => {
    if (!confirm('¿Procesar nómina de Cesta Ticket? Se calcularán los montos para todos los empleados activos.')) return;
    setProcesando(true);
    try {
      const r = await api.post(`/nomina/${selected.id}/procesar`);
      alert(`Procesados: ${r.data.procesados} empleados`);
      loadDetalle(selected);
    } catch (e) {
      alert(e.response?.data?.error || 'Error al procesar');
    } finally { setProcesando(false); }
  };

  const handleCerrar = async () => {
    if (!confirm('¿Cerrar nómina de Cesta Ticket? Ya no podrá editarse.')) return;
    await api.post(`/nomina/${selected.id}/cerrar`);
    load();
    setSelected({ ...selected, estado: 'CERRADA' });
  };

  const tasa = selected?.tasa_bcv || tasaBCV || 1;
  const fmtUSD = v => `$ ${Number(v || 0).toFixed(2)}`;
  const fmtBS  = v => `Bs. ${(Number(v || 0) * Number(tasa)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleEditItem = (item) => {
    setEditItem(item);
    setFormItem({
      dias_habiles: item.dias_habiles ?? 22,
      dias_descanso: item.dias_descanso ?? 8,
      dias_adicionales_cantidad: item.dias_adicionales_cantidad || 0,
      descuento_ausencias_cantidad: item.descuento_ausencias_cantidad || 0,
      notas: item.notas || '',
    });
  };

  const computedCT = (() => {
    if (!editItem) return {};
    const cesta = Number(editItem.cesta_ticket || 0);
    const dailyCesta = cesta / 30;          // Cesta Ticket diario = CT mensual / 30
    const t = Number(tasa) || 1;
    const diasH   = Number(formItem.dias_habiles || 0);
    const diasD   = Number(formItem.dias_descanso || 0);
    const diasAd  = Number(formItem.dias_adicionales_cantidad || 0);
    const diasAus = Number(formItem.descuento_ausencias_cantidad || 0);

    const dias_habiles_usd      = diasH  * dailyCesta;
    const dias_descanso_usd     = diasD  * dailyCesta;
    const dias_adicionales_usd  = diasAd * dailyCesta;
    const descuento_ausencias_usd = diasAus * dailyCesta;

    const total_asig  = dias_habiles_usd + dias_descanso_usd + dias_adicionales_usd;
    const total_deduc = descuento_ausencias_usd;
    return {
      dailyCesta,
      dias_habiles_usd,     dias_habiles_bs:     dias_habiles_usd * t,
      dias_descanso_usd,    dias_descanso_bs:    dias_descanso_usd * t,
      dias_adicionales_usd, dias_adicionales_bs: dias_adicionales_usd * t,
      descuento_ausencias_usd, descuento_ausencias_bs: descuento_ausencias_usd * t,
      total_asig,  total_asig_bs:  total_asig * t,
      total_deduc, total_deduc_bs: total_deduc * t,
      neto: total_asig - total_deduc, neto_bs: (total_asig - total_deduc) * t,
    };
  })();

  const handleSaveItem = async () => {
    const payload = {
      cesta_ticket: editItem.cesta_ticket,
      dias_habiles: Number(formItem.dias_habiles || 0),
      dias_descanso: Number(formItem.dias_descanso || 0),
      dias_adicionales_cantidad: Number(formItem.dias_adicionales_cantidad || 0),
      dias_adicionales_usd: computedCT.dias_adicionales_usd,
      descuento_ausencias_cantidad: Number(formItem.descuento_ausencias_cantidad || 0),
      descuento_ausencias_usd: computedCT.descuento_ausencias_usd,
      notas: formItem.notas || null,
    };
    try {
      await api.put(`/nomina/${selected.id}/items/${editItem.id}`, payload);
      setEditItem(null);
      loadDetalle(selected);
    } catch (e) { alert(e.response?.data?.error || 'Error al guardar'); }
  };

  const handleVerPreNomina = async () => {
    try {
      const r = await api.get(`/nomina/${selected.id}/prenomina`);
      setPrenominaData(r.data);
      setShowPreNomina(true);
    } catch (e) { alert('Error al cargar pre-nómina'); }
  };

  // Carga la pre-nómina y abre el reporte indicado (nómina cerrada)
  const abrirReporteCT = async (setter, extra) => {
    try {
      if (prenominaData?.nomina?.id !== selected?.id) {
        const r = await api.get(`/nomina/${selected.id}/prenomina`);
        setPrenominaData(r.data);
      }
      if (extra) extra();
      setter(true);
    } catch (e) { alert('Error al cargar datos de la nómina'); }
  };

  // ── PRE-NÓMINA / REPORTE DE NÓMINA CESTA TICKET ──────────────
  if ((showPreNomina || showReporte) && prenominaData) {
    const modoReporte = showReporte;
    const { nomina: pnom, empresa: pemp, items: pitems, usuario_nombre: pusuario } = prenominaData;
    const ptasa = Number(pnom.tasa_bcv || 1);
    const bs = n => `Bs. ${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const cicloLabel = pnom.periodo;
    // Montos por concepto en Bs. (los items se guardan en USD)
    const dailyCT = i => Number(i.cesta_ticket || 0) / 30;
    const habBs   = i => Number(i.dias_habiles || 0) * dailyCT(i) * ptasa;
    const desBs   = i => Number(i.dias_descanso || 0) * dailyCT(i) * ptasa;
    const adicBs  = i => Number(i.dias_adicionales_usd || 0) * ptasa;
    const ausBs   = i => Number(i.descuento_ausencias_usd || 0) * ptasa;
    const asigBs  = i => Number(i.total_asignaciones || 0) * ptasa;
    const dedBs   = i => Number(i.total_deducciones || 0) * ptasa;
    const netoBs  = i => Number(i.neto_pagar || 0) * ptasa;
    const sumBs = fn => pitems.reduce((a, i) => a + fn(i), 0);

    const handlePrint = () => {
      const content = document.getElementById('prenomina-ct-content').innerHTML;
      const w = window.open('', '_blank', 'width=900,height=800');
      w.document.write(`<html><head><title>${modoReporte ? 'Reporte' : 'Pre-nómina'} Cesta Ticket ${pnom.periodo}</title>
        <style>
          *{box-sizing:border-box}
          body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0;padding:16px}
          h2{font-size:15px;margin:0;text-align:center}
          .titulo{text-align:center;font-weight:700;font-size:14px;letter-spacing:.5px;margin:4px 0}
          .meta{text-align:center;font-size:11px;color:#555;margin-bottom:14px}
          .wcard{border:1px solid #ccc;border-radius:6px;padding:12px 14px;margin-bottom:12px;page-break-inside:avoid}
          .wname{font-weight:700;font-size:12px;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px}
          table{width:100%;border-collapse:collapse;font-size:10px}
          td{padding:3px 6px;border-bottom:1px solid #f0f0f0}
          .r{text-align:right}
          .resumen{border:2px solid #111;border-radius:6px;padding:12px 14px;margin-top:8px}
          @page{size:letter portrait;margin:1.4cm}
        </style>
        </head><body>${content}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 400);
    };

    const concRow = (label, cant, monto, color) => (
      <tr>
        <td>{label}</td>
        <td className="r" style={{ color: '#666', fontSize: 10 }}>{cant}</td>
        <td className="r" style={{ color: color || '#111', fontWeight: color ? 700 : 400 }}>{bs(monto)}</td>
      </tr>
    );

    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>
              {modoReporte ? 'Reporte de Nómina de Cesta Ticket' : 'Pre-nómina de Cesta Ticket'}
            </span>
            {modoReporte
              ? <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft: 8 }}>{pnom.estado}</span>
              : <span className="badge badge-naranja" style={{ marginLeft: 8 }}>BORRADOR — pendiente de cierre</span>}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handlePrint}>Imprimir / Guardar PDF</button>
            <button className="btn btn-secondary"
              onClick={() => modoReporte ? setShowReporte(false) : setShowPreNomina(false)}>← Volver</button>
          </div>
        </div>
        <div id="prenomina-ct-content">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <h2 style={{ color: '#111', margin: 0 }}>{pemp?.razon_social || 'Empresa'}</h2>
            </div>
            {pemp?.logo_path && (
              <ImagenProtegida src="/empresas/logo" alt="Logo empresa"
                style={{ height: 56, maxWidth: 160, objectFit: 'contain' }} />
            )}
          </div>
          <div className="titulo" style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#111', letterSpacing: .5 }}>
            {modoReporte ? 'REPORTE DE NÓMINA DE CESTA TICKET' : 'PRE-NÓMINA DE CESTA TICKET'} / {cicloLabel}
          </div>
          <div className="meta" style={{ textAlign: 'center', fontSize: 12, color: '#555', marginBottom: 16 }}>
            RIF: <strong style={{ color: '#111' }}>{pemp?.rif || '—'}</strong> &nbsp;|&nbsp;
            Trabajadores: <strong style={{ color: '#111' }}>{pitems.length}</strong>
            {!modoReporte && <> &nbsp;|&nbsp; Tasa BCV: <strong style={{ color: '#111' }}>Bs. {ptasa.toFixed(2)}</strong></>}
          </div>

          {/* Detalle vertical por trabajador */}
          {pitems.map(i => (
            <div key={i.id} className="wcard"
              style={{ border: '1px solid #ddd', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
              <div className="wname" style={{ fontWeight: 700, fontSize: 13, color: '#111', borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 6 }}>
                {i.empleado_nombre} <span style={{ color: '#888', fontWeight: 400, fontSize: 11 }}>· C.I. {i.cedula}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {concRow('Días hábiles', `${i.dias_habiles || 0} días`, habBs(i))}
                  {concRow('Días de descanso', `${i.dias_descanso || 0} días`, desBs(i))}
                  {concRow('Días adicionales', `${i.dias_adicionales_cantidad || 0} días`, adicBs(i))}
                  {concRow('Total asignaciones', '', asigBs(i), '#1d4ed8')}
                  {concRow('Descuento por días de ausencia', `${i.descuento_ausencias_cantidad || 0} días`, ausBs(i), '#CC0000')}
                  {concRow('Total deducciones', '', dedBs(i), '#CC0000')}
                  {concRow('Neto a cobrar', '', netoBs(i), '#15803d')}
                </tbody>
              </table>
            </div>
          ))}

          {/* Resumen General */}
          <div className="resumen" style={{ border: '2px solid #111', borderRadius: 8, padding: '14px 16px', marginTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#111', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .5 }}>
              Resumen General
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                <tr>
                  <td>Cantidad de trabajadores</td>
                  <td className="r" style={{ fontWeight: 700, color: '#111' }}>{pitems.length}</td>
                </tr>
                <tr><td>Días hábiles</td><td className="r">{bs(sumBs(habBs))}</td></tr>
                <tr><td>Días de descanso</td><td className="r">{bs(sumBs(desBs))}</td></tr>
                <tr><td>Días adicionales</td><td className="r">{bs(sumBs(adicBs))}</td></tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>Total asignaciones</td>
                  <td className="r" style={{ fontWeight: 700, color: '#1d4ed8' }}>{bs(sumBs(asigBs))}</td>
                </tr>
                <tr><td>Descuento por días de ausencia</td><td className="r" style={{ color: '#CC0000' }}>{bs(sumBs(ausBs))}</td></tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>Total deducciones</td>
                  <td className="r" style={{ fontWeight: 700, color: '#CC0000' }}>{bs(sumBs(dedBs))}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700, fontSize: 13 }}>Neto a pagar</td>
                  <td className="r" style={{ fontWeight: 700, fontSize: 14, color: '#15803d' }}>{bs(sumBs(netoBs))}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: '#666' }}>
            {modoReporte
              ? `Reporte generado el ${dayjs().format('DD/MM/YYYY HH:mm')} — Nómina ${pnom.estado}.`
              : `Pre-nómina generada el ${dayjs().format('DD/MM/YYYY HH:mm')} — Estado BORRADOR, sujeta a cambios antes del cierre.`}
            {pusuario && <span> — Procesado por: <strong>{pusuario}</strong></span>}
          </div>
        </div>
      </div>
    );
  }

  // ── RESUMEN DE NÓMINA CESTA TICKET ───────────────────────────
  if (showResumen && prenominaData) {
    const { nomina: pnom, empresa: pemp, items: pitems } = prenominaData;
    const ptasa = Number(pnom.tasa_bcv || 1);
    const bs = n => `Bs. ${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const toBs = v => Number(v || 0) * ptasa;
    const tot = key => pitems.reduce((a, i) => a + Number(i[key] || 0), 0);

    const handlePrint = () => {
      const content = document.getElementById('resumen-ct-content').innerHTML;
      const w = window.open('', '_blank', 'width=1000,height=800');
      w.document.write(`<html><head><title>Resumen Nómina Cesta Ticket ${pnom.periodo}</title>
        <style>
          body{font-family:Arial,sans-serif;font-size:10px;color:#000;margin:0;padding:16px}
          h2{font-size:15px;margin:0;text-align:center}
          .titulo{text-align:center;font-weight:700;font-size:13px;margin:4px 0 10px}
          table{width:100%;border-collapse:collapse}
          th,td{border:1px solid #bbb;padding:4px 7px}
          th{background:#e8e8e8;font-weight:700}
          tfoot td{font-weight:700;background:#f5f5f5}
          .r{text-align:right}
          @page{size:letter landscape;margin:1.2cm}
        </style></head><body>${content}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 400);
    };

    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>Resumen de Nómina de Cesta Ticket</span>
            <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft: 8 }}>{pnom.estado}</span>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handlePrint}>Imprimir / Guardar PDF</button>
            <button className="btn btn-secondary" onClick={() => setShowResumen(false)}>← Volver</button>
          </div>
        </div>
        <div id="resumen-ct-content">
          <h2 style={{ color: '#111', textAlign: 'center', margin: 0 }}>{pemp?.razon_social || 'Empresa'}</h2>
          <div className="titulo" style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, color: '#111', margin: '4px 0 4px' }}>
            RESUMEN DE NÓMINA DE CESTA TICKET / {pnom.periodo}
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#555', marginBottom: 12 }}>
            RIF: <strong style={{ color: '#111' }}>{pemp?.rif || '—'}</strong> &nbsp;|&nbsp;
            Trabajadores: <strong style={{ color: '#111' }}>{pitems.length}</strong>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px' }}>Nombre</th>
                <th style={{ textAlign: 'center', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px' }}>C.I.</th>
                <th style={{ textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px' }}>CT base Bs.</th>
                <th style={{ textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px', color: '#1d4ed8' }}>Total asig. Bs.</th>
                <th style={{ textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px', color: '#CC0000' }}>Total deduc. Bs.</th>
                <th style={{ textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px', color: '#15803d' }}>Neto Bs.</th>
              </tr>
            </thead>
            <tbody>
              {pitems.map(i => (
                <tr key={i.id}>
                  <td className="fw-600" style={{ padding: '5px 9px', borderBottom: '1px solid #eee' }}>{i.empleado_nombre}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'center' }}>{i.letra_ci || 'V'}-{i.cedula}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'right' }}>{bs(toBs(i.cesta_ticket))}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'right', color: '#1d4ed8' }}>{bs(toBs(i.total_asignaciones))}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'right', color: '#CC0000' }}>{bs(toBs(i.total_deducciones))}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{bs(toBs(i.neto_pagar))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f5f5f5' }}>
                <td colSpan={2} style={{ padding: '7px 9px', fontWeight: 700 }}>TOTALES ({pitems.length} trabajadores)</td>
                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700 }}>{bs(toBs(tot('cesta_ticket')))}</td>
                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{bs(toBs(tot('total_asignaciones')))}</td>
                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700, color: '#CC0000' }}>{bs(toBs(tot('total_deducciones')))}</td>
                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{bs(toBs(tot('neto_pagar')))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  // ── ARCHIVO .TXT PARA PAGO — CESTA TICKET ────────────────────
  if (showTxtPago && prenominaData) {
    const { nomina: pnom, empresa: pemp, items: pitems } = prenominaData;
    const ptasa = Number(pnom.tasa_bcv || 1);
    const totalBs = pitems.reduce((a, i) => a + Number(i.neto_pagar || 0) * ptasa, 0);
    const bancoOk = !!configNomina.banco_pagador && !!configNomina.cuenta_origen;
    const formatoLabel = {
      TAB: 'Texto delimitado por tabulación',
      CSV_COMA: 'CSV — separado por coma',
      CSV_PUNTOCOMA: 'CSV — separado por punto y coma',
      ANCHO_FIJO: 'Ancho fijo (columnas alineadas)',
    }[configNomina.formato_txt || 'TAB'];

    const handleGenerarTXT = () => {
      try {
        const formato = configNomina.formato_txt || 'TAB';
        const incEnc  = configNomina.incluir_encabezado === undefined ? 1 : configNomina.incluir_encabezado;
        const sep     = formato === 'CSV_COMA' ? ',' : formato === 'CSV_PUNTOCOMA' ? ';' : '\t';
        const fechaPago = dayjs(txtFechaPago).format('DD/MM/YYYY');
        const rows = pitems.map((i, idx) => ({
          nro: String(idx + 1),
          cedula: `${i.letra_ci || 'V'}${i.cedula || ''}`,
          tipo: (i.tipo_cuenta || 'CORRIENTE').toUpperCase(),
          cuenta: String(i.numero_cuenta || '').replace(/[^0-9]/g, ''),
          nombre: i.empleado_nombre || '',
          monto: (Number(i.neto_pagar || 0) * ptasa).toFixed(2),
        }));
        let lines = [];
        if (formato === 'ANCHO_FIJO') {
          const pad  = (s, n) => String(s).padEnd(n).slice(0, n);
          const padL = (s, n) => String(s).padStart(n).slice(0, n);
          if (incEnc) lines.push(pad('CEDULA', 12) + pad('TIPO CTA', 12) + pad('CUENTA', 22) + pad('NOMBRE', 40) + padL('MONTO Bs.', 16));
          rows.forEach(r => lines.push(pad(r.cedula, 12) + pad(r.tipo, 12) + pad(r.cuenta, 22) + pad(r.nombre, 40) + padL(r.monto, 16)));
        } else {
          if (incEnc) lines.push(['CEDULA', 'TIPO_CUENTA', 'CUENTA', 'NOMBRE', 'MONTO_BS'].join(sep));
          rows.forEach(r => lines.push([r.cedula, r.tipo, r.cuenta, r.nombre, r.monto].join(sep)));
        }
        if (incEnc) {
          lines = [
            `EMPRESA${sep}${pemp?.razon_social || ''}`,
            `RIF${sep}${pemp?.rif || ''}`,
            `CONCEPTO${sep}PAGO DE CESTA TICKET`,
            `BANCO PAGADOR${sep}${configNomina.banco_pagador || 'NO CONFIGURADO'}`,
            `CUENTA ORIGEN${sep}${configNomina.tipo_cuenta_origen || 'CORRIENTE'} ${configNomina.cuenta_origen || 'NO CONFIGURADA'}`,
            `PERIODO${sep}${pnom.periodo}`,
            `FECHA DE PAGO${sep}${fechaPago}`,
            `TRABAJADORES${sep}${rows.length}`,
            `TOTAL Bs.${sep}${totalBs.toFixed(2)}`,
            ``,
            ...lines,
          ];
        }
        const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `PAGO_CESTA_TICKET_${pnom.periodo}_${dayjs(txtFechaPago).format('YYYYMMDD')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) { alert('Error al generar archivo'); }
    };

    const dato = (label, val) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee' }}>
        <span style={{ color: '#666' }}>{label}</span>
        <strong style={{ color: '#111' }}>{val}</strong>
      </div>
    );

    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>Archivo .TXT para pago de Cesta Ticket</span>
            <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft: 8 }}>{pnom.estado}</span>
          </div>
          <button className="btn btn-secondary" onClick={() => setShowTxtPago(false)}>← Volver</button>
        </div>
        <div style={{ maxWidth: 640 }}>
          <div className="card mb-4">
            <div className="card-header"><div className="card-title">Parámetros del pago</div></div>
            <div className="card-body">
              {dato('Empresa', pemp?.razon_social || '—')}
              {dato('Período', pnom.periodo)}
              {dato('Trabajadores', pitems.length)}
              {dato('Total a pagar', `Bs. ${totalBs.toFixed(2)}`)}
              {dato('Banco pagador', configNomina.banco_pagador || 'No configurado')}
              {dato('Cuenta origen', configNomina.cuenta_origen
                ? `${configNomina.tipo_cuenta_origen || 'CORRIENTE'} · ${configNomina.cuenta_origen}`
                : 'No configurada')}
              {dato('Formato del archivo', formatoLabel)}
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Fecha de ejecución del pago *</label>
                <input className="form-control" type="date" value={txtFechaPago}
                  onChange={e => setTxtFechaPago(e.target.value)} style={{ maxWidth: 220 }} />
              </div>
              {!bancoOk && (
                <div className="alert alert-warning" style={{ fontSize: 12, marginTop: 8 }}>
                  Faltan datos del banco pagador o la cuenta origen. Complételos en{' '}
                  <strong>Remuneraciones → Configuración → Parámetros bancarios</strong>.
                </div>
              )}
              <div style={{ marginTop: 18 }}>
                <button className="btn btn-primary" onClick={handleGenerarTXT} disabled={!txtFechaPago}>
                  Generar archivo .TXT
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── RECIBOS DE PAGO — CESTA TICKET ───────────────────────────
  if (showRecibos && prenominaData) {
    const { nomina: pnom, empresa: pemp, items: pitems, usuario_nombre: pusuario } = prenominaData;
    const ptasa = Number(pnom.tasa_bcv || 1);
    const toBs  = v => Number(v || 0) * ptasa;
    const fmtBs = n => `Bs. ${Number(n || 0).toFixed(2)}`;
    const fechaFmt = d => d ? dayjs(d).format('DD/MM/YYYY') : '—';

    const conceptosHTML = (i) => {
      const dailyCT  = Number(i.cesta_ticket || 0) / 30;
      const habBs    = Number(i.dias_habiles || 0) * dailyCT * ptasa;
      const desBs    = Number(i.dias_descanso || 0) * dailyCT * ptasa;
      const adicBs   = Number(i.dias_adicionales_usd || 0) * ptasa;
      const ausBs    = Number(i.descuento_ausencias_usd || 0) * ptasa;
      const asigBs   = Number(i.total_asignaciones || 0) * ptasa;
      const dedBs    = Number(i.total_deducciones || 0) * ptasa;
      const row = (label, cant, asig, dedu) =>
        `<tr><td>${label}</td><td style="text-align:center;color:#666;font-size:9px">${cant||''}</td><td style="text-align:right;color:#15803d">${asig!==null?fmtBs(asig):''}</td><td style="text-align:right;color:#c00">${dedu!==null?fmtBs(dedu):''}</td></tr>`;
      return [
        `<tr><td colspan="4" style="padding:4px 0 2px;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#15803d;border-bottom:1px solid #ddd">Asignaciones</td></tr>`,
        row('Días hábiles', `${i.dias_habiles||0} días`, habBs, null),
        row('Días de descanso', `${i.dias_descanso||0} días`, desBs, null),
        row('Días adicionales', `${i.dias_adicionales_cantidad||0} días`, adicBs, null),
        `<tr><td style="font-weight:700;color:#111">TOTAL ASIGNACIONES</td><td></td><td style="text-align:right;font-weight:700;color:#111">${fmtBs(asigBs)}</td><td></td></tr>`,
        `<tr><td colspan="4" style="padding:4px 0 2px;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#c00;border-bottom:1px solid #ddd">Deducciones</td></tr>`,
        row('Descuento por días de ausencia', `${i.descuento_ausencias_cantidad||0} días`, null, ausBs),
        `<tr><td style="font-weight:700;color:#c00">TOTAL DEDUCCIONES</td><td></td><td></td><td style="text-align:right;font-weight:700;color:#c00">${fmtBs(dedBs)}</td></tr>`,
      ].join('');
    };

    const reciboInner = (i) => {
      const netoBs = toBs(i.neto_pagar);
      const dato = (lbl, val) =>
        `<div class="rec-dato"><span class="rec-dlbl">${lbl}</span><span class="rec-dval">${val||'—'}</span></div>`;
      return `
        <div class="recibo">
          <div class="rec-emp">
            <div style="font-size:13px;font-weight:700">${pemp?.razon_social||'Empresa'}</div>
            <div style="font-size:9px;color:#555">RIF: ${pemp?.rif||'—'}</div>
          </div>
          <div class="rec-title">RECIBO DE PAGO DE CESTA TICKET</div>
          <div class="rec-datos">
            ${dato('Nombre', i.empleado_nombre)}
            ${dato('C.I.', `${i.letra_ci||'V'}-${i.cedula||''}`)}
            ${dato('Expediente', i.numero_expediente)}
            ${dato('Cargo', i.cargo)}
            ${dato('Departamento', i.departamento)}
            ${dato('Fecha de ingreso', fechaFmt(i.fecha_ingreso))}
            ${dato('Cuenta bancaria', i.numero_cuenta ? `${i.banco||''} ${i.numero_cuenta}`.trim() : '—')}
            ${dato('Correo', i.email)}
            ${dato('Período de nómina', pnom.periodo)}
          </div>
          <table class="rec-table">
            <thead><tr>
              <th style="text-align:left">CONCEPTOS</th>
              <th style="text-align:center">CANT.</th>
              <th style="text-align:right;color:#15803d">ASIG. (Bs.)</th>
              <th style="text-align:right;color:#c00">DEDU. (Bs.)</th>
            </tr></thead>
            <tbody>${conceptosHTML(i)}</tbody>
          </table>
          <div class="rec-neto">
            <span class="rec-neto-label">NETO A COBRAR</span>
            <span class="rec-neto-bs">Bs. ${netoBs.toFixed(2)}</span>
          </div>
          <div class="rec-firma">
            <div class="firma-box"><div class="firma-line"></div><div>Firma del trabajador</div></div>
            <div class="firma-box"><div class="firma-line"></div><div>Firma de la empresa</div></div>
          </div>
          <div class="rec-footer">${pusuario?`Procesado por: ${pusuario} | `:''}Generado el ${new Date().toLocaleDateString('es-VE')}</div>
        </div>`;
    };

    const reciboCSS = `
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0;padding:10px}
      .recibo{border:1px solid #ccc;border-radius:6px;padding:16px;margin:0 auto 16px;page-break-after:always;max-width:680px}
      .recibo:last-child{page-break-after:auto}
      .rec-emp{text-align:center;border-bottom:1px solid #ddd;padding-bottom:6px;margin-bottom:6px}
      .rec-title{text-align:center;font-weight:700;font-size:13px;letter-spacing:1px;background:#111;color:#fff;padding:6px;border-radius:4px;margin-bottom:10px}
      .rec-datos{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;margin-bottom:10px}
      .rec-dato{display:flex;justify-content:space-between;font-size:10px;border-bottom:1px dotted #e0e0e0;padding:3px 0;gap:8px}
      .rec-dlbl{color:#777;white-space:nowrap}
      .rec-dval{font-weight:700;color:#111;text-align:right}
      .rec-table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:4px}
      .rec-table thead th{padding:4px 6px;border-bottom:2px solid #ddd;font-size:9px;font-weight:700}
      .rec-table tbody td{padding:3px 6px;border-bottom:1px solid #f0f0f0}
      .rec-neto{display:flex;justify-content:space-between;align-items:center;background:#f0fdf4;border-top:2px solid #86efac;padding:10px 12px;border-radius:4px;margin:8px 0}
      .rec-neto-label{font-weight:700;font-size:13px;color:#15803d}
      .rec-neto-bs{font-weight:700;font-size:18px;color:#15803d}
      .rec-firma{display:flex;gap:40px;margin-top:24px}
      .firma-box{flex:1;text-align:center;font-size:9px;color:#555}
      .firma-line{border-top:1px solid #999;margin-bottom:4px;margin-top:30px}
      .rec-footer{font-size:9px;color:#888;margin-top:8px;text-align:right}
      @media print{body{padding:0} @page{size:letter portrait;margin:1.5cm} button{display:none}}
    `;

    const abrirVentana = (titulo, cuerpo, autoprint) => {
      const w = window.open('', '_blank', 'width=900,height=900');
      w.document.write(`<html><head><title>${titulo}</title><style>${reciboCSS}</style></head><body>${cuerpo}</body></html>`);
      w.document.close();
      if (autoprint) setTimeout(() => w.print(), 400);
    };
    const verRecibo = (i) => abrirVentana(`Recibo CT — ${i.empleado_nombre}`, reciboInner(i), false);
    const descargarReciboPDF = (i) => abrirVentana(`Recibo CT ${i.empleado_nombre} — ${pnom.periodo}`, reciboInner(i), true);
    const descargarTodos = () => abrirVentana(`Recibos Cesta Ticket — ${pnom.periodo}`, pitems.map(reciboInner).join(''), true);

    const enviarReciboEmail = async (i) => {
      if (!i.email) { alert(`${i.empleado_nombre} no tiene correo registrado.`); return; }
      if (!window.confirm(`¿Enviar el recibo de Cesta Ticket a ${i.email}?`)) return;
      setReciboEnviando(i.id);
      try {
        await api.post('/nomina/recibo/email', {
          empleado_id: i.empleado_id,
          asunto: `Recibo de pago de Cesta Ticket — ${pnom.periodo}`,
          html: `<html><head><meta charset="utf-8"><style>${reciboCSS}</style></head><body>${reciboInner(i)}</body></html>`,
        });
        alert(`Recibo enviado a ${i.email}`);
      } catch (e) {
        alert(e.response?.data?.error || 'No se pudo enviar el correo');
      } finally { setReciboEnviando(null); }
    };

    const iconBtn = (titulo, contenido, onClick, color) => (
      <button title={titulo} onClick={onClick}
        style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd', background: '#fff',
          cursor: 'pointer', fontSize: 15, lineHeight: 1, color: color || '#444' }}>
        {contenido}
      </button>
    );

    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>Recibos de pago de Cesta Ticket</span>
            <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft: 8 }}>{pnom.estado}</span>
          </div>
          <button className="btn btn-secondary"
            onClick={() => recibosModo === 'lista' ? setRecibosModo('inicio') : setShowRecibos(false)}>← Volver</button>
        </div>
        <div style={{ color: '#555', fontSize: 13, marginBottom: 20 }}>
          {pemp?.razon_social} | Período: <strong>{pnom.periodo}</strong> | {pitems.length} trabajador{pitems.length !== 1 ? 'es' : ''}
        </div>

        {recibosModo === 'inicio' && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <button onClick={() => setRecibosModo('lista')}
              style={{ flex: '1 1 280px', maxWidth: 360, textAlign: 'left', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 10, padding: 20, background: '#fff' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>👁️</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>Ver recibos de pago</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                Listado de trabajadores: visualizar, enviar por correo o descargar el recibo de cada uno.
              </div>
            </button>
            <button onClick={descargarTodos}
              style={{ flex: '1 1 280px', maxWidth: 360, textAlign: 'left', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 10, padding: 20, background: '#fff' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⬇️</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>Descargar todos los recibos de pago</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                Genera un único PDF con un recibo por hoja (tamaño carta, vertical) para todos los trabajadores.
              </div>
            </button>
          </div>
        )}

        {recibosModo === 'lista' && (
          <table>
            <thead>
              <tr>
                <th>#</th><th>Trabajador</th><th>C.I.</th><th>Cargo</th><th>Departamento</th><th>Correo</th>
                <th style={{ textAlign: 'right' }}>Neto a cobrar</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pitems.map((i, idx) => (
                <tr key={i.id}>
                  <td>{idx + 1}</td>
                  <td className="fw-600">{i.empleado_nombre}</td>
                  <td>{i.letra_ci || 'V'}-{i.cedula}</td>
                  <td>{i.cargo || '—'}</td>
                  <td>{i.departamento || '—'}</td>
                  <td style={{ fontSize: 12, color: i.email ? '#444' : '#c00' }}>{i.email || 'Sin correo'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{fmtBs(toBs(i.neto_pagar))}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      {iconBtn('Ver recibo', '👁️', () => verRecibo(i), '#1d4ed8')}
                      {iconBtn(i.email ? 'Enviar al correo del trabajador' : 'Sin correo registrado',
                        reciboEnviando === i.id ? '…' : '✉️', () => enviarReciboEmail(i), '#b45309')}
                      {iconBtn('Descargar PDF individual', '⬇️', () => descargarReciboPDF(i), '#15803d')}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── DETALLE NÓMINA CESTA TICKET ──────────────────────────────
  if (selected) {
    const roStyle = { background: '#1a1a1a', color: '#ccc' };
    const fi = (key, label) => (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <input className="form-control" type="number" min="0" step="0.01"
          value={formItem[key] ?? ''} onChange={e => setFormItem({ ...formItem, [key]: e.target.value })} />
      </div>
    );
    const ro = (label, val, red = false) => (
      <div className="form-group">
        <label className="form-label" style={{ color: red ? '#CC0000' : undefined }}>{label}</label>
        <input className="form-control" readOnly value={val} style={roStyle} />
      </div>
    );

    return (
      <div>
        <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>← Volver</button>
            <span style={{ marginLeft: 12, fontWeight: 700, fontSize: 16 }}>
              Cesta Ticket {selected.periodo}
            </span>
            <span className={`badge ${estadoNomBadge[selected.estado]}`} style={{ marginLeft: 6 }}>
              {selected.estado}
            </span>
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {selected.estado === 'BORRADOR' && (
              <>
                <button className="btn btn-secondary" onClick={handleProcesar} disabled={procesando}>
                  {procesando ? 'Procesando...' : 'Calcular automático'}
                </button>
                {items.length > 0 && (
                  <button className="btn btn-secondary" onClick={handleVerPreNomina}>
                    Ver Pre-nómina
                  </button>
                )}
                <button className="btn btn-primary" onClick={handleCerrar}>Cerrar nómina</button>
              </>
            )}
            {selected.estado !== 'BORRADOR' && (
              <>
                <button className="btn btn-secondary" onClick={() => abrirReporteCT(setShowResumen)}>
                  Resumen de nómina de CT
                </button>
                <button className="btn btn-secondary" onClick={() => abrirReporteCT(setShowReporte)}>
                  Reporte de nómina de CT
                </button>
                <button className="btn btn-secondary" onClick={() => abrirReporteCT(setShowTxtPago, () => setTxtFechaPago(dayjs().format('YYYY-MM-DD')))}>
                  Archivo .TXT para pago de CT
                </button>
                <button className="btn btn-secondary" onClick={() => abrirReporteCT(setShowRecibos, () => setRecibosModo('inicio'))}>
                  Recibos de pago de CT
                </button>
              </>
            )}
          </div>
        </div>

        {resumen?.totales && (
          <div className="kpi-grid mb-4">
            <div className="kpi-card azul">
              <div className="kpi-label">Trabajadores</div>
              <div className="kpi-value">{resumen.totales.total_empleados || 0}</div>
            </div>
            <div className="kpi-card verde">
              <div className="kpi-label">Total neto a pagar</div>
              <div className="kpi-value">{fmt(resumen.totales.total_neto)}</div>
              <div className="kpi-sub">Bs. {(Number(resumen.totales.total_neto) * tasa).toLocaleString('es-VE', { maximumFractionDigits: 2 })}</div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <div className="card-title">Detalle por trabajador — Cesta Ticket</div>
            <div className="text-sm text-gris">Tasa BCV: Bs. {Number(tasa).toFixed(2)}</div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Trabajador</th><th>Cédula</th>
                  <th style={{ textAlign: 'right' }}>Cesta Ticket base Bs.</th>
                  <th style={{ textAlign: 'right', color: '#1d4ed8' }}>Total asignaciones Bs.</th>
                  <th style={{ textAlign: 'right', color: '#CC0000' }}>Total deducciones Bs.</th>
                  <th style={{ textAlign: 'right', color: '#15803d' }}>Neto a cobrar Bs.</th>
                  {selected.estado === 'BORRADOR' && <th>Ajustar</th>}
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id}>
                    <td className="fw-600">{i.empleado_nombre}</td>
                    <td className="text-gris text-sm">{i.cedula}</td>
                    <td style={{ textAlign: 'right' }}>{fmtBS(i.cesta_ticket)}</td>
                    <td style={{ textAlign: 'right', color: '#1d4ed8' }}>{fmtBS(i.total_asignaciones)}</td>
                    <td style={{ textAlign: 'right', color: '#CC0000' }}>{fmtBS(i.total_deducciones)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{fmtBS(i.neto_pagar)}</td>
                    {selected.estado === 'BORRADOR' && (
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleEditItem(i)}>
                          Ajustar Cesta Ticket de trabajador
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={selected.estado === 'BORRADOR' ? 7 : 6} className="text-gris text-sm" style={{ textAlign: 'center', padding: 24 }}>
                    Sin datos. Usa "Calcular automático" para procesar.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {editItem && (
          <div style={{ position: 'fixed', left: 'var(--sidebar-w)', top: 'var(--header-h)', right: 0, bottom: 0, background: 'var(--gris-claro)', zIndex: 500, overflowY: 'auto', padding: 24 }}>
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
              <div className="flex items-center justify-between mb-4">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditItem(null)}>← Volver</button>
                <span style={{ fontWeight: 700, fontSize: 16 }}>Ajustar Cesta Ticket de trabajador: {editItem.empleado_nombre}</span>
                <div />
              </div>
              <div className="card"><div className="card-body">
                <div style={{ background: '#1a1a1a', borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 13, color: '#ccc' }}>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <span><strong>Cesta Ticket mensual:</strong> $ {Number(editItem.cesta_ticket || 0).toFixed(2)}</span>
                    <span><strong>Cesta Ticket diario:</strong> $ {Number(computedCT.dailyCesta || 0).toFixed(4)}</span>
                    <span><strong>Tasa BCV:</strong> Bs. {Number(tasa).toFixed(2)}</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: '#888' }}>
                    Cesta Ticket diario = Cesta Ticket mensual ÷ 30.
                  </div>
                </div>

                <div style={{ fontWeight: 700, fontSize: 11, color: '#22c55e', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Asignaciones</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {fi('dias_habiles', 'Días hábiles')}
                  {ro('Días hábiles en USD (auto)', `$ ${Number(computedCT.dias_habiles_usd || 0).toFixed(4)}`)}
                  {ro('Días hábiles en Bs. (auto)', `Bs. ${Number(computedCT.dias_habiles_bs || 0).toFixed(2)}`)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {fi('dias_descanso', 'Días de descanso')}
                  {ro('Días de descanso en USD (auto)', `$ ${Number(computedCT.dias_descanso_usd || 0).toFixed(4)}`)}
                  {ro('Días de descanso en Bs. (auto)', `Bs. ${Number(computedCT.dias_descanso_bs || 0).toFixed(2)}`)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {fi('dias_adicionales_cantidad', 'Días adicionales')}
                  {ro('Días adicionales en USD (auto)', `$ ${Number(computedCT.dias_adicionales_usd || 0).toFixed(4)}`)}
                  {ro('Días adicionales en Bs. (auto)', `Bs. ${Number(computedCT.dias_adicionales_bs || 0).toFixed(2)}`)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div />
                  {ro('Total asignaciones en USD', `$ ${Number(computedCT.total_asig || 0).toFixed(2)}`)}
                  {ro('Total asignaciones en Bs.', `Bs. ${Number(computedCT.total_asig_bs || 0).toFixed(2)}`)}
                </div>

                <div style={{ borderTop: '1px solid #CC0000', margin: '4px 0 16px', paddingTop: 10, fontWeight: 700, fontSize: 11, color: '#CC0000', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Deducciones
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {fi('descuento_ausencias_cantidad', 'Días de ausencia')}
                  {ro('Descuento por días de ausencia en USD (auto)', `$ ${Number(computedCT.descuento_ausencias_usd || 0).toFixed(4)}`, true)}
                  {ro('Descuento por días de ausencia en Bs. (auto)', `Bs. ${Number(computedCT.descuento_ausencias_bs || 0).toFixed(2)}`, true)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div />
                  {ro('Total deducciones en USD', `$ ${Number(computedCT.total_deduc || 0).toFixed(2)}`, true)}
                  {ro('Total deducciones en Bs.', `Bs. ${Number(computedCT.total_deduc_bs || 0).toFixed(2)}`, true)}
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label">Notas</label>
                  <textarea className="form-control" rows={3} style={{ resize: 'vertical' }}
                    value={formItem.notas || ''}
                    onChange={e => setFormItem({ ...formItem, notas: e.target.value })}
                    placeholder="Observaciones del ajuste de Cesta Ticket para este trabajador..." />
                </div>

                <div style={{ background: '#1a1a1a', borderRadius: 6, padding: 10, fontSize: 13, color: '#ccc' }}>
                  <span>Neto a cobrar: </span>
                  <strong style={{ color: '#22c55e' }}>$ {Number(computedCT.neto || 0).toFixed(2)}</strong>
                  <span style={{ color: '#aaa', marginLeft: 12 }}>
                    Bs. {Number(computedCT.neto_bs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => setEditItem(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSaveItem}>Guardar ajustes</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── LISTA CESTA TICKET ────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 style={{ fontWeight: 700 }}>Períodos de nómina — Cesta Ticket</h3>
        <button className="btn btn-primary" onClick={() => setModalNueva(true)}>+ Nueva nómina Cesta Ticket</button>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Período</th><th>Estado</th><th>Tasa BCV</th><th>Fecha cierre</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {nominas.map(n => (
                <tr key={n.id}>
                  <td className="fw-600">{n.periodo}</td>
                  <td><span className={`badge ${estadoNomBadge[n.estado]}`}>{n.estado}</span></td>
                  <td>{n.tasa_bcv ? `Bs. ${Number(n.tasa_bcv).toFixed(2)}` : '—'}</td>
                  <td>{n.closed_at ? dayjs(n.closed_at).format('DD/MM/YY HH:mm') : '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => loadDetalle(n)}>
                      Ver detalle
                    </button>
                    {n.estado === 'BORRADOR' && (
                      <button className="btn btn-sm" style={{ background: '#7f1d1d', color: '#fff' }}
                        onClick={() => handleEliminar(n)}>
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {nominas.length === 0 && (
                <tr><td colSpan={5} className="text-gris text-sm" style={{ textAlign: 'center', padding: 24 }}>
                  No hay nóminas de Cesta Ticket. Crea una para comenzar.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalNueva && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <div className="modal-title">Nueva nómina Cesta Ticket</div>
              <button className="modal-close" onClick={() => setModalNueva(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Período *</label>
                <input type="month" className="form-control" value={formNueva.periodo}
                  onChange={e => setFormNueva({ ...formNueva, periodo: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ color: '#aaa' }}>Frecuencia</label>
                <input className="form-control" value="Mensual (único)" readOnly
                  style={{ background: '#1a1a1a', color: '#ccc' }} />
                <div className="text-sm text-gris" style={{ marginTop: 4 }}>La nómina de Cesta Ticket siempre es mensual.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Observaciones</label>
                <textarea className="form-control" rows={2} value={formNueva.observaciones}
                  onChange={e => setFormNueva({ ...formNueva, observaciones: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalNueva(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCrear}>Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// VACACIONES — TABLAS DE CÁLCULO (LOTTT + feriados nacionales VE)
// ─────────────────────────────────────────────────────────────

// Domingo de Pascua — algoritmo de Gauss / "Anonymous Gregorian computus"
function domingoPascua(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);   // 3 = marzo, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return dayjs(`${year}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`);
}

// Feriados nacionales de Venezuela de un año → Set de fechas 'YYYY-MM-DD'
const _feriadosCache = {};
function feriadosVenezuela(year) {
  if (_feriadosCache[year]) return _feriadosCache[year];
  const f = new Set();
  const fix = (m, d) => f.add(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  // Fijos
  fix(1, 1);    // Año Nuevo
  fix(4, 19);   // Declaración de la Independencia
  fix(5, 1);    // Día del Trabajador
  fix(6, 24);   // Batalla de Carabobo
  fix(7, 5);    // Día de la Independencia
  fix(7, 24);   // Natalicio del Libertador
  fix(10, 12);  // Día de la Resistencia Indígena
  fix(12, 24);  // Nochebuena
  fix(12, 25);  // Navidad
  fix(12, 31);  // Fin de Año
  // Variables — Carnaval y Semana Santa, derivados del Domingo de Pascua
  const p = domingoPascua(year);
  f.add(p.subtract(48, 'day').format('YYYY-MM-DD')); // Lunes de Carnaval
  f.add(p.subtract(47, 'day').format('YYYY-MM-DD')); // Martes de Carnaval
  f.add(p.subtract(3, 'day').format('YYYY-MM-DD'));  // Jueves Santo
  f.add(p.subtract(2, 'day').format('YYYY-MM-DD'));  // Viernes Santo
  _feriadosCache[year] = f;
  return f;
}

// ¿La fecha (dayjs) es feriado nacional de Venezuela?
function esFeriadoVE(d) {
  return feriadosVenezuela(d.year()).has(d.format('YYYY-MM-DD'));
}

// Días de disfrute y bono vacacional según el número de período (LOTTT art. 190/192)
// Período 1 = 15 / 15 ; +1 día por período posterior ; tope 30 / 30 (período 16)
function diasVacacionesPeriodo(n) {
  const dias = Math.min(15 + Math.max(0, Math.floor(n) - 1), 30);
  return { disfrute: dias, bono: dias };
}

// ─────────────────────────────────────────────────────────────
// VACACIONES TAB
// ─────────────────────────────────────────────────────────────
function VacacionesTab() {
  const [empleados, setEmpleados]         = useState([]);
  const [buscar, setBuscar]               = useState('');
  const [selEmp, setSelEmp]               = useState(null);
  const [calculos, setCalculos]           = useState([]);
  const [loadingCalc, setLoadingCalc]     = useState(false);
  const [modal, setModal]                 = useState(false);
  const [tasaBCV, setTasaBCV]             = useState(1);
  const [monedaNomina, setMonedaNomina]   = useState('USD');
  const [vistaHistorico, setVistaHistorico] = useState(false);
  const [historicoData, setHistoricoData]   = useState([]);
  const [filtroAno, setFiltroAno]           = useState('');
  const [loadingHist, setLoadingHist]       = useState(false);
  const [editId, setEditId]                 = useState(null);   // id del cálculo en edición (Ajustar)
  const [configNomina, setConfigNomina]     = useState({});
  const [txtCalc, setTxtCalc]               = useState(null);   // cálculo cuyo panel .TXT está abierto
  const [txtFechaVac, setTxtFechaVac]       = useState(dayjs().format('YYYY-MM-DD'));
  const [reciboEnviandoVac, setReciboEnviandoVac] = useState(null);

  const emptyForm = {
    periodo_inicio: '', periodo_fin: '', fecha_reintegro: '',
    anios_servicio: 1,
    dias_habiles_disfrute: 15, dias_descanso_periodo: 0, dias_bono_vacacional: 15,
    lunes_periodo_vac: 1, lunes_modo_vac: 'auto',
    salario_base: '', moneda: 'BS', tasa_bcv: 1,
    observaciones: '',
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    // Solo empleados activos (sin fecha_egreso) para el autocomplete de vacaciones
    api.get('/nomina/empleados').then(r => setEmpleados(r.data.filter(e => !e.fecha_egreso))).catch(() => {});
    api.get('/tasas/actual').then(r => { setTasaBCV(r.data.tasa || 1); }).catch(() => {});
    api.get('/nomina/config').then(r => {
      setMonedaNomina(r.data.moneda_nomina || 'USD');
      setConfigNomina(r.data || {});
    }).catch(() => {});
  }, []);

  const loadCalcEmp = async (emp) => {
    setSelEmp(emp);
    setLoadingCalc(true);
    try {
      const r = await api.get(`/nomina/vacaciones?empleado_id=${emp.id}`);
      // Todos los cálculos del trabajador, ordenados por periodo más reciente primero
      const sorted = [...r.data].sort((a, b) => (b.periodo_inicio || '').localeCompare(a.periodo_inicio || ''));
      setCalculos(sorted);
    } catch { setCalculos([]); }
    setLoadingCalc(false);
  };

  const loadHistorico = async () => {
    setLoadingHist(true);
    setVistaHistorico(true);
    try {
      const r = await api.get('/nomina/vacaciones');
      setHistoricoData(r.data);
    } catch { setHistoricoData([]); }
    setLoadingHist(false);
  };

  const handleEliminar = async (id) => {
    if (!confirm('¿Eliminar este cálculo de vacaciones?')) return;
    try {
      await api.delete(`/nomina/vacaciones/${id}`);
      if (vistaHistorico) loadHistorico();
      else if (selEmp) loadCalcEmp(selEmp);
    } catch (e) { alert(e.response?.data?.error || 'Error al eliminar'); }
  };

  // Cuando cambia anios_servicio, recalcula días según la tabla LOTTT
  const handleAnios = (val) => {
    const a = Math.max(1, Number(val) || 1);
    const { disfrute, bono } = diasVacacionesPeriodo(a);
    setForm(f => ({ ...f, anios_servicio: a, dias_habiles_disfrute: disfrute, dias_bono_vacacional: bono }));
  };

  // Calcular automático: fecha reintegro, días descanso, lunes del período
  const handleCalcular = () => {
    if (!form.periodo_inicio) return alert('Ingresa la fecha de inicio del disfrute.');
    if (!form.salario_base)   return alert('Ingresa el salario base mensual.');

    const anios = Math.max(1, Number(form.anios_servicio) || 1);
    const { disfrute: diasHab, bono: diasBono } = diasVacacionesPeriodo(anios);

    // Día de descanso = sábado, domingo o feriado nacional
    const esDescanso = dt => dt.day() === 0 || dt.day() === 6 || esFeriadoVE(dt);

    // Avanzar diasHab días hábiles (L-V, sin feriados) desde la fecha de inicio
    const inicio = dayjs(form.periodo_inicio);
    let contados = 0;
    let cursor   = inicio;
    while (contados < diasHab) {
      if (!esDescanso(cursor)) contados++;
      if (contados < diasHab) cursor = cursor.add(1, 'day');
    }
    // cursor = último día hábil de disfrute = periodo_fin
    const periodoFin = cursor;
    // fecha_reintegro = siguiente día hábil después del último día
    let reintegro = periodoFin.add(1, 'day');
    while (esDescanso(reintegro)) {
      reintegro = reintegro.add(1, 'day');
    }

    // Contar días de descanso (sáb + dom + feriados) entre inicio y periodoFin (inclusive)
    let diasDescanso = 0;
    let d = inicio;
    while (!d.isAfter(periodoFin)) {
      if (esDescanso(d)) diasDescanso++;
      d = d.add(1, 'day');
    }

    // Contar lunes en el período vacacional (inicio → periodoFin inclusive)
    let lunesPeriodo = 0;
    d = inicio;
    while (!d.isAfter(periodoFin)) {
      if (d.day() === 1) lunesPeriodo++;
      d = d.add(1, 'day');
    }
    if (lunesPeriodo === 0) lunesPeriodo = 1;

    setForm(f => ({
      ...f,
      dias_habiles_disfrute: diasHab,
      dias_bono_vacacional:  diasBono,
      dias_descanso_periodo: diasDescanso,
      periodo_fin:           periodoFin.format('YYYY-MM-DD'),
      fecha_reintegro:       reintegro.format('YYYY-MM-DD'),
      lunes_periodo_vac:     lunesPeriodo,
      lunes_modo_vac:        'auto',
    }));
  };

  // Cálculos automáticos — montos primarios en Bs.; USD = Bs. / tasa BCV del momento
  const tasa        = Number(tasaBCV) || 1;
  const salBase     = Number(form.salario_base) || 0;   // salario mensual en Bs.
  const salDiario   = salBase / 30;                      // salario diario vacaciones en Bs.
  const isBS        = true;                              // las vacaciones se calculan en Bs.
  const toUSD = v => tasa > 0 ? v / tasa : 0;            // Bs. → USD con la tasa del momento
  const toBS  = v => v;                                  // los montos ya están en Bs.

  const diasHabilesF  = Number(form.dias_habiles_disfrute) || 0;
  const diasDescansoF = Number(form.dias_descanso_periodo)  || 0;
  const diasBonoF     = Number(form.dias_bono_vacacional)   || 0;

  // Feriados nacionales (en día de semana) que caen dentro del período de disfrute
  const feriadosEnPeriodo = (() => {
    if (!form.periodo_inicio || !form.periodo_fin) return [];
    const out = [];
    let d = dayjs(form.periodo_inicio);
    const fin = dayjs(form.periodo_fin);
    while (!d.isAfter(fin)) {
      if (esFeriadoVE(d) && d.day() !== 0 && d.day() !== 6) out.push(d.format('DD/MM/YYYY'));
      d = d.add(1, 'day');
    }
    return out;
  })();

  const montoHabiles  = salDiario * diasHabilesF;
  const montoDescanso = salDiario * diasDescansoF;
  const montoBono     = salDiario * diasBonoF;
  const montoTotal    = montoHabiles + montoDescanso + montoBono;

  // Retenciones sobre el período vacacional
  const SALARIO_MIN_BS  = 130;
  const salMinPri       = isBS ? SALARIO_MIN_BS : SALARIO_MIN_BS / tasa;
  const lunesPeriodoVac = Number(form.lunes_periodo_vac) || 1;
  const baseSemanalVac  = salBase * 12 / 52;
  const baseIvssVac     = baseSemanalVac * lunesPeriodoVac;
  const ivssVac         = Math.min(baseIvssVac, salMinPri * 5)  * 0.04;
  const rpeVac          = Math.min(baseIvssVac, salMinPri * 10) * 0.005;
  const faovVac         = (salBase + montoBono) * 0.01;
  const totalRetencVac  = ivssVac + rpeVac + faovVac;
  const netoVac         = montoTotal - totalRetencVac;

  // legacy alias for components that might reference montoVac
  const montoVac = montoHabiles;

  const handleSave = async () => {
    if (!selEmp)             return alert('Selecciona un trabajador primero.');
    if (!form.periodo_inicio || !form.periodo_fin) return alert('El período es obligatorio.');
    if (!form.salario_base)  return alert('El salario base es obligatorio.');
    try {
      const payload = {
        empleado_id:          selEmp.id,
        periodo_inicio:       form.periodo_inicio,
        periodo_fin:          form.periodo_fin,
        fecha_reintegro:      form.fecha_reintegro || null,
        anios_servicio:       form.anios_servicio,
        dias_vacaciones:      form.dias_habiles_disfrute,
        dias_bono_vacacional: form.dias_bono_vacacional,
        dias_descanso_periodo: form.dias_descanso_periodo || 0,
        lunes_periodo_vac:    lunesPeriodoVac,
        salario_base:         salBase,
        moneda:               'BS',
        tasa_bcv:             tasa,
        // Montos por concepto
        monto_vacaciones_usd: toUSD(montoHabiles),
        monto_vacaciones_bs:  toBS(montoHabiles),
        monto_descanso_usd:   toUSD(montoDescanso),
        monto_descanso_bs:    toBS(montoDescanso),
        monto_bono_usd:       toUSD(montoBono),
        monto_bono_bs:        toBS(montoBono),
        monto_total_usd:      toUSD(montoTotal),
        monto_total_bs:       toBS(montoTotal),
        // Retenciones
        ivss_usd:  toUSD(ivssVac),   ivss_bs:  toBS(ivssVac),
        rpe_usd:   toUSD(rpeVac),    rpe_bs:   toBS(rpeVac),
        faov_usd:  toUSD(faovVac),   faov_bs:  toBS(faovVac),
        observaciones: form.observaciones || null,
      };
      if (editId) await api.put(`/nomina/vacaciones/${editId}`, payload);
      else        await api.post('/nomina/vacaciones', payload);
      setModal(false);
      setEditId(null);
      setForm({ ...emptyForm });
      if (selEmp) loadCalcEmp(selEmp);
    } catch (e) { alert(e.response?.data?.error || 'Error al guardar'); }
  };

  // Abrir el modal en modo edición ("Ajustar")
  const handleAjustar = (c) => {
    setEditId(c.id);
    setForm({
      periodo_inicio:  (c.periodo_inicio || '').slice(0, 10),
      periodo_fin:     (c.periodo_fin || '').slice(0, 10),
      fecha_reintegro: (c.fecha_reintegro || '').slice(0, 10),
      anios_servicio:  c.anios_servicio || 1,
      dias_habiles_disfrute: c.dias_vacaciones || 15,
      dias_descanso_periodo: c.dias_descanso_periodo || 0,
      dias_bono_vacacional:  c.dias_bono_vacacional || 15,
      lunes_periodo_vac: c.lunes_periodo_vac || 1,
      lunes_modo_vac: 'manual',
      salario_base: c.salario_base || '',
      moneda: 'BS', tasa_bcv: c.tasa_bcv || tasaBCV,
      observaciones: c.observaciones || '',
    });
    setModal(true);
  };

  // Aprobar un cálculo de vacaciones (BORRADOR → APROBADA)
  const handleAprobar = async (c) => {
    if (!window.confirm('¿Aprobar este cálculo de vacaciones? Después de aprobado no podrá editarse.')) return;
    try {
      await api.post(`/nomina/vacaciones/${c.id}/aprobar`);
      if (selEmp) loadCalcEmp(selEmp);
    } catch (e) { alert(e.response?.data?.error || 'Error al aprobar'); }
  };

  const sugeridos = empleados.filter(e =>
    buscar.length >= 2 &&
    `${e.nombre} ${e.apellido} ${e.cedula}`.toLowerCase().includes(buscar.toLowerCase())
  ).slice(0, 8);

  const fmtUSD = v => `$ ${Number(v || 0).toFixed(2)}`;
  const fmtBs  = v => `Bs. ${Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Montos consolidados de un cálculo de vacaciones (Bs.)
  const calcVac = c => {
    const vac    = Number(c.monto_vacaciones_bs || 0) + Number(c.monto_descanso_bs || 0);
    const bono   = Number(c.monto_bono_bs || 0);
    const retenc = Number(c.ivss_bs || 0) + Number(c.rpe_bs || 0) + Number(c.faov_bs || 0);
    const total  = Number(c.monto_total_bs || 0);
    return { vac, bono, retenc, total, neto: total - retenc };
  };
  const periodoLabel = c => `${dayjs(c.periodo_inicio).format('DD/MM/YYYY')} – ${dayjs(c.periodo_fin).format('DD/MM/YYYY')}`;
  const esBorrador   = c => c.estado === 'BORRADOR' || !c.estado;

  // CSS común de documentos imprimibles de vacaciones (recibo / pre-cálculo)
  const vacDocCSS = `
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0;padding:16px}
    .doc{max-width:680px;margin:0 auto}
    .doc-title{text-align:center;font-weight:700;font-size:14px;letter-spacing:1px;background:#111;color:#fff;padding:7px;border-radius:4px;margin-bottom:6px}
    .doc-leyenda{text-align:center;font-size:10px;color:#666;margin-bottom:12px}
    .datos{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;margin-bottom:12px}
    .dato{display:flex;justify-content:space-between;font-size:10px;border-bottom:1px dotted #e0e0e0;padding:3px 0;gap:8px}
    .dato .lbl{color:#777;white-space:nowrap}
    .dato .val{font-weight:700;color:#111;text-align:right}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th{background:#f0f0f0;text-align:left;padding:5px 8px;border-bottom:2px solid #ddd;font-size:9px;text-transform:uppercase;letter-spacing:.5px}
    td{padding:4px 8px;border-bottom:1px solid #f0f0f0}
    .r{text-align:right}
    .neto{display:flex;justify-content:space-between;align-items:center;background:#f0fdf4;border-top:2px solid #86efac;padding:10px 12px;border-radius:4px;margin-top:8px}
    .neto-lbl{font-weight:700;font-size:13px;color:#15803d}
    .neto-val{font-weight:700;font-size:18px;color:#15803d}
    .firma{display:flex;gap:40px;margin-top:30px}
    .firma-box{flex:1;text-align:center;font-size:9px;color:#555}
    .firma-line{border-top:1px solid #999;margin-top:34px;margin-bottom:4px}
    @media print{body{padding:0} @page{size:letter portrait;margin:1.6cm}}
  `;

  // Cuerpo HTML de un documento de vacaciones — modo 'recibo' | 'precalc'
  const vacDocBody = (c, modo) => {
    const m = calcVac(c);
    const titulo  = modo === 'recibo' ? 'RECIBO DE PAGO DE VACACIONES' : 'PRE-CÁLCULO DE VACACIONES';
    const leyenda = modo === 'recibo'
      ? `Recibo generado el ${dayjs().format('DD/MM/YYYY')}.`
      : `Pre-cálculo generada el ${dayjs().format('DD/MM/YYYY')} — Estado BORRADOR, sujeta a cambios.`;
    const dato = (l, v) => `<div class="dato"><span class="lbl">${l}</span><span class="val">${v || '—'}</span></div>`;
    const row = (concepto, cant, montoBs, bold) =>
      `<tr><td${bold ? ' style="font-weight:700"' : ''}>${concepto}</td><td class="r" style="color:#666">${cant}</td><td class="r"${bold ? ' style="font-weight:700"' : ''}>${fmtBs(montoBs)}</td></tr>`;
    return `
      <div class="doc">
        <div class="doc-title">${titulo}</div>
        <div class="doc-leyenda">${leyenda}</div>
        <div class="datos">
          ${dato('Nombre', c.empleado_nombre)}
          ${dato('C.I.', `${c.letra_ci || 'V'}-${c.cedula || ''}`)}
          ${dato('Expediente', c.numero_expediente)}
          ${dato('Cargo', c.cargo)}
          ${dato('Departamento', c.departamento)}
          ${dato('Fecha de ingreso', c.fecha_ingreso ? dayjs(c.fecha_ingreso).format('DD/MM/YYYY') : '—')}
          ${dato('Cuenta bancaria', c.numero_cuenta ? `${c.banco || ''} ${c.numero_cuenta}`.trim() : '—')}
          ${dato('Correo', c.email)}
          ${dato('Período de disfrute', periodoLabel(c))}
          ${dato('Fecha de reintegro', c.fecha_reintegro ? dayjs(c.fecha_reintegro).format('DD/MM/YYYY') : '—')}
          ${dato('Años de servicio', c.anios_servicio)}
        </div>
        <table>
          <thead><tr><th>Concepto</th><th class="r">Cantidad</th><th class="r">Monto Bs.</th></tr></thead>
          <tbody>
            ${row('Días hábiles de disfrute', `${c.dias_vacaciones || 0} días`, Number(c.monto_vacaciones_bs || 0))}
            ${row('Días de descanso (fer + sáb + dom)', `${c.dias_descanso_periodo || 0} días`, Number(c.monto_descanso_bs || 0))}
            ${row('Bono vacacional', `${c.dias_bono_vacacional || 0} días`, Number(c.monto_bono_bs || 0))}
            ${row('TOTAL ASIGNACIONES', '', m.total, true)}
            ${row('IVSS trabajador (4%)', '', Number(c.ivss_bs || 0))}
            ${row('RPE trabajador (0,5%)', '', Number(c.rpe_bs || 0))}
            ${row('FAOV (1%)', '', Number(c.faov_bs || 0))}
            ${row('TOTAL RETENCIONES', '', m.retenc, true)}
          </tbody>
        </table>
        <div class="neto">
          <span class="neto-lbl">NETO A PAGAR</span>
          <span class="neto-val">${fmtBs(m.neto)}</span>
        </div>
        ${modo === 'recibo' ? `
        <div class="firma">
          <div class="firma-box"><div class="firma-line"></div><div>Firma del trabajador</div></div>
          <div class="firma-box"><div class="firma-line"></div><div>Firma de la empresa</div></div>
        </div>` : ''}
      </div>`;
  };

  const abrirVacDoc = (c, modo, autoprint) => {
    const w = window.open('', '_blank', 'width=900,height=900');
    const t = modo === 'recibo'
      ? `Recibo vacaciones — ${c.empleado_nombre}`
      : `Pre-cálculo vacaciones — ${c.empleado_nombre}`;
    w.document.write(`<html><head><meta charset="utf-8"><title>${t}</title><style>${vacDocCSS}</style></head><body>${vacDocBody(c, modo)}</body></html>`);
    w.document.close();
    if (autoprint) setTimeout(() => w.print(), 400);
  };
  const verPrecalculo      = c => abrirVacDoc(c, 'precalc', true);
  const verReciboVac       = c => abrirVacDoc(c, 'recibo', false);
  const descargarReciboVac = c => abrirVacDoc(c, 'recibo', true);

  const enviarReciboVac = async (c) => {
    if (!c.email) { alert(`${c.empleado_nombre} no tiene correo registrado.`); return; }
    if (!window.confirm(`¿Enviar el recibo de vacaciones a ${c.email}?`)) return;
    setReciboEnviandoVac(c.id);
    try {
      await api.post('/nomina/recibo/email', {
        empleado_id: c.empleado_id,
        asunto: `Recibo de pago de vacaciones — ${periodoLabel(c)}`,
        html: `<html><head><meta charset="utf-8"><style>${vacDocCSS}</style></head><body>${vacDocBody(c, 'recibo')}</body></html>`,
      });
      alert(`Recibo enviado a ${c.email}`);
    } catch (e) {
      alert(e.response?.data?.error || 'No se pudo enviar el correo');
    } finally { setReciboEnviandoVac(null); }
  };

  const iconBtnVac = (titulo, contenido, onClick, color) => (
    <button title={titulo} onClick={onClick}
      style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #444', background: '#1e1e1e',
        cursor: 'pointer', fontSize: 14, lineHeight: 1, color: color || '#ccc' }}>
      {contenido}
    </button>
  );

  // ── PANEL ARCHIVO .TXT PARA PAGO DE VACACIONES ───────────────
  if (txtCalc) {
    const c = txtCalc;
    const m = calcVac(c);
    const bancoOk = !!configNomina.banco_pagador && !!configNomina.cuenta_origen;
    const formatoLabel = {
      TAB: 'Texto delimitado por tabulación',
      CSV_COMA: 'CSV — separado por coma',
      CSV_PUNTOCOMA: 'CSV — separado por punto y coma',
      ANCHO_FIJO: 'Ancho fijo (columnas alineadas)',
    }[configNomina.formato_txt || 'TAB'];

    const generarTXT = () => {
      const formato = configNomina.formato_txt || 'TAB';
      const incEnc  = configNomina.incluir_encabezado === undefined ? 1 : configNomina.incluir_encabezado;
      const sep     = formato === 'CSV_COMA' ? ',' : formato === 'CSV_PUNTOCOMA' ? ';' : '\t';
      const fechaPago = dayjs(txtFechaVac).format('DD/MM/YYYY');
      const fila = {
        cedula: `${c.letra_ci || 'V'}${c.cedula || ''}`,
        tipo:   (c.tipo_cuenta || 'CORRIENTE').toUpperCase(),
        cuenta: String(c.numero_cuenta || '').replace(/[^0-9]/g, ''),
        nombre: c.empleado_nombre || '',
        monto:  m.neto.toFixed(2),
      };
      let lines = [];
      if (formato === 'ANCHO_FIJO') {
        const pad  = (s, n) => String(s).padEnd(n).slice(0, n);
        const padL = (s, n) => String(s).padStart(n).slice(0, n);
        if (incEnc) lines.push(pad('CEDULA', 12) + pad('TIPO CTA', 12) + pad('CUENTA', 22) + pad('NOMBRE', 40) + padL('MONTO Bs.', 16));
        lines.push(pad(fila.cedula, 12) + pad(fila.tipo, 12) + pad(fila.cuenta, 22) + pad(fila.nombre, 40) + padL(fila.monto, 16));
      } else {
        if (incEnc) lines.push(['CEDULA', 'TIPO_CUENTA', 'CUENTA', 'NOMBRE', 'MONTO_BS'].join(sep));
        lines.push([fila.cedula, fila.tipo, fila.cuenta, fila.nombre, fila.monto].join(sep));
      }
      if (incEnc) {
        lines = [
          `CONCEPTO${sep}PAGO DE VACACIONES`,
          `BANCO PAGADOR${sep}${configNomina.banco_pagador || 'NO CONFIGURADO'}`,
          `CUENTA ORIGEN${sep}${configNomina.tipo_cuenta_origen || 'CORRIENTE'} ${configNomina.cuenta_origen || 'NO CONFIGURADA'}`,
          `TRABAJADOR${sep}${c.empleado_nombre}`,
          `PERÍODO${sep}${periodoLabel(c)}`,
          `FECHA DE PAGO${sep}${fechaPago}`,
          `TOTAL Bs.${sep}${m.neto.toFixed(2)}`,
          ``,
          ...lines,
        ];
      }
      const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `PAGO_VACACIONES_${(c.cedula || '')}_${dayjs(txtFechaVac).format('YYYYMMDD')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const dato = (label, val) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #2a2a2a' }}>
        <span style={{ color: '#aaa' }}>{label}</span>
        <strong style={{ color: '#fff' }}>{val}</strong>
      </div>
    );

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <span style={{ fontSize: 16, fontWeight: 700 }}>Archivo .TXT para pago de vacaciones</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setTxtCalc(null)}>← Volver</button>
        </div>
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-body">
            {dato('Trabajador', c.empleado_nombre)}
            {dato('C.I.', `${c.letra_ci || 'V'}-${c.cedula}`)}
            {dato('Período', periodoLabel(c))}
            {dato('Neto a pagar', fmtBs(m.neto))}
            {dato('Banco pagador', configNomina.banco_pagador || 'No configurado')}
            {dato('Cuenta origen', configNomina.cuenta_origen
              ? `${configNomina.tipo_cuenta_origen || 'CORRIENTE'} · ${configNomina.cuenta_origen}`
              : 'No configurada')}
            {dato('Formato del archivo', formatoLabel)}
            <div className="form-group" style={{ marginTop: 16 }}>
              <label className="form-label">Fecha de ejecución del pago *</label>
              <input className="form-control" type="date" value={txtFechaVac}
                onChange={e => setTxtFechaVac(e.target.value)} style={{ maxWidth: 220 }} />
            </div>
            {!bancoOk && (
              <div className="alert alert-warning" style={{ fontSize: 12, marginTop: 8 }}>
                Faltan datos del banco pagador o la cuenta origen. Complételos en{' '}
                <strong>Remuneraciones → Configuración → Parámetros bancarios</strong>.
              </div>
            )}
            <div style={{ marginTop: 18 }}>
              <button className="btn btn-primary" onClick={generarTXT} disabled={!txtFechaVac}>
                Generar archivo .TXT
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── VISTA HISTÓRICO ──────────────────────────────────────────
  if (vistaHistorico) {
    const anosDisponibles = [...new Set(
      historicoData.map(c => (c.periodo_inicio || '').slice(0, 4)).filter(Boolean)
    )].sort((a, b) => b.localeCompare(a));

    const histFiltrado = filtroAno
      ? historicoData.filter(c => (c.periodo_inicio || '').startsWith(filtroAno))
      : historicoData;

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button className="btn btn-secondary btn-sm" onClick={() => { setVistaHistorico(false); setFiltroAno(''); }}>← Volver</button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Histórico de vacaciones</span>
          <div />
        </div>

        {/* Filtro por año */}
        <div className="card" style={{ marginBottom: 16, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Año:</span>
            <button className={`btn btn-sm ${!filtroAno ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFiltroAno('')}>Todo</button>
            {anosDisponibles.map(a => (
              <button key={a} className={`btn btn-sm ${filtroAno === a ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFiltroAno(filtroAno === a ? '' : a)}>{a}</button>
            ))}
            <input className="form-control" type="number" min="2000" max="2099" placeholder="Año específico..."
              style={{ maxWidth: 150, marginLeft: 4 }}
              value={filtroAno}
              onChange={e => setFiltroAno(e.target.value)} />
          </div>
        </div>

        {/* Tabla histórico */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Todos los cálculos de vacaciones</div>
            <div className="text-sm text-gris">{histFiltrado.length} cálculo(s){filtroAno ? ` — año ${filtroAno}` : ''}</div>
          </div>
          <div className="table-wrapper">
            {loadingHist ? (
              <p style={{ padding: 24, textAlign: 'center' }} className="text-gris">Cargando...</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Trabajador</th>
                    <th>Cédula</th>
                    <th>Período</th>
                    <th style={{ textAlign: 'right' }}>Años</th>
                    <th style={{ textAlign: 'right' }}>Días vac.</th>
                    <th style={{ textAlign: 'right' }}>Días bono</th>
                    <th style={{ textAlign: 'right', color: '#4ade80' }}>Total USD</th>
                    <th style={{ textAlign: 'right', color: '#4ade80' }}>Total Bs.</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {histFiltrado.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.empleado_nombre}</td>
                      <td className="text-sm text-gris">{c.cedula}</td>
                      <td className="text-sm">{dayjs(c.periodo_inicio).format('DD/MM/YYYY')} – {dayjs(c.periodo_fin).format('DD/MM/YYYY')}</td>
                      <td style={{ textAlign: 'right' }}>{c.anios_servicio}</td>
                      <td style={{ textAlign: 'right' }}>{c.dias_vacaciones}</td>
                      <td style={{ textAlign: 'right' }}>{c.dias_bono_vacacional}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#4ade80' }}>{fmtUSD(c.monto_total_usd)}</td>
                      <td style={{ textAlign: 'right', color: '#4ade80' }}>{fmtBs(c.monto_total_bs)}</td>
                      <td>
                        {c.estado === 'BORRADOR' || !c.estado
                          ? <span className="badge badge-gris">Borrador</span>
                          : <span className="badge badge-verde">{c.estado}</span>}
                      </td>
                      <td>
                        {(c.estado === 'BORRADOR' || !c.estado) && (
                          <button className="btn btn-sm" style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none' }}
                            onClick={() => handleEliminar(c.id)}>Eliminar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {histFiltrado.length === 0 && (
                    <tr><td colSpan={10} className="text-gris text-sm" style={{ textAlign: 'center', padding: 24 }}>
                      No hay cálculos de vacaciones{filtroAno ? ` para el año ${filtroAno}` : ''}
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontWeight: 700 }}>Vacaciones</h3>
          <p className="text-gris text-sm">LOTTT Cap. IX, art. 190–203</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={loadHistorico}>Histórico de vacaciones</button>
          <button className="btn btn-primary" onClick={() => { setModal(true); setForm({ ...emptyForm }); }}>
            + Nuevo cálculo de vacaciones
          </button>
        </div>
      </div>

      {/* Buscador de trabajador */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Buscar trabajador</div>
        <div style={{ position: 'relative', maxWidth: 400 }}>
          <input className="form-control" placeholder="Nombre o cédula (mínimo 2 caracteres)..."
            style={{ background: '#1e1e1e', color: '#fff' }}
            value={buscar} onChange={e => { setBuscar(e.target.value); if (!e.target.value) { setSelEmp(null); setCalculos([]); } }} />
          {sugeridos.length > 0 && !selEmp && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e1e1e', border: '1px solid #333', borderRadius: 6, zIndex: 10, maxHeight: 220, overflowY: 'auto' }}>
              {sugeridos.map(e => (
                <div key={e.id}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a', fontSize: 13, color: '#fff' }}
                  onMouseEnter={ev => ev.currentTarget.style.background = '#2a2a2a'}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                  onClick={() => { setBuscar(`${e.apellido}, ${e.nombre} — ${e.letra_ci || 'V'}-${e.cedula}`); loadCalcEmp(e); }}>
                  <strong style={{ color: '#fff' }}>{e.apellido}, {e.nombre}</strong>
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#aaa' }}>{e.letra_ci || 'V'}-{e.cedula}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {selEmp && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="badge badge-verde">{selEmp.apellido}, {selEmp.nombre} — {selEmp.letra_ci || 'V'}-{selEmp.cedula}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => { setSelEmp(null); setCalculos([]); setBuscar(''); }}>✕ Limpiar</button>
          </div>
        )}
      </div>

      {/* Tabla de cálculos del trabajador seleccionado */}
      {selEmp && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Cálculos de vacaciones — {selEmp.nombre} {selEmp.apellido}</div>
            <div className="text-sm text-gris">{calculos.length} cálculo(s)</div>
          </div>
          <div className="table-wrapper">
            {loadingCalc ? (
              <p style={{ padding: 24, textAlign: 'center' }} className="text-gris">Cargando...</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th style={{ textAlign: 'right' }}>Años serv.</th>
                    <th style={{ textAlign: 'right' }}>Días vac.</th>
                    <th style={{ textAlign: 'right' }}>Días bono</th>
                    <th style={{ textAlign: 'right' }}>Monto Vacaciones Bs.</th>
                    <th style={{ textAlign: 'right' }}>Monto Bono Bs.</th>
                    <th style={{ textAlign: 'right', color: '#CC0000' }}>Retenciones Bs.</th>
                    <th style={{ textAlign: 'right', color: '#15803d' }}>Neto Bs.</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {calculos.map(c => {
                    const m = calcVac(c);
                    return (
                    <tr key={c.id}>
                      <td className="text-sm">{periodoLabel(c)}</td>
                      <td style={{ textAlign: 'right' }}>{c.anios_servicio}</td>
                      <td style={{ textAlign: 'right' }}>{c.dias_vacaciones}</td>
                      <td style={{ textAlign: 'right' }}>{c.dias_bono_vacacional}</td>
                      <td style={{ textAlign: 'right' }}>{fmtBs(m.vac)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtBs(m.bono)}</td>
                      <td style={{ textAlign: 'right', color: '#CC0000' }}>{fmtBs(m.retenc)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{fmtBs(m.neto)}</td>
                      <td>
                        {esBorrador(c)
                          ? <span className="badge badge-gris">Borrador</span>
                          : <span className="badge badge-verde">{c.estado}</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          {esBorrador(c) ? (
                            <>
                              <button className="btn btn-secondary btn-sm" onClick={() => handleAjustar(c)}>Ajustar</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => verPrecalculo(c)}>Ver pre-cálculo</button>
                              <button className="btn btn-primary btn-sm" onClick={() => handleAprobar(c)}>Aprobar</button>
                              <button className="btn btn-sm" style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none' }}
                                onClick={() => handleEliminar(c.id)}>Eliminar</button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-secondary btn-sm"
                                onClick={() => { setTxtFechaVac(dayjs().format('YYYY-MM-DD')); setTxtCalc(c); }}>
                                Archivo .TXT para pago
                              </button>
                              {iconBtnVac('Ver recibo de vacaciones', '👁️', () => verReciboVac(c), '#60a5fa')}
                              {iconBtnVac(c.email ? 'Enviar recibo al correo' : 'Sin correo registrado',
                                reciboEnviandoVac === c.id ? '…' : '✉️', () => enviarReciboVac(c), '#fbbf24')}
                              {iconBtnVac('Descargar recibo PDF', '⬇️', () => descargarReciboVac(c), '#4ade80')}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {calculos.length === 0 && (
                    <tr><td colSpan={10} className="text-gris text-sm" style={{ textAlign: 'center', padding: 24 }}>
                      No hay cálculos de vacaciones para este trabajador
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Vista nuevo cálculo — página completa */}
      {modal && (
        <div style={{ position: 'fixed', left: 'var(--sidebar-w)', top: 'var(--header-h)', right: 0, bottom: 0, background: 'var(--gris-claro)', zIndex: 500, overflowY: 'auto', padding: 24 }}>
          <div style={{ maxWidth: 820, margin: '0 auto' }}>
            <div className="flex items-center justify-between mb-4">
              <button className="btn btn-secondary btn-sm" onClick={() => { setModal(false); setEditId(null); }}>← Volver</button>
              <span style={{ fontWeight: 700, fontSize: 16 }}>
                {editId ? 'Ajustar cálculo de vacaciones' : 'Nuevo cálculo de vacaciones'}
              </span>
              <div />
            </div>
            <div className="card"><div className="card-body">

              {/* Trabajador */}
              <div style={{ fontSize: 12, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Trabajador</div>
              {selEmp ? (
                <div style={{ background: '#1a1a1a', borderRadius: 6, padding: 10, marginBottom: 16, fontSize: 13, color: '#ccc' }}>
                  <strong>{selEmp.apellido}, {selEmp.nombre}</strong>
                  <span style={{ marginLeft: 12, color: '#aaa' }}>{selEmp.letra_ci || 'V'}-{selEmp.cedula}</span>
                  {selEmp.cargo && <span style={{ marginLeft: 12, color: '#aaa' }}>· {selEmp.cargo}</span>}
                  {selEmp.fecha_ingreso && <span style={{ marginLeft: 12, color: '#aaa' }}>· Ingreso: {dayjs(selEmp.fecha_ingreso).format('DD/MM/YYYY')}</span>}
                </div>
              ) : (
                <p style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>⚠️ Selecciona un trabajador desde el buscador antes de abrir este formulario.</p>
              )}

              {/* ── SECCIÓN 1: DATOS BÁSICOS ── */}
              <div style={{ borderBottom: '2px solid #2563eb', marginBottom: 14, paddingBottom: 5 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 1 }}>Datos del período</div>
              </div>

              <div className="form-grid form-grid-2" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Fecha de inicio del disfrute *</label>
                  <input className="form-control" type="date" value={form.periodo_inicio}
                    onChange={e => setForm(f => ({ ...f, periodo_inicio: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Años de servicio *</label>
                  <input className="form-control" type="number" min="1" value={form.anios_servicio}
                    onChange={e => handleAnios(e.target.value)} />
                </div>
              </div>

              {/* Salario base */}
              <div className="form-grid form-grid-2" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Salario base mensual del mes anterior al inicio (Bs.) *</label>
                  <input className="form-control" type="number" min="0" step="0.01" value={form.salario_base}
                    onChange={e => setForm(f => ({ ...f, salario_base: e.target.value }))}
                    placeholder="Salario mensual del mes inmediatamente anterior al inicio" />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <button className="btn btn-primary" onClick={handleCalcular}>Calcular automático</button>
                <span style={{ marginLeft: 10, fontSize: 12, color: '#aaa' }}>Calcula fecha de reintegro, días de descanso, lunes del período y retenciones</span>
              </div>

              {/* Tabla de cálculo — días por período (LOTTT art. 190/192) */}
              <details style={{ marginBottom: 16, background: '#1a1a1a', borderRadius: 6, padding: '8px 12px' }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>
                  Ver tabla de días de vacaciones por período (LOTTT)
                </summary>
                <div style={{ fontSize: 11, color: '#aaa', margin: '8px 0' }}>
                  Primer período: 15 días hábiles de disfrute + 15 días de bono vacacional.
                  Cada período posterior suma 1 día a ambos conceptos, con un tope de 30 / 30
                  (se alcanza en el período 16).
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', color: '#ccc', borderBottom: '1px solid #333', padding: '3px 6px' }}>Período</th>
                      <th style={{ textAlign: 'right', color: '#ccc', borderBottom: '1px solid #333', padding: '3px 6px' }}>Días de disfrute</th>
                      <th style={{ textAlign: 'right', color: '#ccc', borderBottom: '1px solid #333', padding: '3px 6px' }}>Días de bono vacacional</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 16 }, (_, k) => k + 1).map(n => {
                      const dv = diasVacacionesPeriodo(n);
                      const activo = Number(form.anios_servicio) === n;
                      return (
                        <tr key={n} style={{ background: activo ? '#1e3a5f' : 'transparent' }}>
                          <td style={{ padding: '3px 6px', color: activo ? '#fff' : '#bbb' }}>
                            {n === 16 ? '16 o más' : n}
                          </td>
                          <td style={{ padding: '3px 6px', textAlign: 'right', color: activo ? '#fff' : '#bbb' }}>{dv.disfrute}</td>
                          <td style={{ padding: '3px 6px', textAlign: 'right', color: activo ? '#fff' : '#bbb' }}>{dv.bono}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </details>

              {/* ── SECCIÓN 2: PERÍODO CALCULADO ── */}
              {form.fecha_reintegro && (
                <>
                  <div style={{ borderBottom: '2px solid #2563eb', marginBottom: 14, paddingBottom: 5 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 1 }}>Período calculado</div>
                  </div>
                  <div className="form-grid form-grid-2" style={{ marginBottom: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Fecha de inicio (disfrute)</label>
                      <input className="form-control" type="date" value={form.periodo_inicio}
                        onChange={e => setForm(f => ({ ...f, periodo_inicio: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Fecha de reintegro (auto)</label>
                      <input className="form-control" type="date" value={form.fecha_reintegro}
                        onChange={e => setForm(f => ({ ...f, fecha_reintegro: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Último día del período (fin)</label>
                      <input className="form-control" type="date" value={form.periodo_fin}
                        onChange={e => setForm(f => ({ ...f, periodo_fin: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ color: '#aaa' }}>Salario diario ({isBS ? 'Bs.' : '$'})</label>
                      <input className="form-control" readOnly value={salDiario.toFixed(4)} style={{ background: '#1a1a1a', color: '#ccc' }} />
                    </div>
                  </div>
                </>
              )}

              {/* ── SECCIÓN 3: CONCEPTOS ── */}
              {salBase > 0 && (
                <>
                  <div style={{ borderBottom: '2px solid #16a34a', marginBottom: 14, paddingBottom: 5 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 1 }}>Conceptos a calcular</div>
                  </div>

                  {/* Días hábiles de disfrute */}
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Días hábiles de disfrute (L-V)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Cantidad</label>
                      <input className="form-control" type="number" min="15" max="30" value={form.dias_habiles_disfrute}
                        onChange={e => setForm(f => ({ ...f, dias_habiles_disfrute: Number(e.target.value) }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Monto {isBS ? 'Bs.' : 'USD'} (auto)</label>
                      <input className="form-control" readOnly value={isBS ? fmtBs(montoHabiles) : fmtUSD(montoHabiles)} style={{ background: '#1a1a1a', color: '#4ade80' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Monto {isBS ? 'USD' : 'Bs.'} (auto)</label>
                      <input className="form-control" readOnly value={isBS ? fmtUSD(toUSD(montoHabiles)) : fmtBs(toBS(montoHabiles))} style={{ background: '#1a1a1a', color: '#ccc' }} />
                    </div>
                  </div>

                  {/* Días de descanso */}
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Días de descanso en el período (fer + sáb + dom)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 10, marginBottom: 8 }}>
                    <div className="form-group">
                      <label className="form-label">Cantidad</label>
                      <input className="form-control" type="number" min="0" value={form.dias_descanso_periodo}
                        onChange={e => setForm(f => ({ ...f, dias_descanso_periodo: Number(e.target.value) }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Monto {isBS ? 'Bs.' : 'USD'} (auto)</label>
                      <input className="form-control" readOnly value={isBS ? fmtBs(montoDescanso) : fmtUSD(montoDescanso)} style={{ background: '#1a1a1a', color: '#4ade80' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Monto {isBS ? 'USD' : 'Bs.'} (auto)</label>
                      <input className="form-control" readOnly value={isBS ? fmtUSD(toUSD(montoDescanso)) : fmtBs(toBS(montoDescanso))} style={{ background: '#1a1a1a', color: '#ccc' }} />
                    </div>
                  </div>
                  {feriadosEnPeriodo.length > 0 && (
                    <div style={{ fontSize: 11, color: '#aaa', marginBottom: 12 }}>
                      Feriados nacionales dentro del período ({feriadosEnPeriodo.length}):{' '}
                      <strong style={{ color: '#fbbf24' }}>{feriadosEnPeriodo.join(' · ')}</strong>
                    </div>
                  )}

                  {/* Días de bono vacacional */}
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Días de bono vacacional</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 10, marginBottom: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Cantidad</label>
                      <input className="form-control" type="number" min="15" value={form.dias_bono_vacacional}
                        onChange={e => setForm(f => ({ ...f, dias_bono_vacacional: Number(e.target.value) }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Monto {isBS ? 'Bs.' : 'USD'} (auto)</label>
                      <input className="form-control" readOnly value={isBS ? fmtBs(montoBono) : fmtUSD(montoBono)} style={{ background: '#1a1a1a', color: '#4ade80' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Monto {isBS ? 'USD' : 'Bs.'} (auto)</label>
                      <input className="form-control" readOnly value={isBS ? fmtUSD(toUSD(montoBono)) : fmtBs(toBS(montoBono))} style={{ background: '#1a1a1a', color: '#ccc' }} />
                    </div>
                  </div>

                  {/* Total asignaciones */}
                  <div style={{ background: '#0f2a1a', border: '1px solid #16a34a', borderRadius: 6, padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Total asignaciones</span>
                    <strong style={{ color: '#4ade80', fontSize: 16 }}>{isBS ? fmtBs(montoTotal) : fmtUSD(montoTotal)}</strong>
                    <span style={{ color: '#aaa', fontSize: 13 }}>{isBS ? fmtUSD(toUSD(montoTotal)) : fmtBs(toBS(montoTotal))}</span>
                  </div>

                  {/* ── SECCIÓN 4: RETENCIONES ── */}
                  <div style={{ borderBottom: '2px solid #CC0000', marginBottom: 14, paddingBottom: 5 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#f87171', textTransform: 'uppercase', letterSpacing: 1 }}>Retenciones</div>
                  </div>

                  {/* Lunes del período vacacional */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Cant. de Lunes del Período Vacacional</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, padding: '6px 16px', fontFamily: 'monospace', fontSize: 18, color: '#ccc', minWidth: 48, textAlign: 'center', fontWeight: 700 }}>
                        {Number(form.lunes_periodo_vac) || 1}
                      </div>
                      <button className={`btn btn-sm ${form.lunes_modo_vac !== 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setForm(f => ({ ...f, lunes_modo_vac: 'auto' }))}>Auto</button>
                      <button className={`btn btn-sm ${form.lunes_modo_vac === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setForm(f => ({ ...f, lunes_modo_vac: 'manual' }))}>Personalizar</button>
                    </div>
                    {form.lunes_modo_vac === 'manual' && (
                      <input className="form-control" type="number" min="1" max="6" step="1"
                        style={{ maxWidth: 120, marginBottom: 6 }}
                        value={form.lunes_periodo_vac}
                        onChange={e => setForm(f => ({ ...f, lunes_periodo_vac: Number(e.target.value) }))} />
                    )}
                    <div className="text-sm text-gris">Base IVSS/RPE = (sal.mensual × 12 / 52) × lunes</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div className="form-group">
                      <label className="form-label" style={{ color: '#f87171' }}>IVSS trabajador 4% (tope sal.mín × 5)</label>
                      <input className="form-control" readOnly value={isBS ? fmtBs(ivssVac) : fmtUSD(ivssVac)} style={{ background: '#1a1a1a', color: '#f87171' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ color: '#aaa' }}>{isBS ? 'USD' : 'Bs.'} equivalente</label>
                      <input className="form-control" readOnly value={isBS ? fmtUSD(toUSD(ivssVac)) : fmtBs(toBS(ivssVac))} style={{ background: '#1a1a1a', color: '#ccc' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ color: '#f87171' }}>RPE trabajador 0.5% (tope sal.mín × 10)</label>
                      <input className="form-control" readOnly value={isBS ? fmtBs(rpeVac) : fmtUSD(rpeVac)} style={{ background: '#1a1a1a', color: '#f87171' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ color: '#aaa' }}>{isBS ? 'USD' : 'Bs.'} equivalente</label>
                      <input className="form-control" readOnly value={isBS ? fmtUSD(toUSD(rpeVac)) : fmtBs(toBS(rpeVac))} style={{ background: '#1a1a1a', color: '#ccc' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ color: '#f87171' }}>FAOV trabajador 1% (salario + bono vacacional)</label>
                      <input className="form-control" readOnly value={isBS ? fmtBs(faovVac) : fmtUSD(faovVac)} style={{ background: '#1a1a1a', color: '#f87171' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ color: '#aaa' }}>{isBS ? 'USD' : 'Bs.'} equivalente</label>
                      <input className="form-control" readOnly value={isBS ? fmtUSD(toUSD(faovVac)) : fmtBs(toBS(faovVac))} style={{ background: '#1a1a1a', color: '#ccc' }} />
                    </div>
                  </div>

                  {/* Total retenciones + Neto */}
                  <div style={{ background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 6, padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#f87171', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Total retenciones</span>
                    <strong style={{ color: '#f87171', fontSize: 15 }}>{isBS ? fmtBs(totalRetencVac) : fmtUSD(totalRetencVac)}</strong>
                    <span style={{ color: '#aaa', fontSize: 13 }}>{isBS ? fmtUSD(toUSD(totalRetencVac)) : fmtBs(toBS(totalRetencVac))}</span>
                  </div>
                  <div style={{ background: '#0f2a1a', border: '1px solid #16a34a', borderRadius: 6, padding: '12px 14px', marginBottom: 20, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Neto a pagar</span>
                    <strong style={{ color: '#4ade80', fontSize: 20 }}>{isBS ? fmtBs(netoVac) : fmtUSD(netoVac)}</strong>
                    <span style={{ color: '#aaa', fontSize: 14 }}>{isBS ? fmtUSD(toUSD(netoVac)) : fmtBs(toBS(netoVac))}</span>
                  </div>
                </>
              )}

              {/* Observaciones */}
              <div className="form-group">
                <label className="form-label">Observaciones</label>
                <input className="form-control" value={form.observaciones || ''}
                  onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                  placeholder="Opcional" />
              </div>

            </div></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => { setModal(false); setEditId(null); }}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave}>{editId ? 'Guardar cambios' : 'Guardar cálculo'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModuloEnDesarrollo({ nombre, incluye }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{nombre}</div>
      <div className="text-gris">Módulo en desarrollo</div>
      {incluye && (
        <div style={{ marginTop: 18, fontSize: 13, color: '#555', maxWidth: 520, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
          <strong style={{ color: '#111' }}>Incluirá:</strong>{' '}
          {Array.isArray(incluye) ? (
            <ul style={{ textAlign: 'left', marginTop: 8, paddingLeft: 22, listStyle: 'disc' }}>
              {incluye.map((it, idx) => <li key={idx} style={{ marginBottom: 4 }}>{it}</li>)}
            </ul>
          ) : incluye}
        </div>
      )}
    </div>
  );
}

function RecursosTab() {
  const [sub, setSub] = useState('forma13');
  const subs = [
    ['forma13', 'Forma 13-12 IVSS'],
    ['faov',    'Carga masiva FAOV'],
    ['rnet',    'Carga masiva RNET'],
  ];
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {subs.map(([k, l]) => (
          <button key={k} className={`btn btn-tab${sub === k ? ' active' : ''}`}
            onClick={() => setSub(k)}>
            {l}
          </button>
        ))}
      </div>
      {sub === 'forma13' && <ModuloEnDesarrollo nombre="Forma 13-12 IVSS" />}
      {sub === 'faov'    && <ModuloEnDesarrollo nombre="Carga masiva FAOV" />}
      {sub === 'rnet'    && <ModuloEnDesarrollo nombre="Carga masiva RNET" />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UTILIDADES — CÁLCULO FRACCIONADO
// ─────────────────────────────────────────────────────────────
function UtilidadesFraccionado({ onBack }) {
  const [empleados, setEmpleados]   = useState([]);
  const [buscar, setBuscar]         = useState('');
  const [selEmp, setSelEmp]         = useState(null);
  const [ejercicio, setEjercicio]   = useState(dayjs().year());
  const [ajuste, setAjuste]         = useState(false);
  const [provData, setProvData]     = useState(null);
  const [distribuible, setDistribuible] = useState(0);
  const [anticipo, setAnticipo]     = useState(0);
  const [notas, setNotas]           = useState('');
  const [guardando, setGuardando]   = useState(false);
  const [loadingProv, setLoadingProv] = useState(false);
  const [calculos, setCalculos]     = useState([]);

  useEffect(() => {
    api.get('/nomina/empleados').then(r => setEmpleados(r.data || [])).catch(() => {});
  }, []);

  const loadCalcs = async (empId, ej) => {
    try {
      const r = await api.get(`/nomina/utilidades?empleado_id=${empId}&ejercicio=${ej}`);
      setCalculos((r.data || []).filter(c => c.tipo === 'FRACCIONADO'));
    } catch { setCalculos([]); }
  };

  useEffect(() => {
    if (selEmp) loadCalcs(selEmp.id, ejercicio);
    else setCalculos([]);
  }, [selEmp, ejercicio]);

  const fmtBs = v => `Bs. ${Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const cicloLabel = c => {
    const t = c.tipo;
    if (t === 'MENSUAL') return `${c.periodo} · Mensual`;
    if (t === 'QUINCENAL_1') return `${c.periodo} · 1ra quincena`;
    if (t === 'QUINCENAL_2') return `${c.periodo} · 2da quincena`;
    if (t?.startsWith('SEMANAL_')) return `${c.periodo} · Semana ${t.split('_')[1]}`;
    return `${c.periodo} · ${t}`;
  };

  // ── Documentos imprimibles (pre-cálculo / recibo) ──────────
  const utilDocCSS = `
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0;padding:16px}
    .doc{max-width:680px;margin:0 auto}
    .doc-title{text-align:center;font-weight:700;font-size:13px;letter-spacing:.5px;background:#111;color:#fff;padding:8px;border-radius:4px;margin-bottom:6px}
    .doc-leyenda{text-align:center;font-size:10px;color:#666;margin-bottom:12px}
    .datos{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;margin-bottom:12px}
    .dato{display:flex;justify-content:space-between;font-size:10px;border-bottom:1px dotted #e0e0e0;padding:3px 0;gap:8px}
    .dato .lbl{color:#777;white-space:nowrap}
    .dato .val{font-weight:700;color:#111;text-align:right}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th{background:#f0f0f0;text-align:left;padding:5px 8px;border-bottom:2px solid #ddd;font-size:9px;text-transform:uppercase}
    td{padding:4px 8px;border-bottom:1px solid #f0f0f0}
    .r{text-align:right}
    .neto{display:flex;justify-content:space-between;align-items:center;background:#f0fdf4;border-top:2px solid #86efac;padding:10px 12px;border-radius:4px;margin-top:8px}
    .neto-lbl{font-weight:700;font-size:13px;color:#15803d}
    .neto-val{font-weight:700;font-size:18px;color:#15803d}
    .firma{display:flex;gap:40px;margin-top:30px}
    .firma-box{flex:1;text-align:center;font-size:9px;color:#555}
    .firma-line{border-top:1px solid #999;margin-top:34px;margin-bottom:4px}
    @media print{body{padding:0} @page{size:letter portrait;margin:1.6cm}}
  `;
  const utilDocBody = (c, modo) => {
    const titulo = modo === 'recibo'
      ? 'RECIBO DE CÁLCULO FRACCIONADO DE UTILIDADES / BONIFICACIÓN DE FIN DE AÑO'
      : 'PRE-CÁLCULO FRACCIONADO DE UTILIDADES / BONIFICACIÓN DE FIN DE AÑO';
    const leyenda = modo === 'recibo'
      ? `Recibo generado el ${dayjs().format('DD/MM/YYYY')}.`
      : `Pre-cálculo generado el ${dayjs().format('DD/MM/YYYY')} — Estado BORRADOR, sujeto a cambios.`;
    const dato = (l, v) => `<div class="dato"><span class="lbl">${l}</span><span class="val">${v || '—'}</span></div>`;
    const row = (concepto, monto, bold) =>
      `<tr><td${bold ? ' style="font-weight:700"' : ''}>${concepto}</td><td class="r"${bold ? ' style="font-weight:700"' : ''}>${fmtBs(monto)}</td></tr>`;
    return `
      <div class="doc">
        <div class="doc-title">${titulo}</div>
        <div class="doc-leyenda">${leyenda}</div>
        <div class="datos">
          ${dato('Nombre', c.empleado_nombre)}
          ${dato('C.I.', `${c.letra_ci || 'V'}-${c.cedula || ''}`)}
          ${dato('Expediente', c.numero_expediente)}
          ${dato('Cargo', c.cargo)}
          ${dato('Departamento', c.departamento)}
          ${dato('Fecha de ingreso', c.fecha_ingreso ? dayjs(c.fecha_ingreso).format('DD/MM/YYYY') : '—')}
          ${dato('Ejercicio fiscal', c.ejercicio_fiscal)}
          ${dato('Fecha de cálculo', c.fecha_calculo ? dayjs(c.fecha_calculo).format('DD/MM/YYYY') : '—')}
          ${dato('Días de utilidades', c.dias_utilidades || 0)}
        </div>
        <table>
          <thead><tr><th>Concepto</th><th class="r">Monto Bs.</th></tr></thead>
          <tbody>
            ${row('Suma de provisiones de utilidades', Number(c.provisiones_bs || 0))}
            ${row('Monto distribuible por beneficios líquidos', Number(c.distribuible_bs || 0))}
            ${row('MONTO A PAGAR', Number(c.monto_total_bs || 0), true)}
            ${row('F.A.O.V. (1%)', Number(c.faov_bs || 0))}
            ${row('I.N.C.E.S. (0,5%)', Number(c.inces_bs || 0))}
            ${row('TOTAL RETENCIONES', Number(c.retenciones_bs || 0), true)}
            ${row('Anticipo pagado', Number(c.anticipo_bs || 0))}
          </tbody>
        </table>
        <div class="neto">
          <span class="neto-lbl">NETO A PAGAR</span>
          <span class="neto-val">${fmtBs(Number(c.neto_bs || 0))}</span>
        </div>
        ${c.observaciones ? `<div style="margin-top:10px;font-size:10px;color:#555"><strong>Notas:</strong> ${c.observaciones}</div>` : ''}
        ${modo === 'recibo' ? `
        <div class="firma">
          <div class="firma-box"><div class="firma-line"></div><div>Firma del trabajador</div></div>
          <div class="firma-box"><div class="firma-line"></div><div>Firma de la empresa</div></div>
        </div>` : ''}
      </div>`;
  };
  const abrirUtilDoc = (c, modo, autoprint) => {
    const w = window.open('', '_blank', 'width=900,height=900');
    const t = modo === 'recibo' ? `Recibo utilidades — ${c.empleado_nombre}` : `Pre-cálculo utilidades — ${c.empleado_nombre}`;
    w.document.write(`<html><head><meta charset="utf-8"><title>${t}</title><style>${utilDocCSS}</style></head><body>${utilDocBody(c, modo)}</body></html>`);
    w.document.close();
    if (autoprint) setTimeout(() => w.print(), 400);
  };

  const handleAprobarCalc = async (c) => {
    if (!window.confirm('¿Aprobar este cálculo fraccionado? Después de aprobado no podrá editarse.')) return;
    try {
      await api.post(`/nomina/utilidades/${c.id}/aprobar`);
      loadCalcs(selEmp.id, ejercicio);
    } catch (e) { alert(e.response?.data?.error || 'Error al aprobar'); }
  };

  const sugeridos = buscar.trim().length >= 2
    ? empleados.filter(e => `${e.nombre} ${e.apellido} ${e.cedula}`.toLowerCase().includes(buscar.toLowerCase())).slice(0, 8)
    : [];
  const anios = [];
  for (let y = dayjs().year(); y >= dayjs().year() - 6; y--) anios.push(y);

  const handleAjustar = async () => {
    if (!selEmp) return;
    setLoadingProv(true);
    try {
      const r = await api.get(`/nomina/utilidades/provisiones?empleado_id=${selEmp.id}&ejercicio=${ejercicio}`);
      setProvData(r.data);
      setDistribuible(0); setAnticipo(0); setNotas('');
      setAjuste(true);
    } catch { alert('Error al cargar las provisiones del ejercicio'); }
    setLoadingProv(false);
  };

  // ── Cálculo ────────────────────────────────────────────────
  const provisionesTotal = (provData?.ciclos || []).reduce((a, c) => a + Number(c.provision_bs || 0), 0);
  const distNum = Number(distribuible) || 0;
  const antNum  = Number(anticipo) || 0;
  // El distribuible solo aplica si es mayor a la suma de provisiones
  const distribuibleAplica = distNum > provisionesTotal;
  const montoAPagar = distribuibleAplica ? distNum : provisionesTotal;
  const faov  = montoAPagar * 0.01;
  const inces = montoAPagar * 0.005;
  const totalRetenc = faov + inces;
  const neto = montoAPagar - totalRetenc - antNum;

  const handleGuardar = async () => {
    setGuardando(true);
    try {
      await api.post('/nomina/utilidades', {
        empleado_id:      selEmp.id,
        ejercicio_fiscal: ejercicio,
        tipo:             'FRACCIONADO',
        dias_utilidades:  provData?.dias_utilidades || 0,
        provisiones_bs:   provisionesTotal,
        distribuible_bs:  distNum,
        anticipo_bs:      antNum,
        monto_total_bs:   montoAPagar,
        faov_bs:          faov,
        inces_bs:         inces,
        retenciones_bs:   totalRetenc,
        neto_bs:          neto,
        observaciones:    notas || null,
      });
      alert('Cálculo fraccionado de utilidades guardado.');
      setAjuste(false);
      loadCalcs(selEmp.id, ejercicio);
    } catch (e) { alert(e.response?.data?.error || 'Error al guardar'); }
    setGuardando(false);
  };

  const roStyle = { background: '#1a1a1a', color: '#ccc' };

  // ── VENTANA DE AJUSTE ──────────────────────────────────────
  if (ajuste && provData) {
    return (
      <div style={{ position: 'fixed', left: 'var(--sidebar-w)', top: 'var(--header-h)', right: 0, bottom: 0, background: 'var(--gris-claro)', zIndex: 500, overflowY: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div className="flex items-center justify-between mb-4">
            <button className="btn btn-secondary btn-sm" onClick={() => setAjuste(false)}>← Volver</button>
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              Cálculo fraccionado de utilidades — {selEmp.nombre} {selEmp.apellido}
            </span>
            <div />
          </div>
          <div className="card"><div className="card-body">
            <div style={{ background: '#1a1a1a', borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 13, color: '#ccc', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <span><strong>Ejercicio fiscal:</strong> {ejercicio}</span>
              <span><strong>Días de utilidades:</strong> {provData.dias_utilidades}</span>
              <span><strong>Ciclos del ejercicio:</strong> {provData.ciclos.length}</span>
            </div>

            {/* Tabla de provisiones por ciclo */}
            <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Provisiones de utilidades por ciclo de nómina
            </div>
            <div className="table-wrapper" style={{ marginBottom: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th>Ciclo de nómina</th>
                    <th>Condición</th>
                    <th style={{ textAlign: 'right' }}>Provisión Bs.</th>
                  </tr>
                </thead>
                <tbody>
                  {provData.ciclos.map(c => (
                    <tr key={c.nomina_id}>
                      <td className="text-sm">{cicloLabel(c)}</td>
                      <td>
                        {c.activo
                          ? <span className="badge badge-azul">Provisión</span>
                          : <span className="badge badge-gris">No activo</span>}
                      </td>
                      <td style={{ textAlign: 'right', color: c.activo ? '#15803d' : '#888' }}>
                        {fmtBs(c.provision_bs)}
                      </td>
                    </tr>
                  ))}
                  {provData.ciclos.length === 0 && (
                    <tr><td colSpan={3} className="text-gris text-sm" style={{ textAlign: 'center', padding: 20 }}>
                      No hay ciclos de nómina de salarios para el ejercicio {ejercicio}.
                    </td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} style={{ fontWeight: 700 }}>SUMA DE PROVISIONES</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{fmtBs(provisionesTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Monto distribuible */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16, marginBottom: 8 }}>
              <div className="form-group">
                <label className="form-label">Monto distribuible por beneficios líquidos en Bs.</label>
                <input className="form-control" type="number" min="0" step="0.01"
                  value={distribuible} onChange={e => setDistribuible(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Anticipo pagado en Bs.</label>
                <input className="form-control" type="number" min="0" step="0.01"
                  value={anticipo} onChange={e => setAnticipo(e.target.value)} />
              </div>
            </div>
            <div className="alert alert-info" style={{ fontSize: 12, marginBottom: 16 }}>
              El monto distribuible solo se aplica si es <strong>mayor</strong> a la suma de provisiones;
              en ese caso se convierte en el monto a pagar (las provisiones y los beneficios líquidos
              NO se suman). Si es 0,00 o menor a la suma de provisiones, no afecta el cálculo.
              {distribuibleAplica
                ? <strong style={{ color: '#15803d' }}> Se está aplicando el monto distribuible.</strong>
                : <strong style={{ color: '#888' }}> Se está usando la suma de provisiones.</strong>}
            </div>

            {/* Retenciones y neto */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className="form-group">
                <label className="form-label">Monto a pagar Bs. (auto)</label>
                <input className="form-control" readOnly value={fmtBs(montoAPagar)} style={{ ...roStyle, color: '#4ade80' }} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ color: '#f87171' }}>F.A.O.V. 1% (auto)</label>
                <input className="form-control" readOnly value={fmtBs(faov)} style={{ ...roStyle, color: '#f87171' }} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ color: '#f87171' }}>I.N.C.E.S. 0,5% (auto)</label>
                <input className="form-control" readOnly value={fmtBs(inces)} style={{ ...roStyle, color: '#f87171' }} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ color: '#f87171' }}>Total retenciones Bs. (auto)</label>
                <input className="form-control" readOnly value={fmtBs(totalRetenc)} style={{ ...roStyle, color: '#f87171' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Anticipo a descontar Bs.</label>
                <input className="form-control" readOnly value={fmtBs(antNum)} style={roStyle} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ color: '#4ade80' }}>Neto a pagar Bs. (auto)</label>
                <input className="form-control" readOnly value={fmtBs(neto)} style={{ ...roStyle, color: '#4ade80', fontWeight: 700 }} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notas / Observaciones</label>
              <textarea className="form-control" rows={3} style={{ resize: 'vertical' }}
                value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Observaciones del cálculo fraccionado de utilidades..." />
            </div>
          </div></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setAjuste(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleGuardar} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar ajustes'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── BUSCADOR DE TRABAJADOR ─────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span style={{ fontWeight: 700, fontSize: 16 }}>Cálculo fraccionado de utilidades</span>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Volver</button>
      </div>
      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Ejercicio fiscal</label>
            <select className="form-control" style={{ maxWidth: 160 }}
              value={ejercicio} onChange={e => setEjercicio(Number(e.target.value))}>
              {anios.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, flex: '1 1 320px', position: 'relative' }}>
            <label className="form-label">Buscar trabajador</label>
            <input className="form-control" placeholder="Nombre o cédula (mínimo 2 caracteres)..."
              style={{ background: '#1e1e1e', color: '#fff' }}
              value={buscar}
              onChange={e => { setBuscar(e.target.value); if (!e.target.value) setSelEmp(null); }} />
            {sugeridos.length > 0 && !selEmp && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e1e1e', border: '1px solid #333', borderRadius: 6, zIndex: 10, maxHeight: 220, overflowY: 'auto' }}>
                {sugeridos.map(e => (
                  <div key={e.id}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a', fontSize: 13, color: '#fff' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = '#2a2a2a'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                    onClick={() => { setSelEmp(e); setBuscar(`${e.apellido}, ${e.nombre} — ${e.letra_ci || 'V'}-${e.cedula}`); }}>
                    <strong style={{ color: '#fff' }}>{e.apellido}, {e.nombre}</strong>
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#aaa' }}>{e.letra_ci || 'V'}-{e.cedula}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selEmp && (
        <div className="card">
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{selEmp.apellido}, {selEmp.nombre}</div>
              <div className="text-sm text-gris">
                {selEmp.letra_ci || 'V'}-{selEmp.cedula}
                {selEmp.cargo ? ` · ${selEmp.cargo}` : ''} · Ejercicio {ejercicio}
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleAjustar} disabled={loadingProv}>
              {loadingProv ? 'Cargando...' : 'Ajustar'}
            </button>
          </div>
        </div>
      )}

      {selEmp && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <div className="card-title">Cálculos fraccionados — ejercicio {ejercicio}</div>
            <div className="text-sm text-gris">{calculos.length} cálculo(s)</div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fecha cálculo</th>
                  <th style={{ textAlign: 'right' }}>Monto a pagar Bs.</th>
                  <th style={{ textAlign: 'right', color: '#CC0000' }}>Retenciones Bs.</th>
                  <th style={{ textAlign: 'right', color: '#15803d' }}>Neto Bs.</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {calculos.map(c => (
                  <tr key={c.id}>
                    <td className="text-sm">{c.fecha_calculo ? dayjs(c.fecha_calculo).format('DD/MM/YYYY') : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmtBs(c.monto_total_bs)}</td>
                    <td style={{ textAlign: 'right', color: '#CC0000' }}>{fmtBs(c.retenciones_bs)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{fmtBs(c.neto_bs)}</td>
                    <td>
                      <span className={`badge ${c.estado === 'BORRADOR' || !c.estado ? 'badge-gris' : 'badge-verde'}`}>
                        {c.estado || 'BORRADOR'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {c.estado === 'BORRADOR' || !c.estado ? (
                          <>
                            <button className="btn btn-secondary btn-sm" onClick={() => abrirUtilDoc(c, 'precalc', true)}>
                              Ver pre-cálculo
                            </button>
                            <button className="btn btn-primary btn-sm" onClick={() => handleAprobarCalc(c)}>
                              Aprobar
                            </button>
                          </>
                        ) : (
                          <>
                            <button title="Ver recibo" onClick={() => abrirUtilDoc(c, 'recibo', false)}
                              style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #444', background: '#1e1e1e', cursor: 'pointer', fontSize: 14, color: '#60a5fa' }}>
                              👁️
                            </button>
                            <button title="Descargar recibo PDF" onClick={() => abrirUtilDoc(c, 'recibo', true)}
                              style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #444', background: '#1e1e1e', cursor: 'pointer', fontSize: 14, color: '#4ade80' }}>
                              ⬇️
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {calculos.length === 0 && (
                  <tr><td colSpan={6} className="text-gris text-sm" style={{ textAlign: 'center', padding: 20 }}>
                    No hay cálculos fraccionados para este trabajador en el ejercicio {ejercicio}. Use "Ajustar" para crear uno.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UTILIDADES — CÁLCULO GENERAL (nómina de utilidades)
// ─────────────────────────────────────────────────────────────
function UtilidadesGeneral({ onBack }) {
  const [nominas, setNominas]       = useState([]);
  const [selected, setSelected]     = useState(null);   // { nomina, items, empresa, usuario_nombre }
  const [modalNueva, setModalNueva] = useState(false);
  const [formNueva, setFormNueva]   = useState({ ejercicio_fiscal: dayjs().year(), modalidad: 'ANTICIPADO' });
  const [procesando, setProcesando] = useState(false);
  const [ajusteItem, setAjusteItem] = useState(null);
  const [provData, setProvData]     = useState(null);
  const [distribuible, setDistribuible] = useState(0);
  const [anticipo, setAnticipo]     = useState(0);
  const [notasItem, setNotasItem]   = useState('');
  const [guardando, setGuardando]   = useState(false);
  const [showPre, setShowPre]       = useState(false);
  // R5-9.5 — CTAs post-cierre
  const [showResumen, setShowResumen]           = useState(false);
  const [showReporte, setShowReporte]           = useState(false);
  const [showParafiscales, setShowParafiscales] = useState(false);
  const [showTxtPago, setShowTxtPago]           = useState(false);
  const [showRecibos, setShowRecibos]           = useState(false);
  const [recibosModo, setRecibosModo]           = useState('inicio');
  const [reciboEnviando, setReciboEnviando]     = useState(null);
  const [txtFechaPago, setTxtFechaPago]         = useState(dayjs().format('YYYY-MM-DD'));
  const [configNomina, setConfigNomina]         = useState({});

  const fmtBs = v => `Bs. ${Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const modalLabel  = m => m === 'DEFINITIVO' ? 'definitiva' : 'anticipada';
  const modalUpper  = m => m === 'DEFINITIVO' ? 'DEFINITIVA' : 'ANTICIPADA';
  const modalAdj    = m => m === 'DEFINITIVO' ? 'DEFINITIVO' : 'ANTICIPADO';
  const nombreNomina = n =>
    `Nómina ${modalLabel(n.modalidad)} de utilidades / bonificación de fin de año`;

  const load = () => api.get('/nomina/utilidades-nominas').then(r => setNominas(r.data || [])).catch(() => {});
  useEffect(() => {
    load();
    api.get('/nomina/config').then(r => setConfigNomina(r.data || {})).catch(() => {});
  }, []);

  const loadDetalle = async (id) => {
    try {
      const r = await api.get(`/nomina/utilidades-nominas/${id}`);
      setSelected(r.data);
    } catch { alert('Error al cargar la nómina'); }
  };

  const handleCrear = async () => {
    try {
      await api.post('/nomina/utilidades-nominas', formNueva);
      setModalNueva(false);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Error al crear'); }
  };

  const handleEliminar = async (n) => {
    if (!window.confirm(`¿Eliminar la nómina ${modalLabel(n.modalidad)} de utilidades del ejercicio ${n.ejercicio_fiscal}?`)) return;
    try { await api.delete(`/nomina/utilidades-nominas/${n.id}`); load(); }
    catch (e) { alert(e.response?.data?.error || 'Error al eliminar'); }
  };

  const handleProcesar = async () => {
    if (!window.confirm('¿Calcular automáticamente las utilidades de todos los trabajadores activos del ejercicio?')) return;
    setProcesando(true);
    try {
      const r = await api.post(`/nomina/utilidades-nominas/${selected.nomina.id}/procesar`);
      alert(`Procesados: ${r.data.procesados} trabajadores`);
      loadDetalle(selected.nomina.id);
    } catch (e) { alert(e.response?.data?.error || 'Error al procesar'); }
    setProcesando(false);
  };

  const handleCerrar = async () => {
    if (!window.confirm('¿Cerrar la nómina de utilidades? Ya no podrá editarse.')) return;
    try {
      await api.post(`/nomina/utilidades-nominas/${selected.nomina.id}/cerrar`);
      loadDetalle(selected.nomina.id);
    } catch (e) { alert(e.response?.data?.error || 'Error al cerrar'); }
  };

  const handleAjustar = async (item) => {
    try {
      const r = await api.get(`/nomina/utilidades/provisiones?empleado_id=${item.empleado_id}&ejercicio=${selected.nomina.ejercicio_fiscal}`);
      setProvData(r.data);
      setDistribuible(Number(item.distribuible_bs) || 0);
      setAnticipo(Number(item.anticipo_bs) || 0);
      setNotasItem(item.observaciones || '');
      setAjusteItem(item);
    } catch { alert('Error al cargar las provisiones'); }
  };

  // Cálculo del ajuste (idéntico al cálculo fraccionado)
  const provisionesTotal = (provData?.ciclos || []).reduce((a, c) => a + Number(c.provision_bs || 0), 0);
  const distNum = Number(distribuible) || 0;
  const antNum  = Number(anticipo) || 0;
  const distribuibleAplica = distNum > provisionesTotal;
  const montoAPagar = distribuibleAplica ? distNum : provisionesTotal;
  const faov  = montoAPagar * 0.01;
  const inces = montoAPagar * 0.005;
  const totalRetenc = faov + inces;
  const netoAjuste = montoAPagar - totalRetenc - antNum;

  const handleGuardarAjuste = async () => {
    setGuardando(true);
    try {
      await api.put(`/nomina/utilidades/${ajusteItem.id}`, {
        dias_utilidades: provData?.dias_utilidades || 0,
        provisiones_bs:  provisionesTotal,
        distribuible_bs: distNum,
        anticipo_bs:     antNum,
        monto_total_bs:  montoAPagar,
        faov_bs:         faov,
        inces_bs:        inces,
        retenciones_bs:  totalRetenc,
        neto_bs:         netoAjuste,
        observaciones:   notasItem || null,
      });
      setAjusteItem(null);
      loadDetalle(selected.nomina.id);
    } catch (e) { alert(e.response?.data?.error || 'Error al guardar'); }
    setGuardando(false);
  };

  const roStyle = { background: '#1a1a1a', color: '#ccc' };
  const cicloLabel = c => {
    const t = c.tipo;
    if (t === 'MENSUAL') return `${c.periodo} · Mensual`;
    if (t === 'QUINCENAL_1') return `${c.periodo} · 1ra quincena`;
    if (t === 'QUINCENAL_2') return `${c.periodo} · 2da quincena`;
    if (t?.startsWith('SEMANAL_')) return `${c.periodo} · Semana ${t.split('_')[1]}`;
    return `${c.periodo} · ${t}`;
  };

  // ── VENTANA AJUSTAR NÓMINA (= cálculo fraccionado) ─────────
  if (ajusteItem && provData) {
    return (
      <div style={{ position: 'fixed', left: 'var(--sidebar-w)', top: 'var(--header-h)', right: 0, bottom: 0, background: 'var(--gris-claro)', zIndex: 500, overflowY: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div className="flex items-center justify-between mb-4">
            <button className="btn btn-secondary btn-sm" onClick={() => setAjusteItem(null)}>← Volver</button>
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              Ajustar nómina de utilidades — {ajusteItem.empleado_nombre}
            </span>
            <div />
          </div>
          <div className="card"><div className="card-body">
            <div style={{ background: '#1a1a1a', borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 13, color: '#ccc', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <span><strong>Ejercicio fiscal:</strong> {selected.nomina.ejercicio_fiscal}</span>
              <span><strong>Días de utilidades:</strong> {provData.dias_utilidades}</span>
              <span><strong>Ciclos del ejercicio:</strong> {provData.ciclos.length}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Provisiones de utilidades por ciclo de nómina
            </div>
            <div className="table-wrapper" style={{ marginBottom: 8 }}>
              <table>
                <thead><tr><th>Ciclo de nómina</th><th>Condición</th><th style={{ textAlign: 'right' }}>Provisión Bs.</th></tr></thead>
                <tbody>
                  {provData.ciclos.map(c => (
                    <tr key={c.nomina_id}>
                      <td className="text-sm">{cicloLabel(c)}</td>
                      <td>{c.activo ? <span className="badge badge-azul">Provisión</span> : <span className="badge badge-gris">No activo</span>}</td>
                      <td style={{ textAlign: 'right', color: c.activo ? '#15803d' : '#888' }}>{fmtBs(c.provision_bs)}</td>
                    </tr>
                  ))}
                  {provData.ciclos.length === 0 && (
                    <tr><td colSpan={3} className="text-gris text-sm" style={{ textAlign: 'center', padding: 20 }}>
                      No hay ciclos de nómina de salarios para este ejercicio.
                    </td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} style={{ fontWeight: 700 }}>SUMA DE PROVISIONES</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{fmtBs(provisionesTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16, marginBottom: 8 }}>
              <div className="form-group">
                <label className="form-label">Monto distribuible por beneficios líquidos en Bs.</label>
                <input className="form-control" type="number" min="0" step="0.01"
                  value={distribuible} onChange={e => setDistribuible(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Anticipo pagado en Bs.</label>
                <input className="form-control" type="number" min="0" step="0.01"
                  value={anticipo} onChange={e => setAnticipo(e.target.value)} />
              </div>
            </div>
            <div className="alert alert-info" style={{ fontSize: 12, marginBottom: 16 }}>
              El monto distribuible solo se aplica si es <strong>mayor</strong> a la suma de provisiones.
              {distribuibleAplica
                ? <strong style={{ color: '#15803d' }}> Se está aplicando el monto distribuible.</strong>
                : <strong style={{ color: '#888' }}> Se está usando la suma de provisiones.</strong>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className="form-group">
                <label className="form-label">Monto a pagar Bs. (auto)</label>
                <input className="form-control" readOnly value={fmtBs(montoAPagar)} style={{ ...roStyle, color: '#4ade80' }} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ color: '#f87171' }}>F.A.O.V. 1% (auto)</label>
                <input className="form-control" readOnly value={fmtBs(faov)} style={{ ...roStyle, color: '#f87171' }} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ color: '#f87171' }}>I.N.C.E.S. 0,5% (auto)</label>
                <input className="form-control" readOnly value={fmtBs(inces)} style={{ ...roStyle, color: '#f87171' }} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ color: '#f87171' }}>Total retenciones Bs. (auto)</label>
                <input className="form-control" readOnly value={fmtBs(totalRetenc)} style={{ ...roStyle, color: '#f87171' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Anticipo a descontar Bs.</label>
                <input className="form-control" readOnly value={fmtBs(antNum)} style={roStyle} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ color: '#4ade80' }}>Neto a pagar Bs. (auto)</label>
                <input className="form-control" readOnly value={fmtBs(netoAjuste)} style={{ ...roStyle, color: '#4ade80', fontWeight: 700 }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notas / Observaciones</label>
              <textarea className="form-control" rows={3} style={{ resize: 'vertical' }}
                value={notasItem} onChange={e => setNotasItem(e.target.value)} />
            </div>
          </div></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setAjusteItem(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleGuardarAjuste} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar ajustes'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── RESUMEN DE NÓMINA DE UTILIDADES ─────────────────────────
  if (showResumen && selected) {
    const { nomina: pnom, items: pitems, empresa: pemp } = selected;
    const modaUp = modalUpper(pnom.modalidad);
    const sum = k => pitems.reduce((a, i) => a + Number(i[k] || 0), 0);
    const handlePrint = () => {
      const content = document.getElementById('resumen-util-content').innerHTML;
      const w = window.open('', '_blank', 'width=1000,height=800');
      w.document.write(`<html><head><title>Resumen Nómina Utilidades ${pnom.ejercicio_fiscal}</title>
        <style>
          body{font-family:Arial,sans-serif;font-size:10px;color:#000;margin:0;padding:16px}
          h2{font-size:15px;margin:0;text-align:center}
          .titulo{text-align:center;font-weight:700;font-size:13px;margin:4px 0 10px}
          table{width:100%;border-collapse:collapse}
          th,td{border:1px solid #bbb;padding:4px 7px}
          th{background:#e8e8e8;font-weight:700}
          tfoot td{font-weight:700;background:#f5f5f5}
          .r{text-align:right}
          @page{size:letter landscape;margin:1.2cm}
        </style></head><body>${content}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 400);
    };
    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>Resumen de nómina {modalLabel(pnom.modalidad)} de utilidades</span>
            <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft: 8 }}>{pnom.estado}</span>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handlePrint}>Imprimir / Guardar PDF</button>
            <button className="btn btn-secondary" onClick={() => setShowResumen(false)}>← Volver</button>
          </div>
        </div>
        <div id="resumen-util-content">
          <h2 style={{ color: '#111', textAlign: 'center', margin: 0 }}>{pemp?.razon_social || 'Empresa'}</h2>
          <div className="titulo" style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, color: '#111', margin: '4px 0 4px' }}>
            RESUMEN DE NÓMINA {modaUp} DE UTILIDADES / BONIFICACIÓN DE FIN DE AÑO — {pnom.ejercicio_fiscal}
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#555', marginBottom: 12 }}>
            RIF: <strong style={{ color: '#111' }}>{pemp?.rif || '—'}</strong> &nbsp;|&nbsp;
            Trabajadores: <strong style={{ color: '#111' }}>{pitems.length}</strong>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px' }}>Trabajador</th>
                <th style={{ textAlign: 'center', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px' }}>C.I.</th>
                <th style={{ textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px' }}>Provisiones Bs.</th>
                <th style={{ textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px', color: '#1d4ed8' }}>Total asig. Bs.</th>
                <th style={{ textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px', color: '#CC0000' }}>Retenciones Bs.</th>
                <th style={{ textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px', color: '#CC0000' }}>Anticipo Bs.</th>
                <th style={{ textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px', color: '#15803d' }}>Neto Bs.</th>
              </tr>
            </thead>
            <tbody>
              {pitems.map(i => (
                <tr key={i.id}>
                  <td className="fw-600" style={{ padding: '5px 9px', borderBottom: '1px solid #eee' }}>{i.empleado_nombre}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'center' }}>{i.letra_ci || 'V'}-{i.cedula}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'right' }}>{fmtBs(i.provisiones_bs)}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'right', color: '#1d4ed8' }}>{fmtBs(i.monto_total_bs)}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'right', color: '#CC0000' }}>{fmtBs(i.retenciones_bs)}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'right', color: '#CC0000' }}>{fmtBs(i.anticipo_bs)}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{fmtBs(i.neto_bs)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f5f5f5' }}>
                <td colSpan={2} style={{ padding: '7px 9px', fontWeight: 700 }}>TOTALES ({pitems.length} trabajadores)</td>
                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700 }}>{fmtBs(sum('provisiones_bs'))}</td>
                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{fmtBs(sum('monto_total_bs'))}</td>
                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700, color: '#CC0000' }}>{fmtBs(sum('retenciones_bs'))}</td>
                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700, color: '#CC0000' }}>{fmtBs(sum('anticipo_bs'))}</td>
                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{fmtBs(sum('neto_bs'))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  // ── REPORTE DE PARAFISCALES DE UTILIDADES ───────────────────
  if (showParafiscales && selected) {
    const { nomina: pnom, items: pitems, empresa: pemp } = selected;
    const modaUp = modalUpper(pnom.modalidad);
    const totFAOV  = pitems.reduce((a, i) => a + Number(i.faov_bs || 0), 0);
    const totINCES = pitems.reduce((a, i) => a + Number(i.inces_bs || 0), 0);
    const totGral  = totFAOV + totINCES;
    const handlePrint = () => {
      const content = document.getElementById('paraf-util-content').innerHTML;
      const w = window.open('', '_blank', 'width=1000,height=800');
      w.document.write(`<html><head><title>Parafiscales Utilidades ${pnom.ejercicio_fiscal}</title>
        <style>
          body{font-family:Arial,sans-serif;font-size:10px;color:#000;margin:0;padding:16px}
          h2{font-size:15px;margin:0;text-align:center}
          .titulo{text-align:center;font-weight:700;font-size:13px;margin:4px 0 10px}
          table{width:100%;border-collapse:collapse}
          th,td{border:1px solid #bbb;padding:4px 7px}
          th{background:#e8e8e8;font-weight:700}
          tfoot td{font-weight:700;background:#f5f5f5}
          .r{text-align:right}
          @page{size:letter portrait;margin:1.2cm}
        </style></head><body>${content}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 400);
    };
    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>Reporte de parafiscales — nómina {modalLabel(pnom.modalidad)} de utilidades</span>
            <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft: 8 }}>{pnom.estado}</span>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handlePrint}>Imprimir / Guardar PDF</button>
            <button className="btn btn-secondary" onClick={() => setShowParafiscales(false)}>← Volver</button>
          </div>
        </div>
        <div id="paraf-util-content">
          <h2 style={{ color: '#111', textAlign: 'center', margin: 0 }}>{pemp?.razon_social || 'Empresa'}</h2>
          <div className="titulo" style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, color: '#111', margin: '4px 0 4px' }}>
            REPORTE DE PARAFISCALES {modaUp} DE UTILIDADES — {pnom.ejercicio_fiscal}
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#555', marginBottom: 12 }}>
            RIF: <strong style={{ color: '#111' }}>{pemp?.rif || '—'}</strong> &nbsp;|&nbsp;
            Trabajadores: <strong style={{ color: '#111' }}>{pitems.length}</strong>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px' }}>Trabajador</th>
                <th style={{ textAlign: 'center', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px' }}>C.I.</th>
                <th style={{ textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px' }}>Monto base Bs.</th>
                <th style={{ textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px', color: '#CC0000' }}>F.A.O.V. (1%) Bs.</th>
                <th style={{ textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px', color: '#CC0000' }}>I.N.C.E.S. (0,5%) Bs.</th>
                <th style={{ textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', padding: '7px 9px', color: '#CC0000' }}>Total parafiscales Bs.</th>
              </tr>
            </thead>
            <tbody>
              {pitems.map(i => (
                <tr key={i.id}>
                  <td className="fw-600" style={{ padding: '5px 9px', borderBottom: '1px solid #eee' }}>{i.empleado_nombre}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'center' }}>{i.letra_ci || 'V'}-{i.cedula}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'right' }}>{fmtBs(i.monto_total_bs)}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'right', color: '#CC0000' }}>{fmtBs(i.faov_bs)}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'right', color: '#CC0000' }}>{fmtBs(i.inces_bs)}</td>
                  <td style={{ padding: '5px 9px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 700, color: '#CC0000' }}>{fmtBs(Number(i.faov_bs || 0) + Number(i.inces_bs || 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f5f5f5' }}>
                <td colSpan={2} style={{ padding: '7px 9px', fontWeight: 700 }}>TOTALES ({pitems.length} trabajadores)</td>
                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700 }}>{fmtBs(pitems.reduce((a, i) => a + Number(i.monto_total_bs || 0), 0))}</td>
                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700, color: '#CC0000' }}>{fmtBs(totFAOV)}</td>
                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700, color: '#CC0000' }}>{fmtBs(totINCES)}</td>
                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700, color: '#CC0000' }}>{fmtBs(totGral)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="card" style={{ marginTop: 16, padding: 14, border: '2px solid #111', borderRadius: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#111', marginBottom: 8, textTransform: 'uppercase' }}>Resumen general</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                <tr><td>F.A.O.V. (1%)</td><td className="r" style={{ color: '#CC0000', textAlign: 'right' }}>{fmtBs(totFAOV)}</td></tr>
                <tr><td>I.N.C.E.S. (0,5%)</td><td className="r" style={{ color: '#CC0000', textAlign: 'right' }}>{fmtBs(totINCES)}</td></tr>
                <tr><td style={{ fontWeight: 700, fontSize: 13 }}>TOTAL PARAFISCALES</td>
                  <td className="r" style={{ fontWeight: 700, fontSize: 14, color: '#15803d', textAlign: 'right' }}>{fmtBs(totGral)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── ARCHIVO .TXT PARA PAGO — UTILIDADES ─────────────────────
  if (showTxtPago && selected) {
    const { nomina: pnom, items: pitems, empresa: pemp } = selected;
    const totalBs = pitems.reduce((a, i) => a + Number(i.neto_bs || 0), 0);
    const bancoOk = !!configNomina.banco_pagador && !!configNomina.cuenta_origen;
    const formatoLabel = {
      TAB: 'Texto delimitado por tabulación',
      CSV_COMA: 'CSV — separado por coma',
      CSV_PUNTOCOMA: 'CSV — separado por punto y coma',
      ANCHO_FIJO: 'Ancho fijo (columnas alineadas)',
    }[configNomina.formato_txt || 'TAB'];

    const handleGenerarTXT = () => {
      try {
        const formato = configNomina.formato_txt || 'TAB';
        const incEnc  = configNomina.incluir_encabezado === undefined ? 1 : configNomina.incluir_encabezado;
        const sep     = formato === 'CSV_COMA' ? ',' : formato === 'CSV_PUNTOCOMA' ? ';' : '\t';
        const fechaPago = dayjs(txtFechaPago).format('DD/MM/YYYY');
        const rows = pitems.map((i, idx) => ({
          nro: String(idx + 1),
          cedula: `${i.letra_ci || 'V'}${i.cedula || ''}`,
          tipo: (i.tipo_cuenta || 'CORRIENTE').toUpperCase(),
          cuenta: String(i.numero_cuenta || '').replace(/[^0-9]/g, ''),
          nombre: i.empleado_nombre || '',
          monto: Number(i.neto_bs || 0).toFixed(2),
        }));
        let lines = [];
        if (formato === 'ANCHO_FIJO') {
          const pad  = (s, n) => String(s).padEnd(n).slice(0, n);
          const padL = (s, n) => String(s).padStart(n).slice(0, n);
          if (incEnc) lines.push(pad('CEDULA', 12) + pad('TIPO CTA', 12) + pad('CUENTA', 22) + pad('NOMBRE', 40) + padL('MONTO Bs.', 16));
          rows.forEach(r => lines.push(pad(r.cedula, 12) + pad(r.tipo, 12) + pad(r.cuenta, 22) + pad(r.nombre, 40) + padL(r.monto, 16)));
        } else {
          if (incEnc) lines.push(['CEDULA', 'TIPO_CUENTA', 'CUENTA', 'NOMBRE', 'MONTO_BS'].join(sep));
          rows.forEach(r => lines.push([r.cedula, r.tipo, r.cuenta, r.nombre, r.monto].join(sep)));
        }
        if (incEnc) {
          lines = [
            `EMPRESA${sep}${pemp?.razon_social || ''}`,
            `RIF${sep}${pemp?.rif || ''}`,
            `CONCEPTO${sep}PAGO ${modalAdj(pnom.modalidad)} DE UTILIDADES ${pnom.ejercicio_fiscal}`,
            `BANCO PAGADOR${sep}${configNomina.banco_pagador || 'NO CONFIGURADO'}`,
            `CUENTA ORIGEN${sep}${configNomina.tipo_cuenta_origen || 'CORRIENTE'} ${configNomina.cuenta_origen || 'NO CONFIGURADA'}`,
            `EJERCICIO${sep}${pnom.ejercicio_fiscal}`,
            `FECHA DE PAGO${sep}${fechaPago}`,
            `TRABAJADORES${sep}${rows.length}`,
            `TOTAL Bs.${sep}${totalBs.toFixed(2)}`,
            ``,
            ...lines,
          ];
        }
        const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `PAGO_UTILIDADES_${modalAdj(pnom.modalidad)}_${pnom.ejercicio_fiscal}_${dayjs(txtFechaPago).format('YYYYMMDD')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) { alert('Error al generar archivo'); }
    };

    const dato = (label, val) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee' }}>
        <span style={{ color: '#666' }}>{label}</span>
        <strong style={{ color: '#111' }}>{val}</strong>
      </div>
    );

    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>
              Archivo .TXT para pago — nómina {modalLabel(pnom.modalidad)} de utilidades
            </span>
            <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft: 8 }}>{pnom.estado}</span>
          </div>
          <button className="btn btn-secondary" onClick={() => setShowTxtPago(false)}>← Volver</button>
        </div>
        <div style={{ maxWidth: 640 }}>
          <div className="card mb-4">
            <div className="card-header"><div className="card-title">Parámetros del pago</div></div>
            <div className="card-body">
              {dato('Empresa', pemp?.razon_social || '—')}
              {dato('Ejercicio fiscal', pnom.ejercicio_fiscal)}
              {dato('Modalidad', pnom.modalidad === 'DEFINITIVO' ? 'Definitiva' : 'Anticipada')}
              {dato('Trabajadores', pitems.length)}
              {dato('Total a pagar', `Bs. ${totalBs.toFixed(2)}`)}
              {dato('Banco pagador', configNomina.banco_pagador || 'No configurado')}
              {dato('Cuenta origen', configNomina.cuenta_origen
                ? `${configNomina.tipo_cuenta_origen || 'CORRIENTE'} · ${configNomina.cuenta_origen}`
                : 'No configurada')}
              {dato('Formato del archivo', formatoLabel)}
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Fecha de ejecución del pago *</label>
                <input className="form-control" type="date" value={txtFechaPago}
                  onChange={e => setTxtFechaPago(e.target.value)} style={{ maxWidth: 220 }} />
              </div>
              {!bancoOk && (
                <div className="alert alert-warning" style={{ fontSize: 12, marginTop: 8 }}>
                  Faltan datos del banco pagador o la cuenta origen. Complételos en{' '}
                  <strong>Remuneraciones → Configuración → Parámetros bancarios</strong>.
                </div>
              )}
              <div style={{ marginTop: 18 }}>
                <button className="btn btn-primary" onClick={handleGenerarTXT} disabled={!txtFechaPago}>
                  Generar archivo .TXT
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── RECIBOS DE PAGO — UTILIDADES ────────────────────────────
  if (showRecibos && selected) {
    const { nomina: pnom, items: pitems, empresa: pemp, usuario_nombre: pusuario } = selected;
    const modaUp = modalUpper(pnom.modalidad);
    const fmtBsR = n => `Bs. ${Number(n || 0).toFixed(2)}`;
    const fechaFmt = d => d ? dayjs(d).format('DD/MM/YYYY') : '—';

    const conceptosHTML = (i) => {
      const row = (label, asig, dedu) =>
        `<tr><td>${label}</td><td style="text-align:right;color:#15803d">${asig!==null?fmtBsR(asig):''}</td><td style="text-align:right;color:#c00">${dedu!==null?fmtBsR(dedu):''}</td></tr>`;
      const monto = Number(i.monto_total_bs || 0);
      const faov  = Number(i.faov_bs || 0);
      const inces = Number(i.inces_bs || 0);
      const ant   = Number(i.anticipo_bs || 0);
      const retenc = Number(i.retenciones_bs || 0);
      const totDed = retenc + ant;
      return [
        `<tr><td colspan="3" style="padding:4px 0 2px;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#15803d;border-bottom:1px solid #ddd">Asignaciones</td></tr>`,
        row('Suma de provisiones del ejercicio', Number(i.provisiones_bs || 0), null),
        row('Monto distribuible por beneficios líquidos', Number(i.distribuible_bs || 0), null),
        row('Monto a pagar (total asignaciones)', monto, null),
        `<tr><td style="font-weight:700;color:#111">TOTAL ASIGNACIONES</td><td style="text-align:right;font-weight:700;color:#111">${fmtBsR(monto)}</td><td></td></tr>`,
        `<tr><td colspan="3" style="padding:4px 0 2px;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#c00;border-bottom:1px solid #ddd">Deducciones</td></tr>`,
        row('F.A.O.V. (1%)', null, faov),
        row('I.N.C.E.S. (0,5%)', null, inces),
        row('Anticipo pagado', null, ant),
        `<tr><td style="font-weight:700;color:#c00">TOTAL DEDUCCIONES</td><td></td><td style="text-align:right;font-weight:700;color:#c00">${fmtBsR(totDed)}</td></tr>`,
      ].join('');
    };

    const reciboInner = (i) => {
      const netoBs = Number(i.neto_bs || 0);
      const dato = (lbl, val) =>
        `<div class="rec-dato"><span class="rec-dlbl">${lbl}</span><span class="rec-dval">${val||'—'}</span></div>`;
      return `
        <div class="recibo">
          <div class="rec-emp">
            <div style="font-size:13px;font-weight:700">${pemp?.razon_social||'Empresa'}</div>
            <div style="font-size:9px;color:#555">RIF: ${pemp?.rif||'—'}</div>
          </div>
          <div class="rec-title">RECIBO DE PAGO ${modaUp === 'ANTICIPADA' ? 'ANTICIPADO' : 'DEFINITIVO'} DE UTILIDADES / BONIFICACIÓN DE FIN DE AÑO</div>
          <div class="rec-datos">
            ${dato('Nombre', i.empleado_nombre)}
            ${dato('C.I.', `${i.letra_ci||'V'}-${i.cedula||''}`)}
            ${dato('Expediente', i.numero_expediente)}
            ${dato('Cargo', i.cargo)}
            ${dato('Departamento', i.departamento)}
            ${dato('Fecha de ingreso', fechaFmt(i.fecha_ingreso))}
            ${dato('Cuenta bancaria', i.numero_cuenta ? `${i.banco||''} ${i.numero_cuenta}`.trim() : '—')}
            ${dato('Correo', i.email)}
            ${dato('Ejercicio fiscal', pnom.ejercicio_fiscal)}
            ${dato('Días de utilidades', i.dias_utilidades || '—')}
          </div>
          <table class="rec-table">
            <thead><tr>
              <th style="text-align:left">CONCEPTOS</th>
              <th style="text-align:right;color:#15803d">ASIG. (Bs.)</th>
              <th style="text-align:right;color:#c00">DEDU. (Bs.)</th>
            </tr></thead>
            <tbody>${conceptosHTML(i)}</tbody>
          </table>
          <div class="rec-neto">
            <span class="rec-neto-label">NETO A COBRAR</span>
            <span class="rec-neto-bs">Bs. ${netoBs.toFixed(2)}</span>
          </div>
          ${i.observaciones ? `<div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 10px;font-size:10px;color:#444;margin:6px 0 4px"><strong>Notas:</strong> ${i.observaciones}</div>` : ''}
          <div class="rec-firma">
            <div class="firma-box"><div class="firma-line"></div><div>Firma del trabajador</div></div>
            <div class="firma-box"><div class="firma-line"></div><div>Firma de la empresa</div></div>
          </div>
          <div class="rec-footer">${pusuario?`Procesado por: ${pusuario} | `:''}Generado el ${new Date().toLocaleDateString('es-VE')}</div>
        </div>`;
    };

    const reciboCSS = `
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0;padding:10px}
      .recibo{border:1px solid #ccc;border-radius:6px;padding:16px;margin:0 auto 16px;page-break-after:always;max-width:680px}
      .recibo:last-child{page-break-after:auto}
      .rec-emp{text-align:center;border-bottom:1px solid #ddd;padding-bottom:6px;margin-bottom:6px}
      .rec-title{text-align:center;font-weight:700;font-size:12px;letter-spacing:.5px;background:#111;color:#fff;padding:6px;border-radius:4px;margin-bottom:10px}
      .rec-datos{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;margin-bottom:10px}
      .rec-dato{display:flex;justify-content:space-between;font-size:10px;border-bottom:1px dotted #e0e0e0;padding:3px 0;gap:8px}
      .rec-dlbl{color:#777;white-space:nowrap}
      .rec-dval{font-weight:700;color:#111;text-align:right}
      .rec-table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:4px}
      .rec-table thead th{padding:4px 6px;border-bottom:2px solid #ddd;font-size:9px;font-weight:700}
      .rec-table tbody td{padding:3px 6px;border-bottom:1px solid #f0f0f0}
      .rec-neto{display:flex;justify-content:space-between;align-items:center;background:#f0fdf4;border-top:2px solid #86efac;padding:10px 12px;border-radius:4px;margin:8px 0}
      .rec-neto-label{font-weight:700;font-size:13px;color:#15803d}
      .rec-neto-bs{font-weight:700;font-size:18px;color:#15803d}
      .rec-firma{display:flex;gap:40px;margin-top:24px}
      .firma-box{flex:1;text-align:center;font-size:9px;color:#555}
      .firma-line{border-top:1px solid #999;margin-bottom:4px;margin-top:30px}
      .rec-footer{font-size:9px;color:#888;margin-top:8px;text-align:right}
      @media print{body{padding:0} @page{size:letter portrait;margin:1.5cm} button{display:none}}
    `;

    const abrirVentana = (titulo, cuerpo, autoprint) => {
      const w = window.open('', '_blank', 'width=900,height=900');
      w.document.write(`<html><head><title>${titulo}</title><style>${reciboCSS}</style></head><body>${cuerpo}</body></html>`);
      w.document.close();
      if (autoprint) setTimeout(() => w.print(), 400);
    };
    const verRecibo          = (i) => abrirVentana(`Recibo Utilidades — ${i.empleado_nombre}`, reciboInner(i), false);
    const descargarReciboPDF = (i) => abrirVentana(`Recibo Utilidades ${i.empleado_nombre} — ${pnom.ejercicio_fiscal}`, reciboInner(i), true);
    const descargarTodos     = () => abrirVentana(`Recibos Utilidades — ${pnom.ejercicio_fiscal}`, pitems.map(reciboInner).join(''), true);

    const enviarReciboEmail = async (i) => {
      if (!i.email) { alert(`${i.empleado_nombre} no tiene correo registrado.`); return; }
      if (!window.confirm(`¿Enviar el recibo de utilidades a ${i.email}?`)) return;
      setReciboEnviando(i.id);
      try {
        await api.post('/nomina/recibo/email', {
          empleado_id: i.empleado_id,
          asunto: `Recibo de pago ${modaUp === 'ANTICIPADA' ? 'anticipado' : 'definitivo'} de utilidades — ejercicio ${pnom.ejercicio_fiscal}`,
          html: `<html><head><meta charset="utf-8"><style>${reciboCSS}</style></head><body>${reciboInner(i)}</body></html>`,
        });
        alert(`Recibo enviado a ${i.email}`);
      } catch (e) {
        alert(e.response?.data?.error || 'No se pudo enviar el correo');
      } finally { setReciboEnviando(null); }
    };

    const iconBtn = (titulo, contenido, onClick, color) => (
      <button title={titulo} onClick={onClick}
        style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd', background: '#fff',
          cursor: 'pointer', fontSize: 15, lineHeight: 1, color: color || '#444' }}>
        {contenido}
      </button>
    );

    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>
              Recibos de pago — nómina {modalLabel(pnom.modalidad)} de utilidades
            </span>
            <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft: 8 }}>{pnom.estado}</span>
          </div>
          <button className="btn btn-secondary"
            onClick={() => recibosModo === 'lista' ? setRecibosModo('inicio') : setShowRecibos(false)}>← Volver</button>
        </div>
        <div style={{ color: '#555', fontSize: 13, marginBottom: 20 }}>
          {pemp?.razon_social} | Ejercicio: <strong>{pnom.ejercicio_fiscal}</strong> | {pitems.length} trabajador{pitems.length !== 1 ? 'es' : ''}
        </div>

        {recibosModo === 'inicio' && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <button onClick={() => setRecibosModo('lista')}
              style={{ flex: '1 1 280px', maxWidth: 360, textAlign: 'left', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 10, padding: 20, background: '#fff' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>👁️</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>Ver recibos de pago</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                Listado de trabajadores: visualizar, enviar por correo o descargar el recibo de cada uno.
              </div>
            </button>
            <button onClick={descargarTodos}
              style={{ flex: '1 1 280px', maxWidth: 360, textAlign: 'left', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 10, padding: 20, background: '#fff' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⬇️</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>Descargar todos los recibos de pago</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                Genera un único PDF con un recibo por hoja (tamaño carta, vertical) para todos los trabajadores.
              </div>
            </button>
          </div>
        )}

        {recibosModo === 'lista' && (
          <table>
            <thead>
              <tr>
                <th>#</th><th>Trabajador</th><th>C.I.</th><th>Cargo</th><th>Departamento</th><th>Correo</th>
                <th style={{ textAlign: 'right' }}>Neto a cobrar</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pitems.map((i, idx) => (
                <tr key={i.id}>
                  <td>{idx + 1}</td>
                  <td className="fw-600">{i.empleado_nombre}</td>
                  <td>{i.letra_ci || 'V'}-{i.cedula}</td>
                  <td>{i.cargo || '—'}</td>
                  <td>{i.departamento || '—'}</td>
                  <td style={{ fontSize: 12, color: i.email ? '#444' : '#c00' }}>{i.email || 'Sin correo'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{fmtBsR(i.neto_bs)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      {iconBtn('Ver recibo', '👁️', () => verRecibo(i), '#1d4ed8')}
                      {iconBtn(i.email ? 'Enviar al correo del trabajador' : 'Sin correo registrado',
                        reciboEnviando === i.id ? '…' : '✉️', () => enviarReciboEmail(i), '#b45309')}
                      {iconBtn('Descargar PDF individual', '⬇️', () => descargarReciboPDF(i), '#15803d')}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── PRE-NÓMINA / REPORTE DE NÓMINA DE UTILIDADES ────────────
  if ((showPre || showReporte) && selected) {
    const modoReporte = showReporte;
    const { nomina: pnom, items: pitems, empresa: pemp, usuario_nombre: pusuario } = selected;
    const modaUp = modalUpper(pnom.modalidad);
    const sum = k => pitems.reduce((a, i) => a + Number(i[k] || 0), 0);
    const handlePrint = () => {
      const content = document.getElementById('prenomina-util-content').innerHTML;
      const w = window.open('', '_blank', 'width=900,height=800');
      w.document.write(`<html><head><title>${modoReporte ? 'Reporte' : 'Pre-nómina'} Utilidades ${pnom.ejercicio_fiscal}</title>
        <style>
          *{box-sizing:border-box}
          body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0;padding:16px}
          h2{font-size:15px;margin:0;text-align:center}
          .titulo{text-align:center;font-weight:700;font-size:13px;margin:4px 0 10px}
          .wcard{border:1px solid #ccc;border-radius:6px;padding:12px 14px;margin-bottom:12px;page-break-inside:avoid}
          .wname{font-weight:700;font-size:12px;border-bottom:1px solid #eee;padding-bottom:4px;margin-bottom:6px}
          table{width:100%;border-collapse:collapse;font-size:11px}
          td{padding:3px 6px;border-bottom:1px solid #f0f0f0}
          .r{text-align:right}
          .resumen{border:2px solid #111;border-radius:6px;padding:12px 14px;margin-top:8px}
          @page{size:letter portrait;margin:1.4cm}
        </style></head><body>${content}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 400);
    };
    const cRow = (lbl, val, color) => (
      <tr><td>{lbl}</td><td className="r" style={{ color: color || '#111', fontWeight: color ? 700 : 400 }}>{fmtBs(val)}</td></tr>
    );
    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>
              {modoReporte
                ? `Reporte de nómina ${modalLabel(pnom.modalidad)} de utilidades`
                : `Pre-nómina ${modalLabel(pnom.modalidad)} de utilidades`}
            </span>
            {modoReporte
              ? <span className={`badge ${estadoNomBadge[pnom.estado]}`} style={{ marginLeft: 8 }}>{pnom.estado}</span>
              : <span className="badge badge-naranja" style={{ marginLeft: 8 }}>BORRADOR — pendiente de cierre</span>}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handlePrint}>Imprimir / Guardar PDF</button>
            <button className="btn btn-secondary"
              onClick={() => modoReporte ? setShowReporte(false) : setShowPre(false)}>← Volver</button>
          </div>
        </div>
        <div id="prenomina-util-content">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <h2 style={{ color: '#111', margin: 0 }}>{pemp?.razon_social || 'Empresa'}</h2>
            </div>
            {pemp?.logo_path && (
              <ImagenProtegida src="/empresas/logo" alt="Logo empresa"
                style={{ height: 56, maxWidth: 160, objectFit: 'contain' }} />
            )}
          </div>
          <div className="titulo" style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, color: '#111', margin: '4px 0 4px' }}>
            {modoReporte ? `REPORTE DE NÓMINA ${modaUp}` : `PRE-NÓMINA ${modaUp}`} DE UTILIDADES / BONIFICACIÓN DE FIN DE AÑO — {pnom.ejercicio_fiscal}
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#555', marginBottom: 16 }}>
            RIF: <strong style={{ color: '#111' }}>{pemp?.rif || '—'}</strong> &nbsp;|&nbsp;
            Trabajadores: <strong style={{ color: '#111' }}>{pitems.length}</strong>
          </div>
          {pitems.map(i => (
            <div key={i.id} className="wcard" style={{ border: '1px solid #ddd', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
              <div className="wname" style={{ fontWeight: 700, fontSize: 13, color: '#111', borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 6 }}>
                {i.empleado_nombre} <span style={{ color: '#888', fontWeight: 400, fontSize: 11 }}>· C.I. {i.letra_ci || 'V'}-{i.cedula}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {cRow('Suma de provisiones', i.provisiones_bs)}
                  {cRow('Monto distribuible', i.distribuible_bs)}
                  {cRow('Monto a pagar (total asignaciones)', i.monto_total_bs, '#1d4ed8')}
                  {cRow('F.A.O.V. (1%)', i.faov_bs, '#CC0000')}
                  {cRow('I.N.C.E.S. (0,5%)', i.inces_bs, '#CC0000')}
                  {cRow('Anticipo pagado', i.anticipo_bs, '#CC0000')}
                  {cRow('Total deducciones', Number(i.retenciones_bs || 0) + Number(i.anticipo_bs || 0), '#CC0000')}
                  {cRow('Neto a cobrar', i.neto_bs, '#15803d')}
                </tbody>
              </table>
            </div>
          ))}
          <div className="resumen" style={{ border: '2px solid #111', borderRadius: 8, padding: '14px 16px', marginTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#111', marginBottom: 8, textTransform: 'uppercase' }}>Resumen General</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                <tr><td>Cantidad de trabajadores</td><td className="r" style={{ fontWeight: 700 }}>{pitems.length}</td></tr>
                <tr><td>Total monto a pagar</td><td className="r" style={{ fontWeight: 700, color: '#1d4ed8' }}>{fmtBs(sum('monto_total_bs'))}</td></tr>
                <tr><td>Total retenciones</td><td className="r" style={{ color: '#CC0000' }}>{fmtBs(sum('retenciones_bs'))}</td></tr>
                <tr><td>Total anticipos</td><td className="r" style={{ color: '#CC0000' }}>{fmtBs(sum('anticipo_bs'))}</td></tr>
                <tr><td style={{ fontWeight: 700, fontSize: 13 }}>Total neto a pagar</td>
                  <td className="r" style={{ fontWeight: 700, fontSize: 14, color: '#15803d' }}>{fmtBs(sum('neto_bs'))}</td></tr>
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: '#666' }}>
            {modoReporte
              ? `Reporte generado el ${dayjs().format('DD/MM/YYYY HH:mm')} — Nómina ${pnom.estado}.`
              : `Pre-nómina generada el ${dayjs().format('DD/MM/YYYY HH:mm')} — Estado BORRADOR, sujeta a cambios antes del cierre.`}
            {pusuario && <span> — Procesado por: <strong>{pusuario}</strong></span>}
          </div>
        </div>
      </div>
    );
  }

  // ── DETALLE DE NÓMINA DE UTILIDADES ─────────────────────────
  if (selected) {
    const { nomina: n, items } = selected;
    const borrador = n.estado === 'BORRADOR';
    const cerrada  = n.estado === 'CERRADA';
    return (
      <div>
        <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>← Volver</button>
            <span style={{ marginLeft: 12, fontWeight: 700, fontSize: 16 }}>
              {nombreNomina(n)} — ejercicio {n.ejercicio_fiscal}
            </span>
            <span className={`badge ${borrador ? 'badge-gris' : 'badge-verde'}`} style={{ marginLeft: 6 }}>{n.estado}</span>
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {borrador && (
              <button className="btn btn-secondary" onClick={handleProcesar} disabled={procesando}>
                {procesando ? 'Procesando...' : 'Calcular automático'}
              </button>
            )}
            {borrador && items.length > 0 && (
              <button className="btn btn-secondary" onClick={() => setShowPre(true)}>Ver Pre-nómina</button>
            )}
            {borrador && items.length > 0 && (
              <button className="btn btn-primary" onClick={handleCerrar}>Cerrar nómina</button>
            )}
          </div>
        </div>
        {cerrada && items.length > 0 && (
          <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, color: '#666' }}>
              Reportes y pagos
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowResumen(true)}>
                Resumen de nómina {modalLabel(n.modalidad)} de utilidades
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowReporte(true)}>
                Reporte de nómina {modalLabel(n.modalidad)} de utilidades
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowParafiscales(true)}>
                Reporte de parafiscales {modalLabel(n.modalidad)} de utilidades
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowTxtPago(true)}>
                Archivo .TXT para pago de utilidades
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setRecibosModo('inicio'); setShowRecibos(true); }}>
                Recibos de pago {modalLabel(n.modalidad)} de utilidades
              </button>
            </div>
          </div>
        )}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Detalle por trabajador</div>
            <div className="text-sm text-gris">{items.length} trabajador(es)</div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Trabajador</th><th>Cédula</th>
                  <th style={{ textAlign: 'right', color: '#1d4ed8' }}>Total asignaciones Bs.</th>
                  <th style={{ textAlign: 'right', color: '#CC0000' }}>Total deducciones Bs.</th>
                  <th style={{ textAlign: 'right', color: '#15803d' }}>Neto a cobrar Bs.</th>
                  {borrador && <th>Ajustar nómina</th>}
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id}>
                    <td className="fw-600">{i.empleado_nombre}</td>
                    <td className="text-sm text-gris">{i.letra_ci || 'V'}-{i.cedula}</td>
                    <td style={{ textAlign: 'right', color: '#1d4ed8' }}>{fmtBs(i.monto_total_bs)}</td>
                    <td style={{ textAlign: 'right', color: '#CC0000' }}>
                      {fmtBs(Number(i.retenciones_bs || 0) + Number(i.anticipo_bs || 0))}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{fmtBs(i.neto_bs)}</td>
                    {borrador && (
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleAjustar(i)}>
                          Ajustar nómina
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={borrador ? 6 : 5} className="text-gris text-sm" style={{ textAlign: 'center', padding: 24 }}>
                    Sin datos. Use "Calcular automático" para procesar.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── LISTA DE NÓMINAS DE UTILIDADES ──────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span style={{ fontWeight: 700, fontSize: 16 }}>Cálculo general de utilidades</span>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => { setFormNueva({ ejercicio_fiscal: dayjs().year(), modalidad: 'ANTICIPADO' }); setModalNueva(true); }}>
            + Nueva nómina de utilidades
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onBack}>← Volver</button>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Nóminas de utilidades</div></div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Ejercicio fiscal</th><th>Modalidad</th><th>Estado</th>
                <th style={{ textAlign: 'right' }}>Trabajadores</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {nominas.map(n => (
                <tr key={n.id}>
                  <td className="fw-600">{n.ejercicio_fiscal}</td>
                  <td>{n.modalidad === 'DEFINITIVO' ? 'Definitiva' : 'Anticipada'}</td>
                  <td><span className={`badge ${n.estado === 'CERRADA' ? 'badge-verde' : 'badge-gris'}`}>{n.estado}</span></td>
                  <td style={{ textAlign: 'right' }}>{n.trabajadores}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => loadDetalle(n.id)}>Ver detalles</button>
                      {n.estado === 'BORRADOR' && (
                        <button className="btn btn-sm" style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none' }}
                          onClick={() => handleEliminar(n)}>Eliminar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {nominas.length === 0 && (
                <tr><td colSpan={5} className="text-gris text-sm" style={{ textAlign: 'center', padding: 24 }}>
                  No hay nóminas de utilidades. Cree una para comenzar.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalNueva && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 440, maxWidth: '92vw' }}>
            <div className="card-header"><div className="card-title">Nueva nómina de utilidades</div></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Ejercicio fiscal *</label>
                <input className="form-control" type="number" min="2000" max="2099"
                  value={formNueva.ejercicio_fiscal}
                  onChange={e => setFormNueva(f => ({ ...f, ejercicio_fiscal: Number(e.target.value) }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de cálculo *</label>
                <select className="form-control" value={formNueva.modalidad}
                  onChange={e => setFormNueva(f => ({ ...f, modalidad: e.target.value }))}>
                  <option value="ANTICIPADO">Cálculo anticipado</option>
                  <option value="DEFINITIVO">Cálculo definitivo</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: 16 }}>
              <button className="btn btn-secondary" onClick={() => setModalNueva(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCrear}>Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UTILIDADES / BONIFICACIÓN DE FIN DE AÑO
// ─────────────────────────────────────────────────────────────
function UtilidadesTab() {
  const [vista, setVista]       = useState('menu'); // menu | anteriores | actual | fraccionado | general
  const [calculos, setCalculos] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [ejercicio, setEjercicio] = useState('');
  const anioActual = dayjs().year();

  const fmtBs = v => `Bs. ${Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/nomina/utilidades');
      setCalculos(r.data || []);
    } catch { setCalculos([]); }
    setLoading(false);
  };

  const abrirConsulta = (v) => { setVista(v); load(); };

  const aniosAnteriores = [...new Set(
    calculos.map(c => Number(c.ejercicio_fiscal)).filter(a => a && a < anioActual)
  )].sort((a, b) => b - a);

  const filtrados = vista === 'actual'
    ? calculos.filter(c => Number(c.ejercicio_fiscal) === anioActual)
    : calculos.filter(c => ejercicio && Number(c.ejercicio_fiscal) === Number(ejercicio));

  const estadoBadge = e =>
    e === 'CERRADA' ? 'badge-verde' : e === 'APROBADA' ? 'badge-azul' : 'badge-gris';

  const Tabla = ({ rows }) => (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Trabajador</th><th>C.I.</th><th>Tipo</th><th>Fecha cálculo</th>
            <th style={{ textAlign: 'right' }}>Días</th>
            <th style={{ textAlign: 'right' }}>Monto total Bs.</th>
            <th style={{ textAlign: 'right', color: '#CC0000' }}>Retenciones Bs.</th>
            <th style={{ textAlign: 'right', color: '#15803d' }}>Neto Bs.</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.id}>
              <td className="fw-600">{c.empleado_nombre}</td>
              <td className="text-sm text-gris">{c.letra_ci || 'V'}-{c.cedula}</td>
              <td>{c.tipo === 'FRACCIONADO' ? 'Fraccionado' : 'General'}</td>
              <td className="text-sm">{c.fecha_calculo ? dayjs(c.fecha_calculo).format('DD/MM/YYYY') : '—'}</td>
              <td style={{ textAlign: 'right' }}>{c.dias_utilidades}</td>
              <td style={{ textAlign: 'right' }}>{fmtBs(c.monto_total_bs)}</td>
              <td style={{ textAlign: 'right', color: '#CC0000' }}>{fmtBs(c.retenciones_bs)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{fmtBs(c.neto_bs)}</td>
              <td><span className={`badge ${estadoBadge(c.estado)}`}>{c.estado || 'BORRADOR'}</span></td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={9} className="text-gris text-sm" style={{ textAlign: 'center', padding: 24 }}>
              No hay cálculos de utilidades para mostrar.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  // ── CONSULTA — EJERCICIOS ANTERIORES ────────────────────────
  if (vista === 'anteriores') {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <span style={{ fontWeight: 700, fontSize: 16 }}>Cálculos de ejercicios fiscales anteriores</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setVista('menu')}>← Volver</button>
        </div>
        <div className="card" style={{ marginBottom: 16, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label className="form-label" style={{ margin: 0 }}>Ejercicio fiscal:</label>
            <select className="form-control" style={{ maxWidth: 200 }}
              value={ejercicio} onChange={e => setEjercicio(e.target.value)}>
              <option value="">Seleccionar año...</option>
              {aniosAnteriores.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className="text-sm text-gris">Solo consulta — los ejercicios cerrados no son editables.</span>
          </div>
        </div>
        {loading ? <p className="text-gris" style={{ padding: 24, textAlign: 'center' }}>Cargando...</p>
          : !ejercicio ? (
            <div className="card text-gris" style={{ padding: 24, textAlign: 'center' }}>
              Seleccione un ejercicio fiscal para ver los cálculos.
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Utilidades — ejercicio {ejercicio}</div>
                <div className="text-sm text-gris">{filtrados.length} cálculo(s)</div>
              </div>
              <Tabla rows={filtrados} />
            </div>
          )}
      </div>
    );
  }

  // ── CONSULTA — EJERCICIO ACTUAL ─────────────────────────────
  if (vista === 'actual') {
    const rows = calculos.filter(c => Number(c.ejercicio_fiscal) === anioActual);
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <span style={{ fontWeight: 700, fontSize: 16 }}>Cálculos del ejercicio fiscal actual ({anioActual})</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setVista('menu')}>← Volver</button>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Cálculos fraccionados o anticipados — {anioActual}</div>
            <div className="text-sm text-gris">{rows.length} cálculo(s) · solo consulta</div>
          </div>
          {loading ? <p className="text-gris" style={{ padding: 24, textAlign: 'center' }}>Cargando...</p>
            : <Tabla rows={rows} />}
        </div>
      </div>
    );
  }

  // ── CÁLCULO FRACCIONADO ─────────────────────────────────────
  if (vista === 'fraccionado') {
    return <UtilidadesFraccionado onBack={() => setVista('menu')} />;
  }

  // ── CÁLCULO GENERAL ─────────────────────────────────────────
  if (vista === 'general') {
    return <UtilidadesGeneral onBack={() => setVista('menu')} />;
  }

  // ── MENÚ — 4 CTAs ───────────────────────────────────────────
  const cta = (titulo, desc, icono, onClick, color) => (
    <button onClick={onClick}
      style={{ textAlign: 'left', cursor: 'pointer', border: '1.5px solid #e5e7eb', borderRadius: 10,
        padding: 20, background: '#fff' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icono}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>{titulo}</div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{desc}</div>
    </button>
  );

  return (
    <div>
      <p className="text-gris text-sm" style={{ marginBottom: 16 }}>
        Utilidades / Bonificación de fin de año — LOTTT art. 131–140.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {cta('Consulta de cálculos de ejercicios fiscales anteriores',
          'Cálculos de años anteriores, solo consulta (no editables una vez cerrados).',
          '📚', () => abrirConsulta('anteriores'), '#1d4ed8')}
        {cta('Consulta de cálculos del ejercicio fiscal actual',
          `Cálculos fraccionados o anticipados del año ${anioActual}, solo consulta.`,
          '📅', () => abrirConsulta('actual'), '#1d4ed8')}
        {cta('Cálculo fraccionado',
          'Cálculo de utilidades por trabajador a partir de las provisiones de los ciclos del ejercicio.',
          '➗', () => setVista('fraccionado'), '#CC0000')}
        {cta('Cálculo general',
          'Nómina de utilidades / bonificación de fin de año para todos los trabajadores.',
          '🧮', () => setVista('general'), '#CC0000')}
      </div>
    </div>
  );
}

const NOMINA_MENU = [
  { key: 'nominas',         label: 'Nómina de Salarios'   },
  { key: 'cesta',           label: 'Cesta Ticket'          },
  { key: 'vacaciones',      label: 'Vacaciones'            },
  { key: 'utilidades',      label: 'Utilidades / Bonificación de fin de año' },
  { key: 'ppss',            label: 'Prestaciones Sociales' },
  { key: 'constancias',     label: 'Constancias'           },
  { key: 'liquidaciones',   label: 'Egresos'               },
  { key: 'nomina_especial', label: 'Nómina especial'       },
  { key: 'reportes',        label: 'Reportes'              },
  { key: 'empleados',       label: 'Trabajadores'          },
  { key: 'recursos',        label: 'Recursos'              },
  { key: 'config',          label: 'Configuración'         },
];

export function NominaPage({ initialTab = null }) {
  const [tab, setTab] = useState(initialTab);

  const activeLabel = NOMINA_MENU.find(m => m.key === tab)?.label || '';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          {tab ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 13, padding: '4px 12px' }}
                onClick={() => setTab(null)}>
                ← Remuneraciones
              </button>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>{activeLabel}</h2>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Remuneraciones</h2>
              <p className="text-gris text-sm">Nómina · IVSS · FAOV · RNET · Archivos planos</p>
            </>
          )}
        </div>
      </div>

      {!tab && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 16,
          marginTop: 8,
        }}>
          {NOMINA_MENU.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                background: '#fff',
                border: '1.5px solid #e5e7eb',
                borderRadius: 10,
                padding: '28px 16px',
                cursor: 'pointer',
                textAlign: 'center',
                fontWeight: 600,
                fontSize: 14,
                color: '#111',
                transition: 'border-color .15s, box-shadow .15s',
                lineHeight: 1.35,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#CC0000';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(204,0,0,.12)';
                e.currentTarget.style.color = '#CC0000';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.color = '#111';
              }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'nominas'         && <NominasTab />}
      {tab === 'cesta'           && <CestaTicketTab />}
      {tab === 'vacaciones'      && <VacacionesTab />}
      {tab === 'utilidades'      && <UtilidadesTab />}
      {tab === 'ppss'            && <ModuloEnDesarrollo nombre="Prestaciones Sociales" />}
      {tab === 'constancias'     && <ModuloEnDesarrollo nombre="Constancias de trabajo" />}
      {tab === 'liquidaciones'   && <ModuloEnDesarrollo nombre="Egresos"
        incluye="campos para cálculos de liquidación y recibos de pago de liquidación." />}
      {tab === 'nomina_especial' && <ModuloEnDesarrollo nombre="Nóminas especiales"
        incluye="configuración, recibos de pago y archivo .TXT." />}
      {tab === 'reportes'        && <ModuloEnDesarrollo nombre="Reportes" />}
      {tab === 'empleados'       && <EmpleadosTab />}
      {tab === 'recursos'        && <RecursosTab />}
      {tab === 'config'          && <ConfigNominaTab />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TRAYECTORIA LABORAL
// ─────────────────────────────────────────────────────────────
const TIPOS_MOVIMIENTO = [
  'Ingreso',
  'Ascenso',
  'Cambio de cargo',
  'Cambio de departamento',
  'Cambio de funciones',
  'Cambio de salario',
  'Retorno a cargo anterior',
  'Retorno a departamento anterior',
  'Retorno a funciones anteriores',
];

function EmpDropdown({ empleados, value, onSelect, placeholder }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const resultados = q.trim().length >= 1
    ? empleados.filter(e =>
        `${e.nombre} ${e.apellido} ${e.cedula}`.toLowerCase().includes(q.toLowerCase()))
    : [];

  const handlePick = (e) => {
    onSelect(e);
    setQ(`${e.letra_ci || 'V'}-${e.cedula} — ${e.apellido}, ${e.nombre}`);
    setOpen(false);
  };
  const handleClear = () => { onSelect(null); setQ(''); };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="form-control"
          placeholder={placeholder || 'Buscar por C.I. o nombre...'}
          value={value ? `${value.letra_ci || 'V'}-${value.cedula} — ${value.apellido}, ${value.nombre}` : q}
          onChange={e => { setQ(e.target.value); setOpen(true); if (value) onSelect(null); }}
          onFocus={() => setOpen(true)}
          readOnly={!!value}
          style={{ flex: 1 }}
          autoComplete="off"
        />
        {value && (
          <button type="button" onClick={handleClear}
            style={{ background: 'none', border: '1px solid #333', borderRadius: 6,
              color: '#aaa', cursor: 'pointer', padding: '0 10px', fontSize: 13 }}>×</button>
        )}
      </div>
      {open && !value && resultados.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0,
          border: '1px solid #2a2a2a', borderRadius: 6, marginTop: 2,
          background: '#161616', maxHeight: 180, overflowY: 'auto' }}>
          {resultados.slice(0, 10).map(e => (
            <button key={e.id} type="button" onClick={() => handlePick(e)}
              style={{ display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 12px', background: 'none', border: 'none',
                borderBottom: '1px solid #222', cursor: 'pointer', color: '#ccc', fontSize: 13 }}
              onMouseEnter={ev => ev.currentTarget.style.background = '#222'}
              onMouseLeave={ev => ev.currentTarget.style.background = 'none'}>
              <strong style={{ color: '#fff' }}>{e.letra_ci || 'V'}-{e.cedula}</strong>
              {' — '}{e.apellido}, {e.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TrayectoriaLaboralPage() {
  const [empleados, setEmpleados]       = useState([]);
  const [buscar, setBuscar]             = useState('');
  const [selEmp, setSelEmp]             = useState(null);
  const [trayectoria, setTrayectoria]   = useState([]);
  const [loading, setLoading]           = useState(false);
  const [monedaNomina, setMonedaNomina] = useState('USD');
  const [modal, setModal]               = useState(false);
  const [guardando, setGuardando]       = useState(false);
  const [err, setErr]                   = useState('');

  const emptyForm = {
    tipo_movimiento: '', motivo: '',
    cargo: '', departamento: '',
    salario_base: '', moneda: monedaNomina,
    fecha_aplicacion: dayjs().format('YYYY-MM-DD'), fecha_finalizacion: '',
    supervisor: null,
    periodo_prueba: false, periodo_prueba_dias: '',
    notas: '',
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    api.get('/nomina/empleados').then(r => setEmpleados(r.data)).catch(() => {});
    api.get('/nomina/config').then(r => setMonedaNomina(r.data.moneda_nomina || 'USD')).catch(() => {});
  }, []);

  const filtrados = buscar.trim().length >= 1
    ? empleados.filter(e =>
        `${e.nombre} ${e.apellido} ${e.cedula} ${e.letra_ci || 'V'}-${e.cedula}`
          .toLowerCase().includes(buscar.toLowerCase()))
    : [];

  const cargarTrayectoria = async (emp) => {
    setLoading(true);
    try {
      const r = await api.get(`/nomina/trayectoria?empleado_id=${emp.id}`);
      setTrayectoria(r.data);
    } catch { setTrayectoria([]); }
    finally { setLoading(false); }
  };

  const handleSelect = async (emp) => {
    setSelEmp(emp);
    setBuscar(`${emp.nombre} ${emp.apellido}`);
    await cargarTrayectoria(emp);
  };

  const handleLimpiar = () => { setSelEmp(null); setBuscar(''); setTrayectoria([]); };

  const handleOpenModal = () => {
    setForm({ ...emptyForm, moneda: monedaNomina });
    setErr('');
    setModal(true);
  };

  const handleGuardar = async () => {
    setErr('');
    if (!form.tipo_movimiento) return setErr('Selecciona el tipo de movimiento.');
    if (!form.motivo.trim())   return setErr('El motivo es obligatorio.');
    if (!form.cargo.trim())    return setErr('La denominación del cargo es obligatoria.');
    if (!form.departamento.trim()) return setErr('La denominación del departamento es obligatoria.');
    if (!form.salario_base)    return setErr('El salario base es obligatorio.');
    if (!form.fecha_aplicacion) return setErr('La fecha de aplicación es obligatoria.');
    if (form.periodo_prueba && !form.periodo_prueba_dias) return setErr('Ingresa el número de días del período de prueba.');

    setGuardando(true);
    try {
      await api.post('/nomina/trayectoria', {
        empleado_id:        selEmp.id,
        tipo_movimiento:    form.tipo_movimiento,
        motivo:             form.motivo,
        cargo:              form.cargo,
        departamento:       form.departamento,
        salario_base:       form.salario_base,
        moneda:             form.moneda,
        fecha_aplicacion:   form.fecha_aplicacion,
        fecha_finalizacion: form.fecha_finalizacion || null,
        supervisor_id:      form.supervisor?.id || null,
        periodo_prueba:     form.periodo_prueba,
        periodo_prueba_dias: form.periodo_prueba ? Number(form.periodo_prueba_dias) : null,
        notas:              form.notas || null,
      });
      setModal(false);
      await cargarTrayectoria(selEmp);
    } catch (e) {
      setErr(e.response?.data?.error || 'Error al guardar');
    } finally { setGuardando(false); }
  };

  const fmtSalario = (monto, moneda) => {
    const n = Number(monto || 0);
    const sym = (moneda || monedaNomina) === 'BS' ? 'Bs.' : '$';
    return `${sym} ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const vigente = trayectoria.find(t => !t.fecha_finalizacion);

  const inputStyle = { marginBottom: 0 };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Trayectoria Laboral</h2>
          <p className="text-gris text-sm">Historial de cargos, departamento y salario por trabajador</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleOpenModal}
          disabled={!selEmp}>
          + Nuevo movimiento
        </button>
      </div>

      {/* Buscador principal */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <label className="form-label" style={{ marginBottom: 6 }}>
          Buscar trabajador por C.I. o nombre
        </label>
        <div style={{ position: 'relative' }}>
          <input
            className="form-control"
            placeholder="Escriba nombre o número de cédula..."
            value={buscar}
            onChange={e => { setBuscar(e.target.value); if (!e.target.value) handleLimpiar(); }}
            style={{ paddingRight: selEmp ? 90 : 16 }}
            autoComplete="off"
          />
          {selEmp && (
            <button onClick={handleLimpiar}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 13 }}>
              × Limpiar
            </button>
          )}
        </div>
        {!selEmp && filtrados.length > 0 && (
          <div style={{ border: '1px solid #2a2a2a', borderRadius: 6, marginTop: 4,
            background: '#161616', maxHeight: 200, overflowY: 'auto' }}>
            {filtrados.slice(0, 12).map(e => (
              <button key={e.id} onClick={() => handleSelect(e)}
                style={{ display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', background: 'none', border: 'none',
                  borderBottom: '1px solid #222', cursor: 'pointer', color: '#ccc', fontSize: 13 }}
                onMouseEnter={ev => ev.currentTarget.style.background = '#222'}
                onMouseLeave={ev => ev.currentTarget.style.background = 'none'}>
                <strong style={{ color: '#fff' }}>{e.letra_ci || 'V'}-{e.cedula}</strong>
                {' — '}{e.apellido}, {e.nombre}
                {e.cargo ? <span style={{ color: '#777', marginLeft: 6 }}>{e.cargo}</span> : null}
              </button>
            ))}
          </div>
        )}
        {!selEmp && buscar.trim().length >= 1 && filtrados.length === 0 && (
          <p style={{ fontSize: 12, color: '#777', marginTop: 8 }}>Sin resultados para "{buscar}"</p>
        )}
        {!selEmp && (
          <p style={{ fontSize: 12, color: '#555', marginTop: 8 }}>
            Selecciona un trabajador para ver su trayectoria y registrar movimientos.
          </p>
        )}
      </div>

      {/* Tarjeta del trabajador seleccionado */}
      {selEmp && (
        <>
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {selEmp.apellido}, {selEmp.nombre}
                  {selEmp.segundo_nombre ? ' ' + selEmp.segundo_nombre : ''}
                  {selEmp.segundo_apellido ? ' ' + selEmp.segundo_apellido : ''}
                </div>
                <div style={{ fontSize: 13, color: '#aaa', marginTop: 2 }}>
                  C.I.: {selEmp.letra_ci || 'V'}-{selEmp.cedula}
                  {selEmp.numero_expediente ? <span style={{ marginLeft: 12 }}>Exp.: {selEmp.numero_expediente}</span> : null}
                </div>
                {vigente && (
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    <span className="badge badge-verde" style={{ marginRight: 6 }}>Cargo vigente</span>
                    <strong>{vigente.cargo}</strong>
                    {vigente.departamento ? <span style={{ color: '#aaa' }}> · {vigente.departamento}</span> : null}
                    <span style={{ marginLeft: 8, color: '#22c55e', fontWeight: 600 }}>
                      {fmtSalario(vigente.salario_base, vigente.moneda)}
                    </span>
                  </div>
                )}
                {!vigente && !loading && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#777' }}>Sin cargo vigente — registra el primer movimiento.</div>
                )}
              </div>
              <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={handleOpenModal}>
                + Nuevo movimiento
              </button>
            </div>
          </div>

          {/* Tabla de trayectoria */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Historial de movimientos</div>
              <div className="text-sm text-gris">{trayectoria.length} movimiento(s)</div>
            </div>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#777', fontSize: 13 }}>Cargando...</div>
            ) : trayectoria.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#777', fontSize: 13 }}>
                Sin movimientos registrados. Use "+ Nuevo movimiento" para registrar el cargo inicial.
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Tipo</th><th>Cargo</th><th>Departamento</th>
                      <th>Salario</th><th>Desde</th><th>Hasta</th><th>Registrado por</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trayectoria.map(t => (
                      <tr key={t.id}>
                        <td className="text-sm text-gris">{t.tipo_movimiento}</td>
                        <td className="fw-600">
                          {t.cargo}
                          {!t.fecha_finalizacion && (
                            <span className="badge badge-verde" style={{ fontSize: 9, marginLeft: 6 }}>vigente</span>
                          )}
                          {t.periodo_prueba ? (
                            <span className="badge badge-gris" style={{ fontSize: 9, marginLeft: 4 }}>
                              prueba {t.periodo_prueba_dias}d
                            </span>
                          ) : null}
                        </td>
                        <td className="text-gris text-sm">{t.departamento || '—'}</td>
                        <td style={{ fontWeight: 600, color: '#22c55e' }}>
                          {fmtSalario(t.salario_base, t.moneda)}
                        </td>
                        <td className="text-sm">{t.fecha_aplicacion ? dayjs(t.fecha_aplicacion).format('DD/MM/YYYY') : '—'}</td>
                        <td className="text-sm" style={{ color: t.fecha_finalizacion ? '#CC0000' : '#aaa' }}>
                          {t.fecha_finalizacion ? dayjs(t.fecha_finalizacion).format('DD/MM/YYYY') : 'Actual'}
                        </td>
                        <td className="text-gris text-sm">{t.registrado_por || '—'}</td>
                        <td>
                          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                            disabled title="Próximamente">
                            Generar designación
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── MODAL NUEVO MOVIMIENTO ─────────────────────────────── */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div className="modal-title">
                Nuevo movimiento — {selEmp.apellido}, {selEmp.nombre}
              </div>
              <button className="modal-close" onClick={() => setModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-danger mb-3">{err}</div>}

              {/* Tipo + Motivo */}
              <div className="form-grid form-grid-2" style={{ marginBottom: 0 }}>
                <div className="form-group">
                  <label className="form-label">Tipo de movimiento *</label>
                  <select className="form-control" value={form.tipo_movimiento}
                    onChange={e => setForm({ ...form, tipo_movimiento: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {TIPOS_MOVIMIENTO.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de aplicación *</label>
                  <input className="form-control" type="date" value={form.fecha_aplicacion}
                    onChange={e => setForm({ ...form, fecha_aplicacion: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Motivo del movimiento *</label>
                <textarea className="form-control" rows={2} value={form.motivo}
                  onChange={e => setForm({ ...form, motivo: e.target.value })}
                  placeholder="Describa el motivo del movimiento..." style={{ resize: 'vertical' }} />
              </div>

              {/* Cargo y Departamento */}
              <div className="form-grid form-grid-2" style={{ marginBottom: 0 }}>
                <div className="form-group">
                  <label className="form-label">Denominación del cargo *</label>
                  <input className="form-control" value={form.cargo}
                    onChange={e => setForm({ ...form, cargo: e.target.value })}
                    placeholder="Ej: Analista de Sistemas" />
                </div>
                <div className="form-group">
                  <label className="form-label">Denominación del departamento *</label>
                  <input className="form-control" value={form.departamento}
                    onChange={e => setForm({ ...form, departamento: e.target.value })}
                    placeholder="Ej: Tecnología" />
                </div>
              </div>

              {/* Salario + Moneda + Fecha fin */}
              <div className="form-grid form-grid-2" style={{ marginBottom: 0 }}>
                <div className="form-group">
                  <label className="form-label">Salario base *</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="form-control" type="number" min="0" step="0.01"
                      value={form.salario_base} style={{ flex: 1 }}
                      onChange={e => setForm({ ...form, salario_base: e.target.value })}
                      placeholder="0.00" />
                    <select className="form-control" value={form.moneda} style={{ width: 80 }}
                      onChange={e => setForm({ ...form, moneda: e.target.value })}>
                      <option value="USD">USD</option>
                      <option value="BS">Bs.</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de finalización</label>
                  <input className="form-control" type="date" value={form.fecha_finalizacion}
                    onChange={e => setForm({ ...form, fecha_finalizacion: e.target.value })} />
                </div>
              </div>

              {/* Supervisor */}
              <div className="form-group">
                <label className="form-label">Supervisor</label>
                <EmpDropdown
                  empleados={empleados.filter(e => e.id !== selEmp?.id)}
                  value={form.supervisor}
                  onSelect={sup => setForm({ ...form, supervisor: sup })}
                  placeholder="Buscar supervisor por C.I. o nombre..."
                />
              </div>

              {/* Período de prueba */}
              <div className="form-group">
                <label className="form-label">¿Incluir período de prueba?</label>
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="prueba" checked={!form.periodo_prueba}
                      onChange={() => setForm({ ...form, periodo_prueba: false, periodo_prueba_dias: '' })} />
                    No
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="prueba" checked={!!form.periodo_prueba}
                      onChange={() => setForm({ ...form, periodo_prueba: true })} />
                    Sí
                  </label>
                  {form.periodo_prueba && (
                    <input className="form-control" type="number" min="1" max="365"
                      value={form.periodo_prueba_dias} style={{ width: 140 }}
                      onChange={e => setForm({ ...form, periodo_prueba_dias: e.target.value })}
                      placeholder="Número de días" />
                  )}
                </div>
              </div>

              {/* Notas */}
              <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-control" rows={2} value={form.notas}
                  onChange={e => setForm({ ...form, notas: e.target.value })}
                  placeholder="Observaciones adicionales..." style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleGuardar} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Registrar movimiento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CONSTANCIAS DE TRABAJO
// ─────────────────────────────────────────────────────────────
export function ConstanciasPage() {
  const { user } = useAuth();
  const [empleados, setEmpleados] = useState([]);
  const [empresa,   setEmpresa]   = useState(null);
  const [buscar,    setBuscar]    = useState('');
  const [constancias, setConstancias] = useState([]);
  const [vista,     setVista]     = useState('lista');
  const [guardando, setGuardando] = useState(false);
  const [err,       setErr]       = useState('');
  const [preview,   setPreview]   = useState(false);

  const emptyForm = {
    empleado: null, firmante: null,
    dirigida_a: 'interesar', dirigida_personalizada: '',
    incluye_salario: false, incluye_cesta: false, con_membrete: false,
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    api.get('/nomina/empleados').then(r => setEmpleados(r.data)).catch(() => {});
    api.get('/empresas/me').then(r => setEmpresa(r.data)).catch(() => {});
    cargarConstancias();
  }, []);

  const cargarConstancias = async () => {
    try { const r = await api.get('/nomina/constancias'); setConstancias(r.data); }
    catch { setConstancias([]); }
  };

  const filtradosList = buscar.trim().length >= 1
    ? constancias.filter(c =>
        `${c.empleado_nombre} ${c.empleado_cedula}`.toLowerCase().includes(buscar.toLowerCase()))
    : constancias;

  const dirigidaFinal = form.dirigida_a === 'personalizada'
    ? (form.dirigida_personalizada || '')
    : 'A quien pueda interesar';

  const cargoActual = (emp) => emp?.cargo || '—';

  const generarHTML = (emp, firm) => {
    const hoy = new Date();
    const dia = hoy.getDate();
    const mes = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                 'septiembre','octubre','noviembre','diciembre'][hoy.getMonth()];
    const anio = hoy.getFullYear();
    const salarioLine = form.incluye_salario && emp?.salario_base
      ? `<p>Su salario básico mensual es de <strong>${emp.moneda_nomina === 'BS' ? 'Bs.' : 'USD'} ${Number(emp.salario_base).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>.</p>`
      : '';
    const cestaLine = form.incluye_cesta && emp?.cesta_ticket_mensual
      ? `<p>Además percibe beneficio de cesta ticket por un monto de <strong>Bs. ${Number(emp.cesta_ticket_mensual).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong> mensual.</p>`
      : '';
    const firmanteHtml = firm
      ? `<div style="margin-top:60px;text-align:center;"><div style="display:inline-block;text-align:center;"><div style="border-top:1px solid #333;padding-top:6px;min-width:220px;"><strong>${firm.apellido}, ${firm.nombre}</strong><br/><span style="font-size:12px;color:#555;">${firm.cargo || 'Representante de la Empresa'}</span></div></div></div>`
      : '';
    const encabezado = !form.con_membrete
      ? `<div class="header-empresa"><h1>${empresa?.nombre_empresa || empresa?.razon_social || ''}</h1><p>RIF: ${empresa?.rif || ''}</p>${empresa?.direccion ? `<p>${empresa.direccion}</p>` : ''}${empresa?.telefono ? `<p>Tel.: ${empresa.telefono}</p>` : ''}</div>`
      : '';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>@page{size:letter portrait;margin:2.5cm 2.5cm}body{font-family:Arial,sans-serif;font-size:13px;color:#222;line-height:1.6;margin:0}.header-empresa{text-align:center;margin-bottom:30px}.header-empresa h1{font-size:16px;margin:0 0 4px;text-transform:uppercase}.header-empresa p{font-size:12px;margin:0;color:#555}h2.titulo{text-align:center;font-size:14px;text-transform:uppercase;letter-spacing:2px;margin:24px 0 20px;text-decoration:underline}.cuerpo p{margin:0 0 12px;text-align:justify}.pie{margin-top:40px;font-size:11px;color:#888;text-align:center;border-top:1px solid #ddd;padding-top:8px}@media print{body{-webkit-print-color-adjust:exact}}</style>
</head><body>
${encabezado}
<h2 class="titulo">Constancia de Trabajo</h2>
<p><strong>${dirigidaFinal}:</strong></p>
<div class="cuerpo">
<p>Por medio de la presente se hace constar que el/la ciudadano(a) <strong>${emp?.apellido || ''}, ${emp?.nombre || ''}${emp?.segundo_nombre ? ' ' + emp.segundo_nombre : ''}</strong>, portador(a) de la cédula de identidad N° <strong>${emp?.letra_ci || 'V'}-${emp?.cedula || ''}</strong>, presta sus servicios en esta empresa bajo la relación de dependencia laboral, desempeñando el cargo de <strong>${cargoActual(emp)}</strong>, desde el <strong>${emp?.fecha_ingreso ? new Date(emp.fecha_ingreso).toLocaleDateString('es-VE', { year:'numeric', month:'long', day:'numeric', timeZone:'UTC' }) : '—'}</strong>.</p>
${salarioLine}${cestaLine}
<p>Constancia que se expide a petición de la parte interesada, en ${empresa?.ciudad || 'su ciudad'}, a los ${dia} días del mes de ${mes} del año ${anio}.</p>
</div>
${firmanteHtml}
<div class="pie">Generado por: ${user?.nombre || ''} — ${empresa?.nombre_empresa || empresa?.razon_social || ''}</div>
</body></html>`;
  };

  const handlePreview = () => {
    if (!form.empleado) return setErr('Selecciona un trabajador.');
    setErr(''); setPreview(true);
  };

  const handleImprimir = () => {
    if (!form.empleado) return setErr('Selecciona un trabajador.');
    setErr('');
    const w = window.open('', '_blank');
    w.document.write(generarHTML(form.empleado, form.firmante));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  const handleGuardar = async () => {
    if (!form.empleado) return setErr('Selecciona un trabajador.');
    setGuardando(true); setErr('');
    try {
      await api.post('/nomina/constancias', {
        empleado_id: form.empleado.id, firmante_id: form.firmante?.id || null,
        dirigida_a: dirigidaFinal,
        incluye_salario: form.incluye_salario, incluye_cesta: form.incluye_cesta,
        con_membrete: form.con_membrete,
      });
      await cargarConstancias();
      handleImprimir();
      setVista('lista');
    } catch (e) {
      setErr(e.response?.data?.error || 'Error al guardar');
    } finally { setGuardando(false); }
  };

  const soloActivos = empleados.filter(e => e.activo && !e.fecha_egreso);

  if (vista === 'nueva') {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Nueva Constancia de Trabajo</h2>
            <p className="text-gris text-sm">Complete los datos y genere la constancia</p>
          </div>
          <button className="btn btn-secondary" onClick={() => setVista('lista')}>← Volver</button>
        </div>
        {err && <div className="alert alert-danger mb-3">{err}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          <div>
            {/* Trabajador */}
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Trabajador *</div>
              <EmpDropdown
                empleados={soloActivos}
                value={form.empleado}
                onSelect={emp => { setForm({ ...form, empleado: emp }); setPreview(false); }}
                placeholder="Buscar trabajador activo por C.I. o nombre..."
              />
              {form.empleado && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#111',
                  borderRadius: 8, border: '1px solid #2a2a2a', fontSize: 13 }}>
                  <div style={{ fontWeight: 700 }}>
                    {form.empleado.apellido}, {form.empleado.nombre}
                    {form.empleado.segundo_nombre ? ' ' + form.empleado.segundo_nombre : ''}
                  </div>
                  <div className="text-gris" style={{ marginTop: 3 }}>
                    C.I.: {form.empleado.letra_ci || 'V'}-{form.empleado.cedula}
                    {form.empleado.cargo
                      ? <span style={{ marginLeft: 12 }}>Cargo: <strong>{form.empleado.cargo}</strong></span>
                      : null}
                    {form.empleado.fecha_ingreso
                      ? <span style={{ marginLeft: 12 }}>Ingreso: {new Date(form.empleado.fecha_ingreso).toLocaleDateString('es-VE', { timeZone: 'UTC' })}</span>
                      : null}
                  </div>
                </div>
              )}
            </div>

            {/* Opciones */}
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Opciones</div>
              <div className="form-group">
                <label className="form-label">¿A quién va dirigida?</label>
                <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="dirigida" checked={form.dirigida_a !== 'personalizada'}
                      onChange={() => setForm({ ...form, dirigida_a: 'interesar' })} />
                    A quien pueda interesar
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="dirigida" checked={form.dirigida_a === 'personalizada'}
                      onChange={() => setForm({ ...form, dirigida_a: 'personalizada' })} />
                    Personalizada
                  </label>
                </div>
                {form.dirigida_a === 'personalizada' && (
                  <input className="form-control" style={{ marginTop: 8 }}
                    value={form.dirigida_personalizada}
                    onChange={e => setForm({ ...form, dirigida_personalizada: e.target.value })}
                    placeholder="Ej: Embajada de España en Venezuela" />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.incluye_salario}
                    onChange={e => { setForm({ ...form, incluye_salario: e.target.checked }); setPreview(false); }} />
                  Incluir salario base
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.incluye_cesta}
                    onChange={e => { setForm({ ...form, incluye_cesta: e.target.checked }); setPreview(false); }} />
                  Incluir cesta ticket
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.con_membrete}
                    onChange={e => { setForm({ ...form, con_membrete: e.target.checked }); setPreview(false); }} />
                  Agregar hoja membretada (omite encabezado de empresa)
                </label>
              </div>
            </div>

            {/* Firmante */}
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>¿Quién firma?</div>
              <EmpDropdown
                empleados={empleados.filter(e => e.id !== form.empleado?.id)}
                value={form.firmante}
                onSelect={firm => { setForm({ ...form, firmante: firm }); setPreview(false); }}
                placeholder="Buscar firmante por C.I. o nombre..."
              />
              {form.firmante && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#aaa' }}>
                  {form.firmante.cargo || <em>Sin cargo registrado</em>}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={handlePreview} disabled={!form.empleado}>
                Previsualizar constancia
              </button>
              <button className="btn btn-secondary" onClick={handleImprimir} disabled={!form.empleado}>
                Imprimir / PDF
              </button>
              <button className="btn btn-primary" onClick={handleGuardar} disabled={!form.empleado || guardando}>
                {guardando ? 'Guardando...' : 'Generar y registrar constancia'}
              </button>
            </div>
          </div>

          {/* Vista previa */}
          <div className="card" style={{ padding: 16 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Vista previa</div>
            {preview && form.empleado ? (
              <div
                style={{ fontSize: 11, lineHeight: 1.5, color: '#ddd',
                  border: '1px solid #2a2a2a', borderRadius: 6, padding: 12,
                  background: '#0d0d0d', maxHeight: 520, overflowY: 'auto' }}
                dangerouslySetInnerHTML={{ __html: generarHTML(form.empleado, form.firmante) }}
              />
            ) : (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#555', fontSize: 13 }}>
                Selecciona un trabajador y pulsa<br />"Previsualizar constancia"
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Constancias de Trabajo</h2>
          <p className="text-gris text-sm">Historial de constancias emitidas</p>
        </div>
        <button className="btn btn-primary"
          onClick={() => { setForm(emptyForm); setErr(''); setPreview(false); setVista('nueva'); }}>
          + Nueva constancia de trabajo
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <input className="form-control"
          placeholder="Buscar por nombre o cédula del trabajador..."
          value={buscar} onChange={e => setBuscar(e.target.value)} />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Constancias emitidas</div>
          <div className="text-sm text-gris">{filtradosList.length} constancia(s)</div>
        </div>
        {filtradosList.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#777', fontSize: 13 }}>
            {constancias.length === 0
              ? 'No hay constancias emitidas. Use "+ Nueva constancia de trabajo" para crear una.'
              : 'Sin resultados para la búsqueda.'}
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Trabajador</th><th>Dirigida a</th>
                  <th>Firmante</th><th>Opciones</th><th>Registrado por</th><th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {filtradosList.map(c => (
                  <tr key={c.id}>
                    <td className="text-gris text-sm">{c.id}</td>
                    <td className="fw-600">
                      {c.empleado_nombre}
                      <div style={{ fontSize: 11, color: '#777' }}>{c.letra_ci || 'V'}-{c.empleado_cedula}</div>
                    </td>
                    <td className="text-sm">{c.dirigida_a}</td>
                    <td className="text-sm text-gris">{c.firmante_nombre || '—'}</td>
                    <td style={{ fontSize: 11 }}>
                      {c.incluye_salario ? <span className="badge badge-gris" style={{ marginRight: 4 }}>Salario</span> : null}
                      {c.incluye_cesta   ? <span className="badge badge-gris" style={{ marginRight: 4 }}>Cesta</span> : null}
                      {c.con_membrete    ? <span className="badge badge-gris">Membrete</span> : null}
                    </td>
                    <td className="text-gris text-sm">{c.registrado_por || '—'}</td>
                    <td className="text-sm">{c.created_at ? new Date(c.created_at).toLocaleDateString('es-VE') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CONSTANCIA DE EGRESO
// ─────────────────────────────────────────────────────────────
export function ConstanciaEgresoPage() {
  const { user } = useAuth();
  const [empleados, setEmpleados] = useState([]);
  const [empresa,   setEmpresa]   = useState(null);
  const [buscar,    setBuscar]    = useState('');
  const [constancias, setConstancias] = useState([]);
  const [vista,     setVista]     = useState('lista');
  const [guardando, setGuardando] = useState(false);
  const [err,       setErr]       = useState('');
  const [preview,   setPreview]   = useState(false);

  const emptyForm = {
    empleado: null, firmante: null,
    dirigida_a: 'interesar', dirigida_personalizada: '',
    con_membrete: false,
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    api.get('/nomina/empleados').then(r => setEmpleados(r.data)).catch(() => {});
    api.get('/empresas/me').then(r => setEmpresa(r.data)).catch(() => {});
    cargarConstancias();
  }, []);

  const cargarConstancias = async () => {
    try { const r = await api.get('/nomina/constancias?tipo=EGRESO'); setConstancias(r.data); }
    catch { setConstancias([]); }
  };

  const filtradosList = buscar.trim().length >= 1
    ? constancias.filter(c =>
        `${c.empleado_nombre} ${c.empleado_cedula}`.toLowerCase().includes(buscar.toLowerCase()))
    : constancias;

  const dirigidaFinal = form.dirigida_a === 'personalizada'
    ? (form.dirigida_personalizada || '')
    : 'A quien pueda interesar';

  const generarHTML = (emp, firm) => {
    const hoy = new Date();
    const dia  = hoy.getDate();
    const mes  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                  'septiembre','octubre','noviembre','diciembre'][hoy.getMonth()];
    const anio = hoy.getFullYear();
    const fechaEgreso = emp?.fecha_egreso
      ? new Date(emp.fecha_egreso).toLocaleDateString('es-VE', { year:'numeric', month:'long', day:'numeric', timeZone:'UTC' })
      : '—';
    const fechaIngreso = emp?.fecha_ingreso
      ? new Date(emp.fecha_ingreso).toLocaleDateString('es-VE', { year:'numeric', month:'long', day:'numeric', timeZone:'UTC' })
      : '—';
    const firmanteHtml = firm
      ? `<div style="margin-top:60px;text-align:center;"><div style="display:inline-block;text-align:center;"><div style="border-top:1px solid #333;padding-top:6px;min-width:220px;"><strong>${firm.apellido}, ${firm.nombre}</strong><br/><span style="font-size:12px;color:#555;">${firm.cargo || 'Representante de la Empresa'}</span></div></div></div>`
      : '';
    const encabezado = !form.con_membrete
      ? `<div class="header-empresa"><h1>${empresa?.nombre_empresa || empresa?.razon_social || ''}</h1><p>RIF: ${empresa?.rif || ''}</p>${empresa?.direccion ? `<p>${empresa.direccion}</p>` : ''}${empresa?.telefono ? `<p>Tel.: ${empresa.telefono}</p>` : ''}</div>`
      : '';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>@page{size:letter portrait;margin:2.5cm 2.5cm}body{font-family:Arial,sans-serif;font-size:13px;color:#222;line-height:1.6;margin:0}.header-empresa{text-align:center;margin-bottom:30px}.header-empresa h1{font-size:16px;margin:0 0 4px;text-transform:uppercase}.header-empresa p{font-size:12px;margin:0;color:#555}h2.titulo{text-align:center;font-size:14px;text-transform:uppercase;letter-spacing:2px;margin:24px 0 20px;text-decoration:underline}.cuerpo p{margin:0 0 12px;text-align:justify}.pie{margin-top:40px;font-size:11px;color:#888;text-align:center;border-top:1px solid #ddd;padding-top:8px}@media print{body{-webkit-print-color-adjust:exact}}</style>
</head><body>
${encabezado}
<h2 class="titulo">Constancia de Egreso</h2>
<p><strong>${dirigidaFinal}:</strong></p>
<div class="cuerpo">
<p>Por medio de la presente se hace constar que el/la ciudadano(a) <strong>${emp?.apellido || ''}, ${emp?.nombre || ''}${emp?.segundo_nombre ? ' ' + emp.segundo_nombre : ''}</strong>, portador(a) de la cédula de identidad N° <strong>${emp?.letra_ci || 'V'}-${emp?.cedula || ''}</strong>, prestó sus servicios en esta empresa bajo la relación de dependencia laboral, desempeñando el cargo de <strong>${emp?.cargo || '—'}</strong>.</p>
<p>Su relación laboral se inició el <strong>${fechaIngreso}</strong> y concluyó el <strong>${fechaEgreso}</strong>, habiendo cumplido con sus responsabilidades de manera satisfactoria durante el período de servicio.</p>
<p>Constancia que se expide a petición de la parte interesada, en ${empresa?.ciudad || 'su ciudad'}, a los ${dia} días del mes de ${mes} del año ${anio}.</p>
</div>
${firmanteHtml}
<div class="pie">Generado por: ${user?.nombre || ''} — ${empresa?.nombre_empresa || empresa?.razon_social || ''}</div>
</body></html>`;
  };

  const handlePreview = () => {
    if (!form.empleado) return setErr('Selecciona un trabajador egresado.');
    setErr(''); setPreview(true);
  };

  const handleImprimir = () => {
    if (!form.empleado) return setErr('Selecciona un trabajador egresado.');
    setErr('');
    const w = window.open('', '_blank');
    w.document.write(generarHTML(form.empleado, form.firmante));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  const handleGuardar = async () => {
    if (!form.empleado) return setErr('Selecciona un trabajador egresado.');
    setGuardando(true); setErr('');
    try {
      await api.post('/nomina/constancias', {
        empleado_id: form.empleado.id, firmante_id: form.firmante?.id || null,
        tipo: 'EGRESO', dirigida_a: dirigidaFinal, con_membrete: form.con_membrete,
      });
      await cargarConstancias();
      handleImprimir();
      setVista('lista');
    } catch (e) {
      setErr(e.response?.data?.error || 'Error al guardar');
    } finally { setGuardando(false); }
  };

  // Solo trabajadores egresados (fecha_egreso presente)
  const egresados = empleados.filter(e => !!e.fecha_egreso);

  if (vista === 'nueva') {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Nueva Constancia de Egreso</h2>
            <p className="text-gris text-sm">Solo disponible para trabajadores egresados</p>
          </div>
          <button className="btn btn-secondary" onClick={() => setVista('lista')}>← Volver</button>
        </div>
        {err && <div className="alert alert-danger mb-3">{err}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          <div>
            {/* Trabajador egresado */}
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Trabajador egresado *</div>
              <EmpDropdown
                empleados={egresados}
                value={form.empleado}
                onSelect={emp => { setForm({ ...form, empleado: emp }); setPreview(false); }}
                placeholder="Buscar trabajador egresado por C.I. o nombre..."
              />
              {form.empleado && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#111',
                  borderRadius: 8, border: '1px solid #2a2a2a', fontSize: 13 }}>
                  <div style={{ fontWeight: 700 }}>
                    {form.empleado.apellido}, {form.empleado.nombre}
                    {form.empleado.segundo_nombre ? ' ' + form.empleado.segundo_nombre : ''}
                  </div>
                  <div className="text-gris" style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                    <span>C.I.: {form.empleado.letra_ci || 'V'}-{form.empleado.cedula}</span>
                    {form.empleado.cargo
                      ? <span>Último cargo: <strong style={{ color: '#ccc' }}>{form.empleado.cargo}</strong></span>
                      : null}
                  </div>
                  <div className="text-gris" style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12 }}>
                    {form.empleado.fecha_ingreso
                      ? <span>Ingreso: {new Date(form.empleado.fecha_ingreso).toLocaleDateString('es-VE', { timeZone: 'UTC' })}</span>
                      : null}
                    {form.empleado.fecha_egreso
                      ? <span style={{ color: '#CC0000' }}>Egreso: <strong>{new Date(form.empleado.fecha_egreso).toLocaleDateString('es-VE', { timeZone: 'UTC' })}</strong></span>
                      : null}
                  </div>
                </div>
              )}
            </div>

            {/* Opciones */}
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Opciones</div>
              <div className="form-group">
                <label className="form-label">¿A quién va dirigida?</label>
                <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="dirigida_egreso" checked={form.dirigida_a !== 'personalizada'}
                      onChange={() => setForm({ ...form, dirigida_a: 'interesar' })} />
                    A quien pueda interesar
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="dirigida_egreso" checked={form.dirigida_a === 'personalizada'}
                      onChange={() => setForm({ ...form, dirigida_a: 'personalizada' })} />
                    Personalizada
                  </label>
                </div>
                {form.dirigida_a === 'personalizada' && (
                  <input className="form-control" style={{ marginTop: 8 }}
                    value={form.dirigida_personalizada}
                    onChange={e => setForm({ ...form, dirigida_personalizada: e.target.value })}
                    placeholder="Ej: Embajada de España en Venezuela" />
                )}
              </div>
              <div style={{ marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.con_membrete}
                    onChange={e => { setForm({ ...form, con_membrete: e.target.checked }); setPreview(false); }} />
                  Agregar hoja membretada (omite encabezado de empresa)
                </label>
              </div>
            </div>

            {/* Firmante */}
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>¿Quién firma?</div>
              <EmpDropdown
                empleados={empleados.filter(e => e.id !== form.empleado?.id)}
                value={form.firmante}
                onSelect={firm => { setForm({ ...form, firmante: firm }); setPreview(false); }}
                placeholder="Buscar firmante por C.I. o nombre..."
              />
              {form.firmante && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#aaa' }}>
                  {form.firmante.cargo || <em>Sin cargo registrado</em>}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={handlePreview} disabled={!form.empleado}>
                Previsualizar constancia de egreso
              </button>
              <button className="btn btn-secondary" onClick={handleImprimir} disabled={!form.empleado}>
                Imprimir / PDF
              </button>
              <button className="btn btn-primary" onClick={handleGuardar} disabled={!form.empleado || guardando}>
                {guardando ? 'Guardando...' : 'Generar y registrar constancia'}
              </button>
            </div>
          </div>

          {/* Vista previa */}
          <div className="card" style={{ padding: 16 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Vista previa</div>
            {preview && form.empleado ? (
              <div
                style={{ fontSize: 11, lineHeight: 1.5, color: '#ddd',
                  border: '1px solid #2a2a2a', borderRadius: 6, padding: 12,
                  background: '#0d0d0d', maxHeight: 520, overflowY: 'auto' }}
                dangerouslySetInnerHTML={{ __html: generarHTML(form.empleado, form.firmante) }}
              />
            ) : (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#555', fontSize: 13 }}>
                Selecciona un trabajador egresado y pulsa<br />"Previsualizar constancia de egreso"
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Constancias de Egreso</h2>
          <p className="text-gris text-sm">Historial de constancias de egreso emitidas</p>
        </div>
        <button className="btn btn-primary"
          onClick={() => { setForm(emptyForm); setErr(''); setPreview(false); setVista('nueva'); }}>
          + Nueva constancia de egreso
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <input className="form-control"
          placeholder="Buscar por nombre o cédula del trabajador..."
          value={buscar} onChange={e => setBuscar(e.target.value)} />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Constancias de egreso emitidas</div>
          <div className="text-sm text-gris">{filtradosList.length} constancia(s)</div>
        </div>
        {filtradosList.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#777', fontSize: 13 }}>
            {constancias.length === 0
              ? 'No hay constancias de egreso emitidas. Use "+ Nueva constancia de egreso" para crear una.'
              : 'Sin resultados para la búsqueda.'}
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Trabajador egresado</th><th>Dirigida a</th>
                  <th>Firmante</th><th>Membrete</th><th>Registrado por</th><th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {filtradosList.map(c => (
                  <tr key={c.id}>
                    <td className="text-gris text-sm">{c.id}</td>
                    <td className="fw-600">
                      {c.empleado_nombre}
                      <div style={{ fontSize: 11, color: '#777' }}>{c.letra_ci || 'V'}-{c.empleado_cedula}</div>
                    </td>
                    <td className="text-sm">{c.dirigida_a}</td>
                    <td className="text-sm text-gris">{c.firmante_nombre || '—'}</td>
                    <td style={{ fontSize: 11 }}>
                      {c.con_membrete ? <span className="badge badge-gris">Membrete</span> : '—'}
                    </td>
                    <td className="text-gris text-sm">{c.registrado_por || '—'}</td>
                    <td className="text-sm">{c.created_at ? new Date(c.created_at).toLocaleDateString('es-VE') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
