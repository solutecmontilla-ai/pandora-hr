import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fv_user')); } catch { return null; }
  });
  const [token, setToken] = useState(localStorage.getItem('fv_token'));
  const [otrasEmpresas, setOtrasEmpresas] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fv_otras_empresas')) || []; } catch { return []; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      const payload = parseJWT(token);
      if (!payload || payload.exp * 1000 <= Date.now()) logout();
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    _saveSession(data.token, data.user, data.otras_empresas || []);
    return data;
  };

  const switchEmpresa = async (empresa_id) => {
    const { data } = await api.post('/auth/switch-empresa', { empresa_id });
    _saveSession(data.token, data.user, otrasEmpresas);
  };

  const _saveSession = (tok, usr, otras) => {
    localStorage.setItem('fv_token', tok);
    localStorage.setItem('fv_user', JSON.stringify(usr));
    localStorage.setItem('fv_otras_empresas', JSON.stringify(otras));
    setToken(tok);
    setUser(usr);
    setOtrasEmpresas(otras);
  };

  const logout = () => {
    localStorage.removeItem('fv_token');
    localStorage.removeItem('fv_user');
    localStorage.removeItem('fv_otras_empresas');
    setToken(null); setUser(null); setOtrasEmpresas([]);
    window.location.href = '/login';
  };

  // Todas las empresas accesibles (principal + otras)
  const todasEmpresas = user
    ? [{ id: user.empresa_id, razon_social: user.empresa, rif: user.rif }, ...otrasEmpresas.filter(e => e.id !== user.empresa_id)]
    : [];

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, switchEmpresa, todasEmpresas }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }

function parseJWT(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch { return null; }
}
