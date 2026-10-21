import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import { EmpresaPage, SuperadminPage, UsuariosPage, EnDesarrolloPage } from './pages/AllPages';
import { NominaPage, TrayectoriaLaboralPage, ConstanciasPage, ConstanciaEgresoPage } from './pages/NominaPages';
import { ContabilidadPage } from './pages/ContabilidadPage';
import PlanesPage from './pages/PlanesPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

function PrivateRoute({ children, roles = [] }) {
  const { user, token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (roles.length && !roles.includes(user?.rol)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/planes" element={<PlanesPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="nomina" element={<NominaPage />} />
            <Route path="nomina/salarios" element={<NominaPage initialTab="nominas" />} />
            <Route path="nomina/cesta-ticket" element={<NominaPage initialTab="cesta" />} />
            <Route path="nomina/vacaciones" element={<NominaPage initialTab="vacaciones" />} />
            <Route path="nomina/utilidades" element={<NominaPage initialTab="utilidades" />} />
            <Route path="nomina/prestaciones-sociales" element={<NominaPage initialTab="ppss" />} />
            <Route path="nomina/egresos" element={<NominaPage initialTab="liquidaciones" />} />
            <Route path="nomina/especial" element={<NominaPage initialTab="nomina_especial" />} />
            <Route path="nomina/recursos" element={<NominaPage initialTab="recursos" />} />
            <Route path="nomina/configuracion" element={<NominaPage initialTab="config" />} />
            <Route path="trabajadores" element={<NominaPage initialTab="empleados" />} />
            <Route path="trabajadores/nuevo" element={<NominaPage initialTab="empleados" />} />
            <Route path="trabajadores/trayectoria" element={<TrayectoriaLaboralPage />} />
            <Route path="trabajadores/constancias" element={<ConstanciasPage />} />
            <Route path="trabajadores/constancias-egreso" element={<ConstanciaEgresoPage />} />
            <Route path="contabilidad" element={<ContabilidadPage initialTab="asientos" />} />
            <Route path="contabilidad/cuentas" element={<ContabilidadPage initialTab="cuentas" />} />
            <Route path="contabilidad/mayor" element={<ContabilidadPage initialTab="mayor" />} />
            <Route path="contabilidad/balance" element={<ContabilidadPage initialTab="balance" />} />
            <Route path="contabilidad/resultados" element={<ContabilidadPage initialTab="resultados" />} />
            <Route path="en-desarrollo" element={<EnDesarrolloPage />} />
            <Route path="usuarios" element={<PrivateRoute roles={['ADMIN','SUPERADMIN']}><UsuariosPage /></PrivateRoute>} />
            <Route path="empresa" element={<EmpresaPage />} />
            <Route path="superadmin" element={<PrivateRoute roles={['SUPERADMIN']}><SuperadminPage /></PrivateRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
