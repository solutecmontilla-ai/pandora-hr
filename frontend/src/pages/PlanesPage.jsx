import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const WA_NUMBER = '584121337246';

const CHECK = () => <span style={{ color: '#22c55e', fontWeight: 700 }}>✓</span>;
const X_    = () => <span style={{ color: '#444' }}>—</span>;

function buildWAMessage({ nombre, email, telefono, rif, razon_social, plan, metodo }) {
  return encodeURIComponent(
    `Hola, deseo adquirir el plan *${plan}* de PandoraHR.\n\n` +
    `👤 Nombre: ${nombre}\n📧 Email: ${email}\n📱 Teléfono: ${telefono}\n` +
    `🏢 RIF: ${rif || 'N/A'}\n🏢 Empresa: ${razon_social || 'N/A'}\n` +
    `💳 Método de pago preferido: ${metodo || 'Por definir'}\n\n` +
    `Quedo en espera de instrucciones para formalizar el pago.`
  );
}

const inputStyle = {
  width: '100%', background: '#0d0d0d', border: '1px solid #2a2a2a',
  color: '#fff', borderRadius: 6, padding: '9px 12px', fontSize: 13, boxSizing: 'border-box'
};
const labelStyle = { fontSize: 12, color: '#888', display: 'block', marginBottom: 5 };

