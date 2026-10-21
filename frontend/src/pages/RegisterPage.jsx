import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [empresa, setEmpresa] = useState({
    rif: '', tipo_rif: 'J', razon_social: '', nombre_comercial: '',
    tipo_contribuyente: 'ORDINARIO', direccion_fiscal: '',
    municipio: '', estado: '', telefono: '', email: ''
  });
  const [usuario, setUsuario] = useState({ nombre: '', email: '', password: '', password2: '' });

  const estados = ['Amazonas','Anzoátegui','Apure','Aragua','Barinas','Bolívar','Carabobo','Cojedes',
    'Delta Amacuro','Distrito Capital','Falcón','Guárico','Lara','Mérida','Miranda','Monagas',
    'Nueva Esparta','Portuguesa','Sucre','Táchira','Trujillo','Vargas','Yaracuy','Zulia'];

  const handleSubmit = async () => {
    if (usuario.password !== usuario.password2) return setError('Las contraseñas no coinciden');
    if (usuario.password.length < 8) return setError('Contraseña mínimo 8 caracteres');
    setLoading(true); setError('');
    try {
      const rifCompleto = `${empresa.tipo_rif}-${empresa.rif}`;
      await api.post('/auth/register', {
        empresa: { ...empresa, rif: rifCompleto },
        usuario: { nombre: usuario.nombre, email: usuario.email, password: usuario.password }
      });
      await login(usuario.email, usuario.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, background: '#CC0000', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: 22, fontWeight: 700, color: '#fff' }}>F</div>
          <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Registrar empresa en PandoraHR</h1>
          <p style={{ color: '#888', fontSize: 12, marginTop: 4 }}>14 días gratis · Sin tarjeta de crédito</p>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center' }}>
          {[1,2].map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: step >= s ? '#CC0000' : '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>{s}</div>
              <span style={{ color: step >= s ? '#fff' : '#666', fontSize: 12 }}>{s === 1 ? 'Empresa' : 'Usuario admin'}</span>
              {s < 2 && <div style={{ width: 30, height: 1, background: '#444' }} />}
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}

            {step === 1 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Tipo</label>
                    <select className="form-control" value={empresa.tipo_rif} onChange={e => setEmpresa({...empresa, tipo_rif: e.target.value})}>
                      {['J','V','E','G','P'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">RIF *</label>
                    <input className="form-control" placeholder="12345678-9" value={empresa.rif} onChange={e => setEmpresa({...empresa, rif: e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Razón Social *</label>
                  <input className="form-control" placeholder="Nombre legal completo" value={empresa.razon_social} onChange={e => setEmpresa({...empresa, razon_social: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre Comercial</label>
                  <input className="form-control" placeholder="Nombre que aparece en recibos y constancias (opcional)" value={empresa.nombre_comercial} onChange={e => setEmpresa({...empresa, nombre_comercial: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de Contribuyente</label>
                  <select className="form-control" value={empresa.tipo_contribuyente} onChange={e => setEmpresa({...empresa, tipo_contribuyente: e.target.value})}>
                    {['ORDINARIO','ESPECIAL','FORMAL'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección Fiscal *</label>
                  <input className="form-control" placeholder="Av. Principal, Edificio, Piso, Oficina" value={empresa.direccion_fiscal} onChange={e => setEmpresa({...empresa, direccion_fiscal: e.target.value})} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Municipio</label>
                    <input className="form-control" value={empresa.municipio} onChange={e => setEmpresa({...empresa, municipio: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Estado</label>
                    <select className="form-control" value={empresa.estado} onChange={e => setEmpresa({...empresa, estado: e.target.value})}>
                      <option value="">Seleccionar...</option>
                      {estados.map(e => <option key={e}>{e}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-control" placeholder="0212-1234567" value={empresa.telefono} onChange={e => setEmpresa({...empresa, telefono: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email empresa</label>
                    <input className="form-control" type="email" value={empresa.email} onChange={e => setEmpresa({...empresa, email: e.target.value})} />
                  </div>
                </div>
                <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }}
                  disabled={!empresa.rif || !empresa.razon_social || !empresa.direccion_fiscal}
                  onClick={() => setStep(2)}>
                  Continuar →
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="alert alert-info">Este usuario será el administrador principal de tu empresa.</div>
                <div className="form-group">
                  <label className="form-label">Nombre completo *</label>
                  <input className="form-control" value={usuario.nombre} onChange={e => setUsuario({...usuario, nombre: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input className="form-control" type="email" value={usuario.email} onChange={e => setUsuario({...usuario, email: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Contraseña *</label>
                  <input className="form-control" type="password" placeholder="Mínimo 8 caracteres" value={usuario.password} onChange={e => setUsuario({...usuario, password: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirmar contraseña *</label>
                  <input className="form-control" type="password" value={usuario.password2} onChange={e => setUsuario({...usuario, password2: e.target.value})} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary" onClick={() => setStep(1)}>← Atrás</button>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                    disabled={loading || !usuario.nombre || !usuario.email || !usuario.password}
                    onClick={handleSubmit}>
                    {loading ? 'Registrando...' : '✅ Crear cuenta gratis'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <p style={{ color: '#555', fontSize: 12, textAlign: 'center', marginTop: 14 }}>
          ¿Ya tienes cuenta? <a href="/login" style={{ color: '#CC0000' }}>Iniciar sesión</a>
        </p>
      </div>
    </div>
  );
}
