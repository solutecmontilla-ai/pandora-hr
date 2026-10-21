// ============================================================
// LOGIN PAGE
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Logo from '../components/Logo';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Error de conexión');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}><Logo size={60} stacked sub={null} /></div>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>Nómina y Recursos Humanos · Amays Group</p>
        </div>
        <div className="card">
          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Correo electrónico</label>
                <input className="form-control" type="email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="admin@empresa.com" />
              </div>
              <div className="form-group">
                <label className="form-label">Contraseña</label>
                <input className="form-control" type="password" required value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" />
              </div>
              <button className="btn btn-primary w-full" type="submit" disabled={loading} style={{ justifyContent: 'center', marginTop: 8 }}>
                {loading ? 'Ingresando...' : 'Ingresar'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
              <a href="/forgot-password" style={{ color: '#888' }}>¿Olvidaste tu contraseña?</a>
            </div>
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13 }}>
              ¿No tienes cuenta? <a href="/registro" style={{ color: '#CC0000' }}>Registrar empresa</a>
            </div>
          </div>
        </div>
        <p style={{ color: '#555', fontSize: 11, textAlign: 'center', marginTop: 16 }}>
          © Amays Group · PandoraHR
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
