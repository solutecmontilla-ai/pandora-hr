import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useState, useEffect, createContext, useContext } from 'react';
import api from '../utils/api';
import Logo from './Logo';

export const MonedaContext = createContext({ moneda: 'USD', tasa: null });
export const useMoneda = () => useContext(MonedaContext);

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const Chevron = ({ open }) => (
  <svg
    width={10} height={10} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: 'transform 0.15s ease', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}
  >
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const DevBadge = () => (
  <span style={{
    fontSize: 8, color: '#4a4a4a', background: '#161616',
    padding: '1px 4px', borderRadius: 3, border: '1px solid #2a2a2a',
    fontWeight: 400, letterSpacing: 0, textTransform: 'none',
    flexShrink: 0, whiteSpace: 'nowrap', marginLeft: 5,
  }}>
    dev
  </span>
);

// ── Árbol de navegación ───────────────────────────────────────────────────────
const NAV_TREE = [
  {
    type: 'module', id: 'rrhh', label: 'Recursos Humanos', permiso: 'nomina',
    children: [
      {
        type: 'group', id: 'seleccion', label: 'Selección de Personal', enDesarrollo: true,
        children: [
          { type: 'link', id: 'sel-cal',   to: '/en-desarrollo', label: 'Calendario de Entrevistas', enDesarrollo: true },
          { type: 'link', id: 'sel-eval',  to: '/en-desarrollo', label: 'Evaluación de Candidatos',  enDesarrollo: true },
          { type: 'link', id: 'sel-docs',  to: '/en-desarrollo', label: 'Documentación pre-empleo',  enDesarrollo: true },
        ],
      },
      {
        type: 'group', id: 'trabajadores', label: 'Trabajadores',
        children: [
          {
            type: 'group', id: 'trab-gestion', label: 'Trabajadores',
            children: [
              { type: 'link', id: 'trab-consulta', to: '/trabajadores',       label: 'Consulta de Trabajadores' },
              { type: 'link', id: 'trab-nuevo',    to: '/trabajadores/nuevo', label: 'Nuevo Trabajador' },
            ],
          },
          {
            type: 'group', id: 'trayectoria', label: 'Trayectoria laboral',
            children: [
              { type: 'link', id: 'tray-hist',   to: '/trabajadores/trayectoria', label: 'Trayectoria' },
              { type: 'link', id: 'tray-desemp', to: '/en-desarrollo', label: 'Desempeño', enDesarrollo: true },
            ],
          },
          {
            type: 'group', id: 'constancias', label: 'Constancias',
            children: [
              { type: 'link', id: 'const-trab',   to: '/trabajadores/constancias', label: 'Constancia de Trabajo' },
              { type: 'link', id: 'const-egreso', to: '/trabajadores/constancias-egreso', label: 'Constancia de Egreso' },
            ],
          },
        ],
      },
      {
        type: 'group', id: 'remuneraciones', label: 'Remuneraciones',
        children: [
          { type: 'link', id: 'nom-sal',      to: '/nomina/salarios',      label: 'Nómina de Salarios' },
          { type: 'link', id: 'nom-cesta',    to: '/nomina/cesta-ticket',  label: 'Nómina de Cesta Ticket' },
          { type: 'link', id: 'nom-vac',      to: '/nomina/vacaciones',    label: 'Vacaciones' },
          { type: 'link', id: 'nom-util',     to: '/nomina/utilidades',             label: 'Utilidades / Bonificación' },
          { type: 'link', id: 'nom-ppss',     to: '/nomina/prestaciones-sociales',  label: 'Prestaciones Sociales',      enDesarrollo: true },
          { type: 'link', id: 'nom-egresos',  to: '/nomina/egresos',                label: 'Egresos',                    enDesarrollo: true },
          { type: 'link', id: 'nom-especial', to: '/nomina/especial',               label: 'Nóminas especiales',         enDesarrollo: true },
          { type: 'link', id: 'nom-recursos', to: '/nomina/recursos',               label: 'Recursos',                   enDesarrollo: true },
          { type: 'link', id: 'nom-cfg',      to: '/nomina/configuracion', label: 'Configuración de Remuneraciones' },
        ],
      },
    ],
  },
  {
    type: 'module', id: 'configuracion', label: 'Configuración',
    children: [
      { type: 'link', id: 'empresa',  to: '/empresa',  label: 'Mi Empresa' },
      { type: 'link', id: 'usuarios', to: '/usuarios', label: 'Usuarios', permiso: '_admin' },
    ],
  },
];