export default function PlanesPage() {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const [planes, setPlanes] = useState([]);
  const [metodos, setMetodos] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', rif: '', razon_social: '', metodo_pago_id: '' });
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    api.get('/auth/planes-publicos').then(r => setPlanes(r.data)).catch(() => {});
    api.get('/auth/metodos-pago-publicos').then(r => setMetodos(r.data)).catch(() => {});
  }, []);

  const handleSelectPlan = (p) => {
    setSelectedPlan(p);
    setEnviado(false);
    // Scroll al formulario inmediatamente
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handleSolicitar = async () => {
    if (!form.nombre || !form.email) return alert('Nombre y email son requeridos');
    try {
      await api.post('/auth/solicitud-plan', {
        nombre_contacto: form.nombre,
        email_contacto:  form.email,
        telefono:        form.telefono,
        rif_empresa:     form.rif,
        razon_social:    form.razon_social,
        plan_id:         selectedPlan.id,
        metodo_pago_id:  form.metodo_pago_id || null
      });
      setEnviado(true);
      const metodoNombre = metodos.find(m => m.id == form.metodo_pago_id)?.nombre || '';
      const waMsg = buildWAMessage({ ...form, plan: selectedPlan.nombre, metodo: metodoNombre });
      window.open(`https://wa.me/${WA_NUMBER}?text=${waMsg}`, '_blank');
    } catch (e) {
      alert(e.response?.data?.error || 'Error al enviar solicitud');
    }
  };

  const colorPlan = (slug) => {
    if (slug === 'empresa') return '#CC0000';
    if (slug === 'pro') return '#2563eb';
    if (slug === 'nomina-contabilidad') return '#7c3aed';
    return '#555';
  };

  const feature = (val, label) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, borderBottom: '1px solid #161616' }}>
      {val ? <CHECK /> : <X_ />}
      <span style={{ color: val ? '#fff' : '#444' }}>{label}</span>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '64px 20px 48px' }}>
        <div style={{ fontSize: 12, color: '#CC0000', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 }}>
          PandoraHR · Nómina y RRHH
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 800, marginBottom: 14, color: '#fff', lineHeight: 1.1 }}>
          Planes y precios
        </h1>
        <p style={{ color: '#999', fontSize: 15, maxWidth: 480, margin: '0 auto 24px' }}>
          Elige el plan que se adapta a tu negocio. Todos incluyen soporte técnico y actualizaciones.
        </p>
        <button onClick={() => navigate('/login')}
          style={{ background: 'none', border: '1px solid #333', color: '#aaa', padding: '9px 22px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          Ya tengo cuenta — Iniciar sesión
        </button>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap', padding: '0 20px 64px', maxWidth: 1120, margin: '0 auto' }}>
        {planes.map(p => {
          const activo = selectedPlan?.id === p.id;
          const color  = colorPlan(p.slug);
          return (
            <div key={p.id} style={{
              background: activo ? '#111' : '#0d0d0d',
              border: `1px solid ${activo ? color : '#1e1e1e'}`,
              borderRadius: 14, padding: '28px 24px', width: 240, position: 'relative',
              boxShadow: activo ? `0 0 24px ${color}25` : 'none',
              transition: 'all .25s', cursor: 'pointer'
            }}
              onClick={() => handleSelectPlan(p)}
            >
              {p.slug === 'empresa' && (
                <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: '#CC0000', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 14px', borderRadius: 20, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                  RECOMENDADO
                </div>
              )}
              <div style={{ color, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
                {p.nombre}
              </div>
              <div style={{ fontSize: 34, fontWeight: 800, color: '#fff', marginBottom: 4, lineHeight: 1 }}>
                ${Number(p.precio_usd).toFixed(2)}
                <span style={{ fontSize: 13, fontWeight: 400, color: '#555' }}>/mes</span>
              </div>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 20 }}>
                {p.max_usuarios} usuarios
              </div>

              <div style={{ marginBottom: 20 }}>
                {feature(true, 'Trabajadores y trayectoria laboral')}
                {feature(true, 'Nómina de salarios y cesta ticket')}
                {feature(true, 'Vacaciones y utilidades')}
                {feature(true, 'Constancias de trabajo y egreso')}
                {feature(true, 'Archivos FAOV, RNET (IVSS) y TIUNA')}
                {feature(true, 'Contabilidad: diario, mayor, balance y resultados')}
              </div>

              <div style={{ fontSize: 11, color: '#444', marginBottom: 18 }}>
                Soporte: <span style={{ color: '#666' }}>{p.nivel_soporte}{p.sla_horas ? ` · SLA ${p.sla_horas}h` : ''}</span>
              </div>

              <div style={{
                width: '100%', padding: '10px', borderRadius: 6, textAlign: 'center',
                background: activo ? color : '#1a1a1a',
                color: activo ? '#fff' : '#666',
                fontWeight: 700, fontSize: 13, transition: 'all .25s'
              }}>
                {activo ? '✓ Seleccionado — Ver formulario ↓' : 'Seleccionar →'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Formulario */}
      <div ref={formRef} style={{ maxWidth: 540, margin: '0 auto', padding: '0 20px 100px' }}>
        {!selectedPlan ? (
          <div style={{ textAlign: 'center', color: '#333', fontSize: 14, padding: '20px 0' }}>
            ↑ Selecciona un plan para continuar
          </div>
        ) : !enviado ? (
          <div style={{ background: '#111', border: `1px solid ${colorPlan(selectedPlan.slug)}44`, borderRadius: 14, padding: 32 }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Adquirir plan</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, color: '#fff' }}>
              {selectedPlan.nombre}
            </h2>
            <div style={{ fontSize: 13, color: colorPlan(selectedPlan.slug), fontWeight: 600, marginBottom: 28 }}>
              ${Number(selectedPlan.precio_usd).toFixed(2)} / mes
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Nombre completo *</label>
                <input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Teléfono / WhatsApp</label>
                <input value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})}
                  placeholder="+58 412..." style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Email *</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} style={inputStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
              <div>
                <label style={labelStyle}>RIF empresa</label>
                <input value={form.rif} onChange={e => setForm({...form, rif: e.target.value})}
                  placeholder="J-12345678-9" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Razón Social</label>
                <input value={form.razon_social} onChange={e => setForm({...form, razon_social: e.target.value})} style={inputStyle} />
              </div>
            </div>

            {metodos.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <label style={{ ...labelStyle, marginBottom: 10 }}>Método de pago preferido</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {metodos.map(m => {
                    const sel = form.metodo_pago_id == m.id;
                    return (
                      <button key={m.id} onClick={() => setForm({...form, metodo_pago_id: m.id})}
                        style={{
                          padding: '7px 16px', borderRadius: 20, border: `1px solid ${sel ? colorPlan(selectedPlan.slug) : '#2a2a2a'}`,
                          background: sel ? `${colorPlan(selectedPlan.slug)}18` : '#0d0d0d',
                          color: sel ? '#fff' : '#666',
                          fontSize: 12, fontWeight: sel ? 600 : 400, cursor: 'pointer', transition: 'all .15s'
                        }}>
                        {m.nombre}
                      </button>
                    );
                  })}
                </div>
                {form.metodo_pago_id && (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#666', background: '#0d0d0d', padding: '10px 14px', borderRadius: 8, border: '1px solid #1a1a1a' }}>
                    {metodos.find(m => m.id == form.metodo_pago_id)?.descripcion}
                  </div>
                )}
              </div>
            )}

            <button onClick={handleSolicitar}
              style={{ width: '100%', padding: '13px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Enviar solicitud por WhatsApp
            </button>
            <p style={{ fontSize: 11, color: '#444', textAlign: 'center', marginTop: 10 }}>
              Se registra tu solicitud y se abre WhatsApp con los datos prellenados.
            </p>
          </div>
        ) : (
          <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 14, padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#fff', marginBottom: 8 }}>Solicitud enviada</div>
            <p style={{ color: '#777', fontSize: 14, marginBottom: 24 }}>
              Se abrió WhatsApp con tu solicitud. Nuestro equipo te contactará a la brevedad para confirmar el pago y activar tu cuenta.
            </p>
            <button onClick={() => { setEnviado(false); setSelectedPlan(null); window.scrollTo({top:0,behavior:'smooth'}); }}
              style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#aaa', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
              ← Volver a planes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
