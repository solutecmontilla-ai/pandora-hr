import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!token) return (
    <div style={{ minHeight: '100vh', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ maxWidth: 380, width: '100%' }}>
        <div className="card-body">
          <div className="alert alert-error">Enlace inválido. Solicita uno nuevo desde el login.</div>
        </div>
      </div>
    </div>
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('Las contraseñas no coinciden'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/auth/reset-password', { token, password: form.password });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al restablecer la contraseña');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: '#CC0000', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 24, fontWeight: 700, color: '#fff' }}>P</div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>Pandora</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>Nueva contraseña</p>
        </div>
        <div className="card">
          <div className="card-body">
            {success ? (
              <div style={{ background: '#1a3a1a', border: '1px solid #2d6a2d', borderRadius: 6, padding: '12px 16px', color: '#5cb85c', fontSize: 14 }}>
                ¡Contraseña actualizada! Redirigiendo al login...
              </div>
            ) : (
              <>
                {error && <div className="alert alert-error">{error}</div>}
                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label className="form-label">Nueva contraseña</label>
                    <input className="form-control" type="password" required minLength={6} value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="Mínimo 6 caracteres" autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Confirmar contraseña</label>
                    <input className="form-control" type="password" required value={form.confirm} onChange={e => setForm({...form, confirm: e.target.value})} placeholder="Repetir contraseña" />
                  </div>
                  <button className="btn btn-primary w-full" type="submit" disabled={loading} style={{ justifyContent: 'center', marginTop: 8 }}>
                    {loading ? 'Actualizando...' : 'Establecer nueva contraseña'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