function canSee(node, permisos, userRol, modulosAsignados) {
  if (node.permiso === '_admin') return ['ADMIN_SR', 'SUPERADMIN'].includes(userRol);
  if (modulosAsignados && ['ADMIN_EJ', 'INVITADO'].includes(userRol)) {
    if (node.type === 'link' && !node.enDesarrollo) {
      return modulosAsignados.includes(node.id);
    }
  }
  if (!node.permiso) return true;
  return !!permisos[node.permiso];
}

function NavNode({ node, depth = 0, openItems, toggle, permisos, userRol, modulosAsignados }) {
  if (!canSee(node, permisos, userRol, modulosAsignados)) return null;

  if (node.type === 'link') {
    const pl = 20 + depth * 12;
    const fs = depth >= 2 ? 11 : 12;
    if (node.enDesarrollo) {
      return (
        <Link
          to={node.to}
          className="sidebar-link"
          style={{ paddingLeft: pl, fontSize: fs, color: '#4a4a4a' }}
        >
          <span style={{ flex: 1 }}>{node.label}</span>
          <DevBadge />
        </Link>
      );
    }
    return (
      <NavLink
        to={node.to}
        end={node.exact}
        className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
        style={{ paddingLeft: pl, fontSize: fs }}
      >
        {node.label}
      </NavLink>
    );
  }

  // module o group
  const visibleChildren = (node.children || []).filter(c => canSee(c, permisos, userRol, modulosAsignados));
  if (visibleChildren.length === 0) return null;

  const isOpen = openItems.has(node.id);
  const isModule = node.type === 'module';
  const pl = 14 + depth * 12;

  return (
    <div>
      <button
        onClick={() => toggle(node.id)}
        style={{
          display: 'flex', width: '100%', alignItems: 'center',
          justifyContent: 'space-between', gap: 6,
          padding: `${isModule ? 9 : 7}px 14px ${isModule ? 9 : 7}px ${pl}px`,
          background: 'none', border: 'none', cursor: 'pointer',
          color: isModule ? '#777' : '#565656',
          fontSize: isModule ? 11 : 12,
          fontWeight: isModule ? 600 : 500,
          textTransform: isModule ? 'uppercase' : 'none',
          letterSpacing: isModule ? '0.06em' : 0,
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.label}
          </span>
          {node.enDesarrollo && <DevBadge />}
        </span>
        <Chevron open={isOpen} />
      </button>
      {isOpen && (
        <div>
          {visibleChildren.map(child => (
            <NavNode
              key={child.id}
              node={child}
              depth={depth + 1}
              openItems={openItems}
              toggle={toggle}
              permisos={permisos}
              userRol={userRol}
              modulosAsignados={modulosAsignados}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout, switchEmpresa, todasEmpresas } = useAuth();
  const [tasas, setTasas] = useState(null);
  const [moneda, setMoneda] = useState('USD');
  const [switchingEmpresa, setSwitchingEmpresa] = useState(false);
  const [openItems, setOpenItems] = useState(new Set([
    'rrhh', 'trabajadores', 'remuneraciones', 'configuracion',
  ]));
  const navigate = useNavigate();

  const permisos = user?.permisos || {};
  const modulosAsignados = user?.modulos_asignados || null;

  const toggle = (id) => setOpenItems(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  useEffect(() => {
    const fetchTasas = () => api.get('/tasas/hoy').then(r => setTasas(r.data)).catch(() => {});
    fetchTasas();
    const interval = setInterval(fetchTasas, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSwitchEmpresa = async (id) => {
    if (id === user?.empresa_id) return;
    setSwitchingEmpresa(true);
    try {
      await switchEmpresa(id);
      navigate('/');
      window.location.reload();
    } catch { alert('No se pudo cambiar de empresa'); }
    finally { setSwitchingEmpresa(false); }
  };

  return (
    <MonedaContext.Provider value={{ moneda, tasa: tasas?.tasa_usd }}>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-logo">
            <Logo size={34} />
          </div>

          <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
            <NavLink
              to="/" end
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              style={{ paddingLeft: 20, fontSize: 12 }}
            >
              <Icon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              Dashboard
            </NavLink>

            {NAV_TREE.map(node => (
              <NavNode
                key={node.id}
                node={node}
                depth={0}
                openItems={openItems}
                toggle={toggle}
                permisos={permisos}
                userRol={user?.rol}
                modulosAsignados={modulosAsignados}
              />
            ))}

            {user?.rol === 'SUPERADMIN' && (
              <>
                <div style={{
                  padding: '9px 14px', color: '#777', fontSize: 11,
                  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  SaaS Admin
                </div>
                <NavLink to="/superadmin" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} style={{ paddingLeft: 20, fontSize: 12 }}>
                  <Icon d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  Panel SaaS
                </NavLink>
              </>
            )}
          </nav>

          <div style={{ padding: '16px 20px', borderTop: '1px solid #333', fontSize: 12, color: '#999' }}>
            <div style={{ color: '#ccc', marginBottom: 2, fontWeight: 500 }}>{user?.nombre}</div>
            <div style={{ marginBottom: 6, fontSize: 11 }}>{user?.email}</div>
            {user?.plan && (
              <div style={{ marginBottom: 8, fontSize: 10, color: '#666', background: '#1a1a1a', padding: '3px 8px', borderRadius: 4, display: 'inline-block' }}>
                Plan {user.plan}
              </div>
            )}
            <button onClick={logout} style={{ background: 'none', border: '1px solid #444', color: '#aaa', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, width: '100%' }}>
              Cerrar sesión
            </button>
          </div>
        </aside>

        <div className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
          <header className="topbar" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div className="topbar-title">PandoraHR</div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {tasas ? (
                <div style={{ display: 'flex', gap: 20, fontSize: 12, alignItems: 'center', background: '#0d0d0d', padding: '5px 16px', borderRadius: 20, border: '1px solid #2a2a2a' }}>
                  <span style={{ color: '#888', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>BCV</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 10, padding: '1px 5px', borderRadius: 3 }}>USD</span>
                    <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 13 }}>Bs. {Number(tasas.tasa_usd).toFixed(2)}</span>
                  </span>
                  {tasas.tasa_eur && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 10, padding: '1px 5px', borderRadius: 3 }}>EUR</span>
                      <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: 13 }}>Bs. {Number(tasas.tasa_eur).toFixed(2)}</span>
                    </span>
                  )}
                  <span style={{ color: '#444', fontSize: 10 }}>{tasas.fecha}</span>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#444' }}>Sin tasa BCV registrada</div>
              )}
            </div>

            <div className="topbar-right">
              <select
                value={moneda}
                onChange={e => setMoneda(e.target.value)}
                style={{ background: '#222', color: '#ccc', border: '1px solid #444', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
              >
                <option value="USD">$ USD</option>
                <option value="VES">Bs. VES</option>
              </select>

              {todasEmpresas.length > 1 && (
                <select
                  value={user?.empresa_id}
                  onChange={e => handleSwitchEmpresa(Number(e.target.value))}
                  disabled={switchingEmpresa}
                  style={{ background: '#1a1a1a', color: '#ccc', border: '1px solid #555', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer', maxWidth: 180 }}
                  title="Cambiar empresa activa"
                >
                  {todasEmpresas.map(e => (
                    <option key={e.id} value={e.id}>{e.razon_social}</option>
                  ))}
                </select>
              )}

              <div className="topbar-empresa">{user?.empresa} · {user?.rif || ''}</div>
              <div className="topbar-user">{user?.nombre?.[0]?.toUpperCase()}</div>
            </div>
          </header>
          <main className="page-content">
            <Outlet />
          </main>
        </div>
      </div>
    </MonedaContext.Provider>
  );
}
