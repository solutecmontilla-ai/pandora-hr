// pages/AllPages.jsx — Empresa, Usuarios, Superadmin
import { useState, useEffect } from 'react';
import api from '../utils/api';
import { ImagenProtegida, abrirArchivo } from '../utils/archivos';
import dayjs from 'dayjs';
import { useAuth } from '../hooks/useAuth';

export function EmpresaPage() {
  const [empresa, setEmpresa] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [tieneMemb, setTieneMemb] = useState(false);

  const load = () => api.get('/empresas/me').then(r => {
    setEmpresa(r.data);
    setTieneMemb(!!r.data.membrete_path);
  });
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setGuardando(true);
    await api.put('/empresas/me', empresa);
    setGuardando(false);
    alert('Datos actualizados');
  };

  if (!empresa) return <p>Cargando...</p>;
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Mi Empresa</h2>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:20, alignItems:'start' }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Datos fiscales</div></div>
          <div className="card-body">
            <div className="alert alert-info mb-4">RIF: <strong>{empresa.rif}</strong> · Estos datos aparecen en recibos, constancias y reportes</div>
            <div className="form-group"><label className="form-label">Razón Social</label><input className="form-control" value={empresa.razon_social||''} onChange={e => setEmpresa({...empresa, razon_social: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Nombre Comercial</label><input className="form-control" value={empresa.nombre_comercial||''} onChange={e => setEmpresa({...empresa, nombre_comercial: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Dirección Fiscal</label><textarea className="form-control" rows="2" value={empresa.direccion_fiscal||''} onChange={e => setEmpresa({...empresa, direccion_fiscal: e.target.value})} /></div>
            <div className="form-grid form-grid-2">
              <div className="form-group"><label className="form-label">Municipio</label><input className="form-control" value={empresa.municipio||''} onChange={e => setEmpresa({...empresa, municipio: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Estado</label><input className="form-control" value={empresa.estado||''} onChange={e => setEmpresa({...empresa, estado: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Teléfono</label><input className="form-control" value={empresa.telefono||''} onChange={e => setEmpresa({...empresa, telefono: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Email</label><input className="form-control" value={empresa.email||''} onChange={e => setEmpresa({...empresa, email: e.target.value})} /></div>
            </div>
            <button className="btn btn-primary" onClick={handleSave} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</button>
          </div>
        </div>
        <div>
          <div className="card mb-4">
            <div className="card-header"><div className="card-title">Plan actual</div></div>
            <div className="card-body">
              <div style={{ fontSize:18, fontWeight:700, color:'#CC0000', marginBottom:8 }}>{empresa.plan_nombre}</div>
                            {empresa.fecha_vencimiento_plan && <div className="text-gris text-sm">Vence: {dayjs(empresa.fecha_vencimiento_plan).format('DD/MM/YYYY')}</div>}
              <button className="btn btn-secondary" style={{ marginTop:12, width:'100%' }} onClick={() => alert('Contacta a soporte para actualizar tu plan')}>Actualizar plan</button>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header"><div className="card-title">Logo de empresa</div></div>
            <div className="card-body">
              {empresa.logo_path && (
                <ImagenProtegida src="/empresas/logo" alt="Logo" style={{ width:'100%', maxHeight:80, objectFit:'contain', marginBottom:12, background:'#fff', padding:8, borderRadius:4 }} />
              )}
              <input type="file" accept="image/*" className="form-control" onChange={async e => {
                const file = e.target.files[0]; if (!file) return;
                const fd = new FormData(); fd.append('logo', file);
                try { await api.post('/empresas/logo', fd); load(); alert('Logo actualizado'); }
                catch { alert('Error al subir logo'); }
              }} />
              <p className="text-gris text-sm" style={{ marginTop:8 }}>PNG o JPG · máx 2MB · recomendado 300×100px · se imprime en todos los reportes</p>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Hoja membretada</div></div>
            <div className="card-body">
              {tieneMemb && (
                <div style={{ marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
                  <span className="badge badge-verde" style={{ fontSize:11 }}>✓ Membrete cargado</span>
                  <a href="#" onClick={e => { e.preventDefault(); abrirArchivo('/empresas/membrete'); }} style={{ fontSize:12, color:'#888' }}>Ver PDF</a>
                </div>
              )}
              <input type="file" accept="application/pdf" className="form-control" onChange={async e => {
                const file = e.target.files[0]; if (!file) return;
                const fd = new FormData(); fd.append('membrete', file);
                try { await api.post('/empresas/membrete', fd); setTieneMemb(true); alert('Hoja membretada actualizada'); }
                catch { alert('Error al subir membrete'); }
              }} />
              <p className="text-gris text-sm" style={{ marginTop:8 }}>PDF · tamaño carta · orientación vertical · se usa como fondo en documentos impresos</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SuperadminPage() {
  const [stats, setStats] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [planEdit, setPlanEdit] = useState(null);
  const [tab, setTab] = useState('empresas');
  // Métodos de pago
  const [metodos, setMetodos] = useState([]);
  const [metodoEdit, setMetodoEdit] = useState(null);
  const emptyMetodo = { nombre:'', descripcion:'', instrucciones:'', orden:0, activo:1 };
  // Solicitudes
  const [solicitudes, setSolicitudes] = useState([]);
  const [solEdit, setSolEdit] = useState(null);
  // Accesos multi-empresa
  const [accesos, setAccesos] = useState([]);
  const [todosUsuarios, setTodosUsuarios] = useState([]);
  const [formAcceso, setFormAcceso] = useState({ usuario_id:'', empresa_id:'' });

  const loadAll = () => {
    api.get('/superadmin/stats').then(r => setStats(r.data));
    api.get('/superadmin/empresas').then(r => setEmpresas(r.data));
    api.get('/superadmin/planes').then(r => setPlanes(r.data));
    api.get('/soporte').then(r => setTickets(r.data)).catch(() => {});
    api.get('/superadmin/metodos-pago').then(r => setMetodos(r.data)).catch(() => {});
    api.get('/superadmin/solicitudes').then(r => setSolicitudes(r.data)).catch(() => {});
    api.get('/superadmin/accesos').then(r => setAccesos(r.data)).catch(() => {});
    api.get('/superadmin/usuarios').then(r => setTodosUsuarios(r.data)).catch(() => {});
  };
  useEffect(() => { loadAll(); }, []);

  const handleSavePlan = async () => {
    await api.put(`/superadmin/planes/${planEdit.id}`, planEdit);
    setPlanes(prev => prev.map(p => p.id === planEdit.id ? planEdit : p));
    setPlanEdit(null);
  };
  const toggleActivo = async (e) => {
    await api.put(`/superadmin/empresas/${e.id}/suspender`, { activo: !e.activo });
    setEmpresas(prev => prev.map(x => x.id === e.id ? { ...x, activo: x.activo ? 0 : 1 } : x));
  };
  const handleSaveMetodo = async () => {
    if (metodoEdit.id) await api.put(`/superadmin/metodos-pago/${metodoEdit.id}`, metodoEdit);
    else await api.post('/superadmin/metodos-pago', metodoEdit);
    setMetodoEdit(null); api.get('/superadmin/metodos-pago').then(r => setMetodos(r.data));
  };
  const handleDeleteMetodo = async (id) => {
    if (!confirm('¿Eliminar método de pago?')) return;
    await api.delete(`/superadmin/metodos-pago/${id}`);
    api.get('/superadmin/metodos-pago').then(r => setMetodos(r.data));
  };
  const handleSaveSol = async () => {
    await api.put(`/superadmin/solicitudes/${solEdit.id}`, { estado: solEdit.estado, notas_admin: solEdit.notas_admin });
    setSolEdit(null); api.get('/superadmin/solicitudes').then(r => setSolicitudes(r.data));
  };
  const handleActivar = async () => {
    if (!solEdit.password) return alert('Ingresa una contraseña inicial para el cliente');
    if (!solEdit.rif_empresa) return alert('La solicitud no tiene RIF. Agrégalo en Notas o edita la solicitud.');
    try {
      const r = await api.post(`/superadmin/solicitudes/${solEdit.id}/activar`, {
        password: solEdit.password,
        fecha_vencimiento: solEdit.fecha_vencimiento,
        plan_id: solEdit.plan_id,
        direccion_fiscal: solEdit.direccion_fiscal,
        notas_admin: solEdit.notas_admin
      });
      setSolEdit(null);
      api.get('/superadmin/solicitudes').then(r2 => setSolicitudes(r2.data));
      api.get('/superadmin/empresas').then(r2 => setEmpresas(r2.data));
      // Abrir WhatsApp con credenciales
      const waMsg = encodeURIComponent(r.data.wa_mensaje);
      window.open(`https://wa.me/${solEdit.telefono?.replace(/\D/g,'')}?text=${waMsg}`, '_blank');
      alert(`Cuenta creada: ${r.data.email}`);
    } catch(e) { alert(e.response?.data?.error || 'Error al activar'); }
  };
  const handleAddAcceso = async () => {
    if (!formAcceso.usuario_id || !formAcceso.empresa_id) return alert('Selecciona usuario y empresa');
    try {
      await api.post('/superadmin/accesos', formAcceso);
      setFormAcceso({ usuario_id:'', empresa_id:'' });
      api.get('/superadmin/accesos').then(r => setAccesos(r.data));
    } catch(e) { alert(e.response?.data?.error || 'Error'); }
  };
  const handleRevokeAcceso = async (id) => {
    await api.delete(`/superadmin/accesos/${id}`);
    api.get('/superadmin/accesos').then(r => setAccesos(r.data));
  };

  const prioridadColor = { BAJA:'badge-verde', MEDIA:'badge-naranja', ALTA:'badge-rojo', CRITICA:'badge-rojo' };
  const solColor = { PENDIENTE:'badge-naranja', APROBADA:'badge-verde', RECHAZADA:'badge-rojo' };

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:700, marginBottom:20 }}>Panel SaaS · Superadmin</h2>
      {stats && (
        <div className="kpi-grid mb-4">
          <div className="kpi-card rojo"><div className="kpi-label">Empresas activas</div><div className="kpi-value">{stats.empresas?.activas}</div></div>
          <div className="kpi-card verde"><div className="kpi-label">Total trabajadores</div><div className="kpi-value">{stats.empleados?.total}</div></div>
          <div className="kpi-card azul"><div className="kpi-label">Trabajadores activos</div><div className="kpi-value">{Number(stats.empleados?.activos||0)}</div></div>
          <div className="kpi-card naranja"><div className="kpi-label">Solicitudes pendientes</div><div className="kpi-value">{solicitudes.filter(s=>s.estado==='PENDIENTE').length}</div></div>
        </div>
      )}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {[['empresas','Empresas'],['solicitudes','Solicitudes'],['accesos','Multi-empresa'],['metodos','Métodos de pago'],['planes','Planes SaaS'],['usuarios','Usuarios'],['tickets','Tickets']].map(([k,l]) => (
          <button key={k} className={`btn btn-sm ${tab===k?'btn-primary':'btn-secondary'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* EMPRESAS */}
      {tab === 'empresas' && (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead><tr><th>RIF</th><th>Empresa</th><th>Plan</th><th>Trabajadores</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {empresas.map(e => (
                  <tr key={e.id}>
                    <td className="fw-600">{e.rif}</td>
                    <td>{e.razon_social}</td>
                    <td><span className="badge badge-azul">{e.plan_nombre}</span></td>
                    <td>{e.total_empleados}</td>
                    <td>{e.fecha_vencimiento_plan ? dayjs(e.fecha_vencimiento_plan).format('DD/MM/YYYY') : '—'}</td>
                    <td><span className={`badge ${e.activo?'badge-verde':'badge-rojo'}`}>{e.activo?'Activa':'Suspendida'}</span></td>
                    <td><button className="btn btn-secondary btn-sm" onClick={() => toggleActivo(e)}>{e.activo?'Suspender':'Activar'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SOLICITUDES DE PLAN */}
      {tab === 'solicitudes' && (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Fecha</th><th>Contacto</th><th>Empresa</th><th>Plan</th><th>Método</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {solicitudes.map(s => (
                  <tr key={s.id}>
                    <td className="text-sm text-gris">{dayjs(s.created_at).format('DD/MM/YY HH:mm')}</td>
                    <td>
                      <div className="fw-600">{s.nombre_contacto}</div>
                      <div className="text-sm text-gris">{s.email_contacto} · {s.telefono||'—'}</div>
                    </td>
                    <td className="text-sm">{s.razon_social||'—'}<br/><span className="text-gris">{s.rif_empresa||'—'}</span></td>
                    <td><span className="badge badge-azul">{s.plan_nombre}</span><br/><span className="text-sm text-gris">${s.plan_precio}</span></td>
                    <td className="text-sm">{s.metodo_pago_nombre||'—'}</td>
                    <td><span className={`badge ${solColor[s.estado]||'badge-gris'}`}>{s.estado}</span></td>
                    <td><button className="btn btn-secondary btn-sm" onClick={() => setSolEdit({...s})}>Gestionar</button></td>
                  </tr>
                ))}
                {solicitudes.length===0 && <tr><td colSpan={7} className="text-gris text-sm" style={{textAlign:'center',padding:20}}>Sin solicitudes</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {solEdit && (
        <div className="modal-overlay"><div className="modal" style={{maxWidth:520}}>
          <div className="modal-header">
            <div className="modal-title">Gestionar solicitud</div>
            <button className="modal-close" onClick={() => setSolEdit(null)}>×</button>
          </div>
          <div className="modal-body">
            {/* Datos del cliente */}
            <div style={{background:'#0d0d0d',borderRadius:8,padding:'12px 14px',marginBottom:16,fontSize:13}}>
              <div className="fw-600">{solEdit.nombre_contacto}</div>
              <div className="text-gris text-sm">{solEdit.email_contacto} · {solEdit.telefono||'—'}</div>
              <div className="text-sm" style={{marginTop:4}}>
                <span className="badge badge-azul">{solEdit.plan_nombre}</span>
                <span className="text-gris" style={{marginLeft:8}}>${solEdit.plan_precio}/mes · {solEdit.metodo_pago_nombre||'Sin método'}</span>
              </div>
              {solEdit.rif_empresa && <div className="text-sm text-gris" style={{marginTop:4}}>RIF: {solEdit.rif_empresa} · {solEdit.razon_social}</div>}
            </div>

            <div className="form-group"><label className="form-label">Estado</label>
              <select className="form-control" value={solEdit.estado} onChange={e => setSolEdit({...solEdit, estado:e.target.value})}>
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="APROBADA">APROBADA — crear cuenta</option>
                <option value="RECHAZADA">RECHAZADA</option>
              </select>
            </div>

            <div className="form-group"><label className="form-label">Notas internas</label>
              <textarea className="form-control" rows={2} value={solEdit.notas_admin||''} onChange={e => setSolEdit({...solEdit, notas_admin:e.target.value})} />
            </div>

            {/* Campos adicionales al aprobar */}
            {solEdit.estado === 'APROBADA' && !solEdit.empresa_id && (
              <div style={{borderTop:'1px solid #222',paddingTop:16,marginTop:4}}>
                <div style={{fontSize:12,color:'#CC0000',fontWeight:700,marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>
                  Crear cuenta del cliente
                </div>
                <div className="form-grid form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Contraseña inicial *</label>
                    <input className="form-control" type="text" value={solEdit.password||''}
                      onChange={e => setSolEdit({...solEdit, password:e.target.value})}
                      placeholder="Mín. 8 caracteres" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Vencimiento del plan</label>
                    <input className="form-control" type="date" value={solEdit.fecha_vencimiento||''}
                      onChange={e => setSolEdit({...solEdit, fecha_vencimiento:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Plan a asignar</label>
                    <select className="form-control" value={solEdit.plan_id}
                      onChange={e => setSolEdit({...solEdit, plan_id:e.target.value})}>
                      {planes.map(p => <option key={p.id} value={p.id}>{p.nombre} (${p.precio_usd})</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Dirección fiscal</label>
                    <input className="form-control" value={solEdit.direccion_fiscal||''}
                      onChange={e => setSolEdit({...solEdit, direccion_fiscal:e.target.value})}
                      placeholder="Opcional, completar después" />
                  </div>
                </div>
                <div className="alert alert-info text-sm" style={{marginTop:4}}>
                  Al hacer clic en <strong>"Aprobar y crear cuenta"</strong> se crea la empresa, el usuario admin y se abre WhatsApp para notificar al cliente con sus credenciales.
                </div>
              </div>
            )}

            {solEdit.empresa_id && (
              <div className="alert alert-info text-sm">Cuenta ya creada — empresa ID {solEdit.empresa_id}</div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setSolEdit(null)}>Cancelar</button>
            {solEdit.estado === 'APROBADA' && !solEdit.empresa_id
              ? <button className="btn btn-primary" onClick={handleActivar}>Aprobar y crear cuenta →</button>
              : <button className="btn btn-primary" onClick={handleSaveSol}>Guardar</button>
            }
          </div>
        </div></div>
      )}

      {/* MULTI-EMPRESA / ACCESOS */}
      {tab === 'accesos' && (
        <div>
          <div className="card mb-4">
            <div className="card-header"><div className="card-title">Dar acceso a empresa adicional</div></div>
            <div className="card-body">
              <p className="text-sm text-gris" style={{marginBottom:12}}>
                Selecciona un usuario existente y una empresa. El usuario podrá cambiar entre empresas desde el selector en el topbar.
                El email no puede estar duplicado dentro de la misma empresa.
              </p>
              <div className="flex gap-2" style={{flexWrap:'wrap'}}>
                <select className="form-control" style={{maxWidth:280}} value={formAcceso.usuario_id}
                  onChange={e => setFormAcceso({...formAcceso, usuario_id: e.target.value})}>
                  <option value="">Seleccionar usuario...</option>
                  {todosUsuarios.map(u => (
                    <option key={u.id} value={u.id}>{u.nombre} ({u.email}) — {u.empresa_nombre}</option>
                  ))}
                </select>
                <select className="form-control" style={{maxWidth:280}} value={formAcceso.empresa_id}
                  onChange={e => setFormAcceso({...formAcceso, empresa_id: e.target.value})}>
                  <option value="">Seleccionar empresa destino...</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.razon_social} ({e.rif})</option>)}
                </select>
                <button className="btn btn-primary" onClick={handleAddAcceso}>Otorgar acceso</button>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Accesos multi-empresa activos</div></div>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Usuario</th><th>Email</th><th>Empresa adicional</th><th>RIF</th><th></th></tr></thead>
                <tbody>
                  {accesos.filter(a => a.activo).map(a => (
                    <tr key={a.id}>
                      <td className="fw-600">{a.usuario_nombre}</td>
                      <td className="text-gris text-sm">{a.usuario_email}</td>
                      <td>{a.empresa_nombre}</td>
                      <td className="text-gris text-sm">{a.empresa_rif}</td>
                      <td><button className="btn btn-secondary btn-sm" onClick={() => handleRevokeAcceso(a.id)}>Revocar</button></td>
                    </tr>
                  ))}
                  {accesos.filter(a=>a.activo).length===0 && (
                    <tr><td colSpan={5} className="text-gris text-sm" style={{textAlign:'center',padding:20}}>Sin accesos multi-empresa</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MÉTODOS DE PAGO */}
      {tab === 'metodos' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 style={{fontWeight:700}}>Métodos de pago</h3>
            <button className="btn btn-primary" onClick={() => setMetodoEdit({...emptyMetodo})}>+ Agregar método</button>
          </div>
          <div className="card">
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Orden</th><th>Nombre</th><th>Descripción</th><th>Instrucciones</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {metodos.map(m => (
                    <tr key={m.id}>
                      <td>{m.orden}</td>
                      <td className="fw-600">{m.nombre}</td>
                      <td className="text-sm text-gris">{m.descripcion||'—'}</td>
                      <td className="text-sm" style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.instrucciones||'—'}</td>
                      <td><span className={`badge ${m.activo?'badge-verde':'badge-gris'}`}>{m.activo?'Activo':'Inactivo'}</span></td>
                      <td style={{display:'flex',gap:4}}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setMetodoEdit({...m})}>Editar</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleDeleteMetodo(m.id)}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                  {metodos.length===0 && <tr><td colSpan={6} className="text-gris text-sm" style={{textAlign:'center',padding:20}}>Sin métodos configurados</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {metodoEdit && (
            <div className="modal-overlay"><div className="modal" style={{maxWidth:480}}>
              <div className="modal-header">
                <div className="modal-title">{metodoEdit.id ? 'Editar' : 'Nuevo'} método de pago</div>
                <button className="modal-close" onClick={() => setMetodoEdit(null)}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-grid form-grid-2">
                  <div className="form-group"><label className="form-label">Nombre *</label>
                    <input className="form-control" value={metodoEdit.nombre} onChange={e => setMetodoEdit({...metodoEdit,nombre:e.target.value})} placeholder="Ej: PayPal, Binance, Pago móvil" />
                  </div>
                  <div className="form-group"><label className="form-label">Orden</label>
                    <input className="form-control" type="number" value={metodoEdit.orden} onChange={e => setMetodoEdit({...metodoEdit,orden:e.target.value})} />
                  </div>
                </div>
                <div className="form-group"><label className="form-label">Descripción breve</label>
                  <input className="form-control" value={metodoEdit.descripcion||''} onChange={e => setMetodoEdit({...metodoEdit,descripcion:e.target.value})} />
                </div>
                <div className="form-group"><label className="form-label">Instrucciones de pago (visible para el cliente)</label>
                  <textarea className="form-control" rows={4} value={metodoEdit.instrucciones||''} onChange={e => setMetodoEdit({...metodoEdit,instrucciones:e.target.value})}
                    placeholder="Ej: Enviar pago por PayPal a pagos@amaysgroup.com — Adjuntar comprobante" />
                </div>
                <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
                  <input type="checkbox" checked={!!metodoEdit.activo} onChange={e => setMetodoEdit({...metodoEdit,activo:e.target.checked?1:0})} />
                  Método activo (visible para clientes)
                </label>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setMetodoEdit(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSaveMetodo}>Guardar</button>
              </div>
            </div></div>
          )}
        </div>
      )}

      {/* PLANES */}
      {tab === 'planes' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:16 }}>
            {planes.map(p => (
              <div key={p.id} className="card">
                <div className="card-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div className="card-title">{p.nombre}</div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setPlanEdit({...p})}>Editar</button>
                </div>
                <div className="card-body">
                  <div style={{ fontSize:24, fontWeight:700, color:'#CC0000', marginBottom:12 }}>${p.precio_usd}<span style={{ fontSize:13, color:'#888' }}>/mes</span></div>
                  <div className="text-gris text-sm" style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    <span>Usuarios: {p.max_usuarios}</span>
                    <span>Retenciones: {p.tiene_retenciones ? '✓' : '✗'} · Inventario: {p.tiene_inventario ? '✓' : '✗'}</span>
                    <span>Compras: {p.tiene_compras ? '✓' : '✗'} · Contabilidad: {p.tiene_contabilidad ? '✓' : '✗'}</span>
                    <span>Nómina: {p.tiene_nomina ? '✓' : '✗'}</span>
                    <span>Soporte: {p.nivel_soporte} · SLA {p.sla_horas}h</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {planEdit && (
            <div className="modal-overlay"><div className="modal" style={{ maxWidth:500 }}>
              <div className="modal-header"><div className="modal-title">Editar Plan: {planEdit.nombre}</div><button className="modal-close" onClick={() => setPlanEdit(null)}>×</button></div>
              <div className="modal-body">
                <div className="form-grid form-grid-2">
                  <div className="form-group"><label className="form-label">Nombre</label><input className="form-control" value={planEdit.nombre} onChange={e => setPlanEdit({...planEdit, nombre:e.target.value})} /></div>
                  <div className="form-group"><label className="form-label">Precio USD/mes</label><input className="form-control" type="number" step="0.01" value={planEdit.precio_usd} onChange={e => setPlanEdit({...planEdit, precio_usd:e.target.value})} /></div>
                  <div className="form-group"><label className="form-label">Max usuarios</label><input className="form-control" type="number" value={planEdit.max_usuarios} onChange={e => setPlanEdit({...planEdit, max_usuarios:e.target.value})} /></div>
                  <div className="form-group"><label className="form-label">Nivel soporte</label>
                    <select className="form-control" value={planEdit.nivel_soporte} onChange={e => setPlanEdit({...planEdit, nivel_soporte:e.target.value})}>
                      {['EMAIL','PRIORITARIO','DEDICADO'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">SLA (horas)</label><input className="form-control" type="number" value={planEdit.sla_horas||''} onChange={e => setPlanEdit({...planEdit, sla_horas:e.target.value})} /></div>
                </div>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:12 }}>
                  {[['tiene_retenciones','Retenciones'],['tiene_guias','Guías'],['tiene_inventario','Inventario'],['tiene_compras','Compras'],['tiene_contabilidad','Contabilidad'],['tiene_nomina','Nómina']].map(([k,l]) => (
                    <label key={k} style={{ display:'flex', alignItems:'center', gap:4, fontSize:13, cursor:'pointer' }}>
                      <input type="checkbox" checked={!!planEdit[k]} onChange={e => setPlanEdit({...planEdit, [k]:e.target.checked})} /> {l}
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setPlanEdit(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSavePlan}>Guardar cambios</button>
              </div>
            </div></div>
          )}
        </div>
      )}

      {/* USUARIOS */}
      {tab === 'usuarios' && <SuperadminUsuariosTab />}

      {/* TICKETS */}
      {tab === 'tickets' && (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Empresa</th><th>Asunto</th><th>Prioridad</th><th>Estado</th><th>Fecha</th></tr></thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id}>
                    <td>{t.empresa_id}</td>
                    <td>{t.asunto}</td>
                    <td><span className={`badge ${prioridadColor[t.prioridad]||'badge-gris'}`}>{t.prioridad}</span></td>
                    <td><span className={`badge ${t.estado==='ABIERTO'?'badge-naranja':t.estado==='RESUELTO'?'badge-verde':'badge-gris'}`}>{t.estado}</span></td>
                    <td>{dayjs(t.created_at).format('DD/MM/YY HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================
function SuperadminUsuariosTab() {
  const [usuarios, setUsuarios] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [modal, setModal] = useState(null);
  const [err, setErr] = useState('');
  const ROLES = [
    { value:'ADMIN_SR',       label:'Admin Sr' },
    { value:'GESTOR_SISTEMA', label:'Gestor de Sistema' },
    { value:'LECTOR',         label:'Lector' },
  ];
  const rolBadge = { ADMIN_SR:'badge-rojo', GESTOR_SISTEMA:'badge-azul', LECTOR:'badge-gris', SUPERADMIN:'badge-rojo' };
  const rolLabel = { ADMIN_SR:'Admin Sr', GESTOR_SISTEMA:'Gestor de Sistema', LECTOR:'Lector', SUPERADMIN:'Superadmin' };

  const load = () => {
    const q = filtroEmpresa ? `?empresa_id=${filtroEmpresa}` : '';
    api.get(`/superadmin/usuarios${q}`).then(r => setUsuarios(r.data));
  };
  useEffect(() => { api.get('/superadmin/empresas').then(r => setEmpresas(r.data)); }, []);
  useEffect(load, [filtroEmpresa]);

  const handleSave = async () => {
    setErr('');
    try {
      if (modal.id) await api.put(`/superadmin/usuarios/${modal.id}`, modal);
      else await api.post('/superadmin/usuarios', modal);
      setModal(null); load();
    } catch(e) { setErr(e.response?.data?.error || 'Error'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div style={{ fontWeight:700, fontSize:16 }}>Usuarios por empresa</div>
        <div style={{ display:'flex', gap:10 }}>
          <select className="form-control" style={{ width:220 }} value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
            <option value="">Todas las empresas</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razon_social}</option>)}
          </select>
          <button className="btn btn-primary" style={{ fontSize:13 }}
            onClick={() => setModal({ nombre:'', email:'', rol:'LECTOR', password:'', empresa_id: filtroEmpresa||'' })}>
            + Nuevo usuario
          </button>
        </div>
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Nombre</th><th>Email</th><th>Empresa</th><th>Rol</th><th>Lim.</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead>
            <tbody>
              {!usuarios.length && <tr><td colSpan={8} style={{ textAlign:'center', color:'#999', padding:24 }}>Sin usuarios</td></tr>}
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td className="fw-600">{u.nombre}</td>
                  <td className="text-gris text-sm">{u.email}</td>
                  <td className="text-sm">{u.empresa_nombre}</td>
                  <td><span className={`badge ${rolBadge[u.rol]||'badge-gris'}`} style={{ fontSize:10 }}>{rolLabel[u.rol]||u.rol}</span></td>
                  <td className="text-gris text-sm">{u.max_usuarios === -1 ? '∞' : u.max_usuarios}</td>
                  <td><span className={`badge ${u.activo?'badge-verde':'badge-rojo'}`} style={{ fontSize:10 }}>{u.activo?'Activo':'Inactivo'}</span></td>
                  <td className="text-gris text-sm">{u.ultimo_login ? dayjs(u.ultimo_login).format('DD/MM/YY HH:mm') : 'Nunca'}</td>
                  <td><button className="btn btn-secondary" style={{ fontSize:12, padding:'4px 10px' }}
                    onClick={() => setModal({ id:u.id, nombre:u.nombre, email:u.email, rol:u.rol, activo:u.activo, password:'', empresa_id:u.empresa_id })}>
                    Editar
                  </button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && (
        <div className="modal-overlay"><div className="modal" style={{ maxWidth:460 }}>
          <div className="modal-header">
            <div className="modal-title">{modal.id ? 'Editar usuario' : 'Nuevo usuario'}</div>
            <button className="modal-close" onClick={() => setModal(null)}>×</button>
          </div>
          <div className="modal-body">
            {err && <div className="alert alert-danger mb-3">{err}</div>}
            {!modal.id && (
              <div className="form-group"><label className="form-label">Empresa *</label>
                <select className="form-control" value={modal.empresa_id} onChange={e => setModal({...modal, empresa_id:e.target.value})}>
                  <option value="">Seleccionar empresa...</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.razon_social}</option>)}
                </select>
              </div>
            )}
            <div className="form-grid form-grid-2">
              <div className="form-group"><label className="form-label">Nombre *</label>
                <input className="form-control" value={modal.nombre} onChange={e => setModal({...modal, nombre:e.target.value})} />
              </div>
              <div className="form-group"><label className="form-label">Email *</label>
                <input className="form-control" type="email" value={modal.email} onChange={e => setModal({...modal, email:e.target.value})} />
              </div>
            </div>
            <div className="form-grid form-grid-2">
              <div className="form-group"><label className="form-label">Rol</label>
                <select className="form-control" value={modal.rol} onChange={e => setModal({...modal, rol:e.target.value})}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {modal.id && (
                <div className="form-group"><label className="form-label">Estado</label>
                  <select className="form-control" value={modal.activo?'1':'0'} onChange={e => setModal({...modal, activo:e.target.value==='1'})}>
                    <option value="1">Activo</option><option value="0">Inactivo</option>
                  </select>
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">{modal.id ? 'Nueva contraseña (vacío = no cambiar)' : 'Contraseña *'}</label>
              <input className="form-control" type="password" value={modal.password} onChange={e => setModal({...modal, password:e.target.value})} placeholder="••••••••" />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave}>Guardar</button>
          </div>
        </div></div>
      )}
    </div>
  );
}

// ============================================================
const MODULOS_ASIGNABLES = [
  { grupo: 'Recursos Humanos — Trabajadores', items: [
    { id: 'trab-consulta', label: 'Consulta de Trabajadores' },
    { id: 'trab-nuevo',    label: 'Nuevo Trabajador' },
  ]},
  { grupo: 'Recursos Humanos — Remuneraciones', items: [
    { id: 'nom-sal',  label: 'Nómina de Salarios' },
    { id: 'nom-cesta', label: 'Nómina de Cesta Ticket' },
    { id: 'nom-vac',  label: 'Vacaciones' },
    { id: 'nom-cfg',  label: 'Configuración de Remuneraciones' },
  ]},
];

export function UsuariosPage() {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [empresa, setEmpresa] = useState(null);
  const [modal, setModal] = useState(null);
  const [err, setErr] = useState('');
  const [modulosModal, setModulosModal] = useState(null); // { usuarioId, nombre, seleccionados: [] }
  const isAdmin = ['ADMIN_SR','SUPERADMIN'].includes(user?.rol);
  const ROLES = [
    { value:'ADMIN_SR',  label:'Administrador Senior' },
    { value:'ADMIN_EJ',  label:'Administrador Ejecutivo' },
    { value:'INVITADO',  label:'Invitado (solo lectura)' },
  ];
  const rolBadge = { ADMIN_SR:'badge-rojo', ADMIN_EJ:'badge-azul', INVITADO:'badge-gris', SUPERADMIN:'badge-rojo' };
  const rolLabel = { ADMIN_SR:'Admin Senior', ADMIN_EJ:'Admin Ejecutivo', INVITADO:'Invitado', SUPERADMIN:'Superadmin' };

  const load = () => {
    api.get('/empresas/me/usuarios').then(r => setUsuarios(r.data));
    api.get('/empresas/me').then(r => setEmpresa(r.data));
  };
  useEffect(load, []);

  const handleSave = async () => {
    setErr('');
    try {
      if (modal.id) await api.put(`/empresas/me/usuarios/${modal.id}`, modal);
      else await api.post('/empresas/me/usuarios', modal);
      setModal(null); load();
    } catch(e) { setErr(e.response?.data?.error || 'Error al guardar'); }
  };

  const handleOpenModulos = async (u) => {
    const r = await api.get(`/empresas/me/usuarios/${u.id}/modulos`);
    setModulosModal({ usuarioId: u.id, nombre: u.nombre, seleccionados: r.data });
  };

  const handleGuardarModulos = async () => {
    await api.put(`/empresas/me/usuarios/${modulosModal.usuarioId}/modulos`, { modulos: modulosModal.seleccionados });
    setModulosModal(null);
  };

  const toggleModulo = (id) => {
    setModulosModal(prev => {
      const sel = prev.seleccionados.includes(id)
        ? prev.seleccionados.filter(x => x !== id)
        : [...prev.seleccionados, id];
      return { ...prev, seleccionados: sel };
    });
  };

  const planMax = empresa ? (empresa.max_usuarios === -1 ? '∞' : empresa.max_usuarios) : '—';
  const activos = usuarios.filter(u => u.activo).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Usuarios</h2>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setModal({ nombre:'', email:'', rol:'INVITADO', password:'' })}>
            + Nuevo usuario
          </button>
        )}
      </div>

      <div className="kpi-grid mb-4" style={{ gridTemplateColumns:'repeat(2,1fr)' }}>
        <div className="kpi-card azul"><div className="kpi-label">Usuarios activos</div><div className="kpi-value">{activos}</div></div>
        <div className="kpi-card rojo"><div className="kpi-label">Límite del plan</div><div className="kpi-value">{planMax}</div></div>
      </div>

      {empresa && empresa.max_usuarios !== -1 && activos >= empresa.max_usuarios && (
        <div className="alert alert-warning mb-4" style={{ fontSize:13 }}>
          Has alcanzado el límite de usuarios de tu plan ({empresa.max_usuarios}). Contacta a soporte para ampliar.
        </div>
      )}

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead><tr>
              <th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Último acceso</th>
              {isAdmin && <th></th>}
            </tr></thead>
            <tbody>
              {!usuarios.length && <tr><td colSpan={6} style={{ textAlign:'center', color:'#999', padding:24 }}>Sin usuarios</td></tr>}
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td className="fw-600">{u.nombre}{u.id === user?.id && <span className="badge badge-gris" style={{ fontSize:9, marginLeft:6 }}>tú</span>}</td>
                  <td className="text-gris text-sm">{u.email}</td>
                  <td><span className={`badge ${rolBadge[u.rol]||'badge-gris'}`} style={{ fontSize:10 }}>{rolLabel[u.rol]||u.rol}</span></td>
                  <td><span className={`badge ${u.activo?'badge-verde':'badge-rojo'}`} style={{ fontSize:10 }}>{u.activo?'Activo':'Inactivo'}</span></td>
                  <td className="text-gris text-sm">{u.ultimo_login ? dayjs(u.ultimo_login).format('DD/MM/YY HH:mm') : 'Nunca'}</td>
                  {isAdmin && (
                    <td style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-secondary" style={{ fontSize:12, padding:'4px 10px' }}
                        onClick={() => setModal({ id:u.id, nombre:u.nombre, email:u.email, rol:u.rol, activo:u.activo, password:'' })}>
                        Editar
                      </button>
                      {['ADMIN_EJ','INVITADO'].includes(u.rol) && (
                        <button className="btn btn-secondary" style={{ fontSize:12, padding:'4px 10px' }}
                          onClick={() => handleOpenModulos(u)}>
                          Módulos
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay"><div className="modal" style={{ maxWidth:440 }}>
          <div className="modal-header">
            <div className="modal-title">{modal.id ? 'Editar usuario' : 'Nuevo usuario'}</div>
            <button className="modal-close" onClick={() => setModal(null)}>×</button>
          </div>
          <div className="modal-body">
            {err && <div className="alert alert-danger mb-3">{err}</div>}
            <div className="form-grid form-grid-2">
              <div className="form-group"><label className="form-label">Nombre *</label>
                <input className="form-control" value={modal.nombre} onChange={e => setModal({...modal, nombre:e.target.value})} />
              </div>
              <div className="form-group"><label className="form-label">Email *</label>
                <input className="form-control" type="email" value={modal.email} onChange={e => setModal({...modal, email:e.target.value})} />
              </div>
            </div>
            <div className="form-grid form-grid-2">
              <div className="form-group"><label className="form-label">Rol</label>
                <select className="form-control" value={modal.rol} onChange={e => setModal({...modal, rol:e.target.value})}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {modal.id && (
                <div className="form-group"><label className="form-label">Estado</label>
                  <select className="form-control" value={modal.activo?'1':'0'} onChange={e => setModal({...modal, activo:e.target.value==='1'})}>
                    <option value="1">Activo</option><option value="0">Inactivo</option>
                  </select>
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">{modal.id ? 'Nueva contraseña (vacío = no cambiar)' : 'Contraseña *'}</label>
              <input className="form-control" type="password" value={modal.password} onChange={e => setModal({...modal, password:e.target.value})} placeholder="••••••••" />
            </div>
            {['ADMIN_EJ','INVITADO'].includes(modal.rol) && (
              <div className="alert" style={{ background:'#1a1a1a', border:'1px solid #333', fontSize:12, color:'#999', marginTop:8 }}>
                Los módulos accesibles se configuran con el botón "Módulos" en la tabla de usuarios.
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave}>Guardar</button>
          </div>
        </div></div>
      )}

      {modulosModal && (
        <div className="modal-overlay"><div className="modal" style={{ maxWidth:480 }}>
          <div className="modal-header">
            <div className="modal-title">Módulos asignados — {modulosModal.nombre}</div>
            <button className="modal-close" onClick={() => setModulosModal(null)}>×</button>
          </div>
          <div className="modal-body">
            <p style={{ fontSize:13, color:'#999', marginBottom:16 }}>
              Selecciona los procesos a los que este usuario tendrá acceso en el menú.
            </p>
            {MODULOS_ASIGNABLES.map(grupo => (
              <div key={grupo.grupo} style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#777', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>
                  {grupo.grupo}
                </div>
                {grupo.items.map(item => (
                  <label key={item.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', cursor:'pointer', fontSize:13 }}>
                    <input
                      type="checkbox"
                      checked={modulosModal.seleccionados.includes(item.id)}
                      onChange={() => toggleModulo(item.id)}
                      style={{ width:15, height:15, accentColor:'#CC0000' }}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setModulosModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleGuardarModulos}>Guardar módulos</button>
          </div>
        </div></div>
      )}
    </div>
  );
}


// ─── En Desarrollo ────────────────────────────────────────────────────────────
export function EnDesarrolloPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 24, opacity: 0.12 }}>⚙</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#ccc', marginBottom: 12 }}>
          Módulo en desarrollo
        </div>
        <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>
          Este módulo está siendo desarrollado y estará disponible próximamente.
        </div>
        <div style={{ marginTop: 32, display: 'inline-block', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 20px', fontSize: 12, color: '#444' }}>
          Pandora · Amays Group
        </div>
      </div>
    </div>
  );
}