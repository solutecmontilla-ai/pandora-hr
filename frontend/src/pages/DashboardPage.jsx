import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../utils/api';
import dayjs from 'dayjs';
import { MonedaContext } from '../components/Layout';

const estadoBadge = { BORRADOR: 'badge-gris', CERRADA: 'badge-verde', PAGADA: 'badge-verde' };

export default function DashboardPage() {
  const navigate = useNavigate();
  const { moneda, tasa: tasaBCV } = useContext(MonedaContext);
  const [empleados, setEmpleados] = useState([]);
  const [nominas, setNominas] = useState([]);
  const [vacaciones, setVacaciones] = useState([]);

  useEffect(() => {
    Promise.allSettled([
      api.get('/nomina/empleados'),
      api.get('/nomina'),
      api.get('/nomina/vacaciones'),
    ]).then(([e, n, v]) => {
      if (e.status === 'fulfilled') setEmpleados(e.value.data || []);
      if (n.status === 'fulfilled') setNominas(n.value.data || []);
      if (v.status === 'fulfilled') setVacaciones(v.value.data || []);
    });
  }, []);

  const fmt = (v) => {
    const val = Number(v || 0);
    if (moneda === 'VES' && tasaBCV) return `Bs. ${(val * tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
    return `$ ${val.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
  };

  const activos = empleados.filter(e => Number(e.activo) === 1);
  const masaSalarial = activos.reduce((s, e) => s + Number(e.salario_base || 0), 0);
  const ingresosMes = activos.filter(e => e.fecha_ingreso && dayjs(e.fecha_ingreso).isSame(dayjs(), 'month')).length;
  const nominasAbiertas = nominas.filter(n => n.estado === 'BORRADOR').length;

  const porDepto = Object.entries(
    activos.reduce((acc, e) => { const d = e.departamento || 'Sin departamento'; acc[d] = (acc[d] || 0) + 1; return acc; }, {})
  ).map(([departamento, total]) => ({ departamento, total })).sort((a, b) => b.total - a.total).slice(0, 8);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Dashboard · Recursos Humanos</h2>
        <button className="btn btn-primary" onClick={() => navigate('/trabajadores/nuevo')}>+ Nuevo trabajador</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="kpi-card verde">
          <div className="kpi-label">Trabajadores activos</div>
          <div className="kpi-value">{activos.length}</div>
          <div className="kpi-sub">{empleados.length - activos.length} egresados</div>
        </div>
        <div className="kpi-card azul">
          <div className="kpi-label">Masa salarial mensual</div>
          <div className="kpi-value">{fmt(masaSalarial)}</div>
          <div className="kpi-sub">Salario base de activos</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Nóminas abiertas</div>
          <div className="kpi-value">{nominasAbiertas}</div>
          <div className="kpi-sub">{nominas.length} nóminas registradas</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Ingresos del mes</div>
          <div className="kpi-value">{ingresosMes}</div>
          <div className="kpi-sub">{dayjs().format('MM/YYYY')}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Trabajadores por departamento</div></div>
          <div className="card-body" style={{ height: 260 }}>
            {porDepto.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porDepto} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" allowDecimals={false} stroke="#666" fontSize={11} />
                  <YAxis type="category" dataKey="departamento" stroke="#666" fontSize={11} width={120} />
                  <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }} />
                  <Bar dataKey="total" fill="#CC0000" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-gris text-sm">Sin trabajadores registrados</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Últimas nóminas</div></div>
          <div className="card-body">
            <table className="table">
              <thead><tr><th>Período</th><th>Tipo</th><th>Estado</th></tr></thead>
              <tbody>
                {nominas.slice(0, 6).map(n => (
                  <tr key={n.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/nomina/salarios')}>
                    <td>{n.periodo}</td>
                    <td>{n.tipo}{n.subtipo ? ` · ${n.subtipo}` : ''}</td>
                    <td><span className={`badge ${estadoBadge[n.estado] || 'badge-gris'}`}>{n.estado}</span></td>
                  </tr>
                ))}
                {!nominas.length && <tr><td colSpan="3" className="text-gris text-sm">Sin nóminas</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Vacaciones recientes</div></div>
          <div className="card-body">
            <table className="table">
              <thead><tr><th>Trabajador</th><th>Cargo</th><th>Registrada</th></tr></thead>
              <tbody>
                {vacaciones.slice(0, 6).map(v => (
                  <tr key={v.id}>
                    <td>{v.empleado_nombre}</td>
                    <td>{v.cargo || '—'}</td>
                    <td>{dayjs(v.created_at).format('DD/MM/YYYY')}</td>
                  </tr>
                ))}
                {!vacaciones.length && <tr><td colSpan="3" className="text-gris text-sm">Sin vacaciones registradas</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Accesos rápidos</div></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Nómina de Salarios', path: '/nomina/salarios', color: 'btn-primary' },
              { label: 'Cesta Ticket', path: '/nomina/cesta-ticket', color: 'btn-secondary' },
              { label: 'Vacaciones', path: '/nomina/vacaciones', color: 'btn-secondary' },
              { label: 'Utilidades', path: '/nomina/utilidades', color: 'btn-secondary' },
              { label: 'Constancia de Trabajo', path: '/trabajadores/constancias', color: 'btn-secondary' },
            ].map(a => (
              <button key={a.path} className={`btn ${a.color}`} onClick={() => navigate(a.path)}>{a.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
