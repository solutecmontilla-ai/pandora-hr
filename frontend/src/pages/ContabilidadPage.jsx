import { useState, useEffect } from 'react';
import api from '../utils/api';
import dayjs from 'dayjs';

const fmt = v => `$${Number(v||0).toFixed(2)}`;
const lineaVacia = () => ({ cuenta_id: '', descripcion: '', debe: '', haber: '' });

// ============================================================
export function ContabilidadPage({ initialTab = 'asientos' }) {
  const [tab, setTab] = useState(initialTab);
  const [asientos, setAsientos] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [balComp, setBalComp] = useState([]);
  const [erData, setErData] = useState(null);
  const [mayor, setMayor] = useState(null);
  const [cuentaMayor, setCuentaMayor] = useState('');
  const [periodo, setPeriodo] = useState({ desde: dayjs().startOf('month').format('YYYY-MM-DD'), hasta: dayjs().format('YYYY-MM-DD') });
  const [initOk, setInitOk] = useState(false);
  const [nuevo, setNuevo] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { setTab(initialTab); }, [initialTab]);

  const loadAsientos = () => api.get('/contabilidad/asientos').then(r => setAsientos(r.data));
  const loadCuentas = () => api.get('/contabilidad/cuentas').then(r => { setCuentas(r.data); if (r.data.length) setInitOk(true); });
  useEffect(() => { loadAsientos(); loadCuentas(); }, []);

  const loadBalance = () => api.get(`/contabilidad/balance-comprobacion?hasta=${periodo.hasta}`).then(r => setBalComp(r.data));
  const loadER = () => api.get(`/contabilidad/estado-resultados?desde=${periodo.desde}&hasta=${periodo.hasta}`).then(r => setErData(r.data));
  const loadMayor = () => cuentaMayor && api.get(`/contabilidad/mayor/${cuentaMayor}?desde=${periodo.desde}&hasta=${periodo.hasta}`).then(r => setMayor(r.data));
  useEffect(() => {
    if (tab === 'balance') loadBalance();
    if (tab === 'resultados') loadER();
    if (tab === 'mayor') loadMayor();
  }, [tab, periodo, cuentaMayor]);

  const handleInit = async () => {
    await api.post('/contabilidad/cuentas/inicializar', {});
    loadCuentas();
  };

  const cuentasMovimiento = cuentas.filter(c => Number(c.acepta_movimientos) === 1);

  // ── Nuevo asiento ──────────────────────────────────────────
  const abrirNuevo = () => {
    setError('');
    setNuevo({ fecha: dayjs().format('YYYY-MM-DD'), descripcion: '', tipo: 'MANUAL', contabilizar: false, detalles: [lineaVacia(), lineaVacia()] });
  };
  const setLinea = (i, campo, valor) => setNuevo(n => {
    const detalles = n.detalles.map((l, j) => j === i ? { ...l, [campo]: valor } : l);
    return { ...n, detalles };
  });
  const totalDebe = nuevo ? nuevo.detalles.reduce((s, l) => s + Number(l.debe || 0), 0) : 0;
  const totalHaber = nuevo ? nuevo.detalles.reduce((s, l) => s + Number(l.haber || 0), 0) : 0;
  const cuadra = nuevo && totalDebe > 0 && Math.abs(totalDebe - totalHaber) < 0.001;

  const guardarAsiento = async () => {
    setError('');
    const detalles = nuevo.detalles
      .filter(l => l.cuenta_id && (Number(l.debe) || Number(l.haber)))
      .map(l => ({ ...l, cuenta_id: Number(l.cuenta_id), debe: Number(l.debe || 0), haber: Number(l.haber || 0) }));
    if (!nuevo.descripcion.trim()) return setError('La descripción es obligatoria');
    if (detalles.length < 2) return setError('El asiento necesita al menos dos líneas con cuenta y monto');
    setGuardando(true);
    try {
      await api.post('/contabilidad/asientos', { ...nuevo, detalles });
      setNuevo(null);
      loadAsientos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el asiento');
    } finally { setGuardando(false); }
  };

  const verDetalle = id => api.get(`/contabilidad/asientos/${id}`).then(r => setDetalle(r.data));
  const contabilizar = async id => {
    await api.post(`/contabilidad/asientos/${id}/contabilizar`, {});
    setDetalle(null);
    loadAsientos();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontSize:20, fontWeight:700 }}>Contabilidad</h2>
        <div style={{ display:'flex', gap:8 }}>
          {!initOk && <button className="btn btn-primary" onClick={handleInit}>Inicializar Plan de Cuentas FCCPV</button>}
          {initOk && <button className="btn btn-primary" onClick={abrirNuevo}>+ Nuevo asiento</button>}
        </div>
      </div>

      {!initOk && (
        <div className="alert alert-info">Para empezar, inicializa el plan de cuentas con la plantilla FCCPV. Luego podrás agregar cuentas y registrar asientos.</div>
      )}

      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {[['asientos','Libro Diario'],['cuentas','Plan de Cuentas'],['mayor','Libro Mayor'],['balance','Bal. Comprobación'],['resultados','Estado Resultados']].map(([k,l]) => (
          <button key={k} className={`btn ${tab===k?'btn-primary':'btn-secondary'} btn-sm`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'asientos' && (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead><tr><th>N° Asiento</th><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Debe</th><th>Haber</th><th>Estado</th></tr></thead>
              <tbody>
                {asientos.map(a => (
                  <tr key={a.id} style={{ cursor:'pointer' }} onClick={() => verDetalle(a.id)}>
                    <td className="fw-600">{a.numero_asiento}</td>
                    <td>{dayjs(a.fecha).format('DD/MM/YYYY')}</td>
                    <td>{a.descripcion}</td>
                    <td><span className="badge badge-gris text-sm">{a.tipo}</span></td>
                    <td>{fmt(a.total_debe)}</td>
                    <td>{fmt(a.total_haber)}</td>
                    <td><span className={`badge ${a.estado==='CONTABILIZADO'?'badge-verde':a.estado==='ANULADO'?'badge-rojo':'badge-gris'}`}>{a.estado}</span></td>
                  </tr>
                ))}
                {!asientos.length && <tr><td colSpan="7" className="text-gris text-sm">Sin asientos registrados</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'cuentas' && (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Naturaleza</th><th>Nivel</th></tr></thead>
              <tbody>
                {cuentas.map(c => (
                  <tr key={c.id} style={{ fontWeight: c.nivel <= 2 ? 700 : 400, background: c.nivel === 1 ? 'rgba(204,0,0,0.06)' : '' }}>
                    <td style={{ paddingLeft: (c.nivel-1)*16+8 }}>{c.codigo}</td>
                    <td>{c.nombre}</td>
                    <td><span className="badge badge-gris text-sm">{c.tipo}</span></td>
                    <td><span className={`badge ${c.naturaleza==='DEUDORA'?'badge-azul':'badge-verde'} text-sm`}>{c.naturaleza}</span></td>
                    <td>{c.nivel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'mayor' && (
        <div>
          <div className="flex gap-2 mb-4" style={{ flexWrap:'wrap' }}>
            <select className="form-control" style={{ width:320 }} value={cuentaMayor} onChange={e => setCuentaMayor(e.target.value)}>
              <option value="">Selecciona una cuenta…</option>
              {cuentasMovimiento.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}
            </select>
            <input type="date" className="form-control" style={{ width:170 }} value={periodo.desde} onChange={e => setPeriodo({...periodo, desde: e.target.value})} />
            <input type="date" className="form-control" style={{ width:170 }} value={periodo.hasta} onChange={e => setPeriodo({...periodo, hasta: e.target.value})} />
          </div>
          {mayor?.cuenta && (
            <div className="card">
              <div className="card-header"><div className="card-title">{mayor.cuenta.codigo} · {mayor.cuenta.nombre} ({mayor.cuenta.naturaleza})</div></div>
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Fecha</th><th>Asiento</th><th>Descripción</th><th>Debe</th><th>Haber</th><th>Saldo</th></tr></thead>
                  <tbody>
                    {mayor.movimientos.map((m, i) => (
                      <tr key={i}>
                        <td>{dayjs(m.fecha).format('DD/MM/YYYY')}</td>
                        <td>{m.numero_asiento}</td>
                        <td>{m.descripcion || m.asiento_desc}</td>
                        <td>{fmt(m.debe)}</td>
                        <td>{fmt(m.haber)}</td>
                        <td className="fw-600">{fmt(m.saldo)}</td>
                      </tr>
                    ))}
                    {!mayor.movimientos.length && <tr><td colSpan="6" className="text-gris text-sm">Sin movimientos contabilizados en el período</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'balance' && (
        <div>
          <div className="flex gap-2 mb-4">
            <input type="date" className="form-control" style={{ width:170 }} value={periodo.hasta} onChange={e => setPeriodo({...periodo, hasta: e.target.value})} />
            <button className="btn btn-secondary" onClick={loadBalance}>Actualizar</button>
          </div>
          <div className="card">
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Código</th><th>Cuenta</th><th>Tipo</th><th>Total Debe</th><th>Total Haber</th><th>Saldo</th></tr></thead>
                <tbody>
                  {balComp.map(c => (
                    <tr key={c.codigo}>
                      <td>{c.codigo}</td>
                      <td>{c.nombre}</td>
                      <td>{c.tipo}</td>
                      <td>{fmt(c.total_debe)}</td>
                      <td>{fmt(c.total_haber)}</td>
                      <td className={Number(c.saldo) < 0 ? 'text-rojo fw-600' : 'fw-600'}>{fmt(c.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'resultados' && (
        <div>
          <div className="flex gap-2 mb-4">
            <input type="date" className="form-control" style={{ width:170 }} value={periodo.desde} onChange={e => setPeriodo({...periodo, desde: e.target.value})} />
            <input type="date" className="form-control" style={{ width:170 }} value={periodo.hasta} onChange={e => setPeriodo({...periodo, hasta: e.target.value})} />
          </div>
          {erData && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div className="card">
                <div className="card-header"><div className="card-title">Ingresos</div></div>
                <div className="card-body">
                  {erData.ingresos.map(r => <div key={r.codigo} className="totales-row"><span>{r.nombre}</span><span>{fmt(r.monto)}</span></div>)}
                  <div className="totales-row total-final"><span>Total ingresos</span><span>{fmt(erData.totalIngresos)}</span></div>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><div className="card-title">Costos y Gastos</div></div>
                <div className="card-body">
                  {erData.costos.map(r => <div key={r.codigo} className="totales-row"><span>{r.nombre}</span><span>{fmt(r.monto)}</span></div>)}
                  <div className="totales-row total-final"><span>Total costos/gastos</span><span>{fmt(erData.totalCostos)}</span></div>
                </div>
              </div>
              <div className="card" style={{ gridColumn:'1/-1' }}>
                <div className="card-body">
                  <div className="totales-row total-final" style={{ fontSize:18 }}>
                    <span>Utilidad del Ejercicio</span>
                    <span style={{ color: erData.utilidad >= 0 ? '#22c55e' : '#CC0000' }}>{fmt(erData.utilidad)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: nuevo asiento ── */}
      {nuevo && (
        <div className="modal-overlay"><div className="modal" style={{ maxWidth: 900, width:'95%' }}>
          <div className="modal-header">
            <div className="modal-title">Nuevo asiento contable</div>
            <button className="modal-close" onClick={() => setNuevo(null)}>×</button>
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-grid form-grid-2">
              <div className="form-group"><label className="form-label">Fecha</label>
                <input type="date" className="form-control" value={nuevo.fecha} onChange={e => setNuevo({ ...nuevo, fecha: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Tipo</label>
                <select className="form-control" value={nuevo.tipo} onChange={e => setNuevo({ ...nuevo, tipo: e.target.value })}>
                  {['MANUAL','AUTO_NOMINA','AJUSTE','APERTURA','CIERRE'].map(t => <option key={t} value={t}>{t}</option>)}
                </select></div>
            </div>
            <div className="form-group"><label className="form-label">Descripción</label>
              <input className="form-control" value={nuevo.descripcion} onChange={e => setNuevo({ ...nuevo, descripcion: e.target.value })} placeholder="Ej: Registro de nómina quincena 1 octubre" /></div>

            <div className="table-wrapper">
              <table>
                <thead><tr><th style={{ width:'38%' }}>Cuenta</th><th>Descripción</th><th style={{ width:120 }}>Debe</th><th style={{ width:120 }}>Haber</th><th></th></tr></thead>
                <tbody>
                  {nuevo.detalles.map((l, i) => (
                    <tr key={i}>
                      <td><select className="form-control" value={l.cuenta_id} onChange={e => setLinea(i, 'cuenta_id', e.target.value)}>
                        <option value="">—</option>
                        {cuentasMovimiento.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}
                      </select></td>
                      <td><input className="form-control" value={l.descripcion} onChange={e => setLinea(i, 'descripcion', e.target.value)} /></td>
                      <td><input type="number" min="0" step="0.01" className="form-control" value={l.debe}
                        onChange={e => { setLinea(i, 'debe', e.target.value); if (e.target.value) setLinea(i, 'haber', ''); }} /></td>
                      <td><input type="number" min="0" step="0.01" className="form-control" value={l.haber}
                        onChange={e => { setLinea(i, 'haber', e.target.value); if (e.target.value) setLinea(i, 'debe', ''); }} /></td>
                      <td>{nuevo.detalles.length > 2 && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setNuevo(n => ({ ...n, detalles: n.detalles.filter((_, j) => j !== i) }))}>×</button>
                      )}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan="2"><button className="btn btn-secondary btn-sm" onClick={() => setNuevo(n => ({ ...n, detalles: [...n.detalles, lineaVacia()] }))}>+ Agregar línea</button></td>
                    <td className="fw-600">{fmt(totalDebe)}</td>
                    <td className="fw-600">{fmt(totalHaber)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: cuadra ? '#22c55e' : '#CC0000' }}>
              {cuadra ? '✓ El asiento cuadra' : `Diferencia: ${fmt(Math.abs(totalDebe - totalHaber))}`}
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:8, marginTop:12, fontSize:13 }}>
              <input type="checkbox" checked={nuevo.contabilizar} onChange={e => setNuevo({ ...nuevo, contabilizar: e.target.checked })} />
              Contabilizar al guardar (si no, queda como borrador)
            </label>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setNuevo(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={!cuadra || guardando} onClick={guardarAsiento}>{guardando ? 'Guardando...' : 'Guardar asiento'}</button>
          </div>
        </div></div>
      )}

      {/* ── Modal: detalle de asiento ── */}
      {detalle && (
        <div className="modal-overlay"><div className="modal" style={{ maxWidth: 760, width:'95%' }}>
          <div className="modal-header">
            <div className="modal-title">Asiento {detalle.numero_asiento} · {dayjs(detalle.fecha).format('DD/MM/YYYY')}</div>
            <button className="modal-close" onClick={() => setDetalle(null)}>×</button>
          </div>
          <div className="modal-body">
            <p style={{ marginBottom: 12 }}>{detalle.descripcion}</p>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Cuenta</th><th>Descripción</th><th>Debe</th><th>Haber</th></tr></thead>
                <tbody>
                  {detalle.detalles.map(d => (
                    <tr key={d.id}>
                      <td>{d.codigo} · {d.cuenta_nombre}</td>
                      <td>{d.descripcion || '—'}</td>
                      <td>{fmt(d.debe)}</td>
                      <td>{fmt(d.haber)}</td>
                    </tr>
                  ))}
                  <tr className="fw-600"><td colSpan="2">Totales</td><td>{fmt(detalle.total_debe)}</td><td>{fmt(detalle.total_haber)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="modal-footer">
            <span className={`badge ${detalle.estado==='CONTABILIZADO'?'badge-verde':'badge-gris'}`} style={{ marginRight:'auto' }}>{detalle.estado}</span>
            {detalle.estado === 'BORRADOR' && <button className="btn btn-primary" onClick={() => contabilizar(detalle.id)}>Contabilizar</button>}
            <button className="btn btn-secondary" onClick={() => setDetalle(null)}>Cerrar</button>
          </div>
        </div></div>
      )}
    </div>
  );
}
