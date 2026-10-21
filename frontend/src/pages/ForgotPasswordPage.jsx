import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import Logo from '../components/Logo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al enviar el correo');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}><Logo size={60} stacked sub={null} /></div>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>Recuperar contraseña</p>
        </div>
        <div className="card">
          <div className="card-body">
            {sent ? (
              <div>
                <div style={{ background: '#1a3a1a', border: '1px solid #2d6a2d', borderRadius: 6, padding: '12px 16px', color: '#5cb85c', marginBottom: 16, fontSize: 14 }}>
                  Si el correo existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña en los próximos minutos.
                </div>
                <Link to="/login" className="btn btn-secondary w-full" style={{ justifyContent: 'center' }}>Volver al inicio de sesión</Link>
              </div>
            ) : (
              <>
                {error && <div className="alert alert-error">{error}</div>}
                <p style={{ color: '#999', fontSize: 13, marginBottom: 16 }}>Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.</p>
                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label className="form-label">Correo electrónico</label>
                    <input className="form-control" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@empresa.com" autoFocus />
                  </div>
                  <button className="btn btn-primary w-full" type="submit" disabled={loading} style={{ justifyContent: 'center', marginTop: 8 }}>
                    {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                  </button>
                </form>
                <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
                  <Link to="/login" style={{ color: '#CC0000' }}>Volver al inicio de sesión</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
