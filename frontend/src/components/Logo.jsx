import { useId } from 'react';

// Isotipo PandoraHR: equipo de tres personas unido por un arco (RRHH)
export function LogoMark({ size = 32 }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="PandoraHR"
      style={{ display: 'block', flexShrink: 0, filter: 'drop-shadow(0 4px 10px rgba(204,0,0,0.35))' }}>
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF3D3D" />
          <stop offset="0.55" stopColor="#CC0000" />
          <stop offset="1" stopColor="#7A0000" />
        </linearGradient>
        <linearGradient id={`hl${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`p${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#FFE1E1" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="10" fill={`url(#bg${id})`} />
      <rect x="1.5" y="1.5" width="37" height="18" rx="9.5" fill={`url(#hl${id})`} />
      <rect x="1" y="1" width="38" height="38" rx="10" fill="none" stroke="#fff" strokeOpacity="0.18" />
      {/* Equipo: dos personas atrás */}
      <g fill="#fff" fillOpacity="0.55">
        <circle cx="10.6" cy="16.2" r="3.1" />
        <path d="M4.9 29.5v-1.3a5.7 5.7 0 0 1 11.4 0v1.3z" />
        <circle cx="29.4" cy="16.2" r="3.1" />
        <path d="M23.7 29.5v-1.3a5.7 5.7 0 0 1 11.4 0v1.3z" />
      </g>
      {/* Persona al frente (separada con contorno del fondo) */}
      <g fill={`url(#p${id})`} stroke="#B80000" strokeWidth="1.4">
        <circle cx="20" cy="13.4" r="4.4" />
        <path d="M12.2 30v-1.6a7.8 7.8 0 0 1 15.6 0V30z" />
      </g>
      {/* Arco de unión del equipo */}
      <path d="M8.5 33.2Q20 38.2 31.5 33.2" fill="none" stroke="#fff" strokeOpacity="0.75"
        strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// Isotipo + nombre
export default function Logo({ size = 32, sub = 'by Amays Group', stacked = false }) {
  const textSize = stacked ? Math.round(size * 0.42) : Math.round(size * 0.5);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: stacked ? 12 : 10,
      flexDirection: stacked ? 'column' : 'row',
    }}>
      <LogoMark size={size} />
      <div style={{ textAlign: stacked ? 'center' : 'left', lineHeight: 1.1 }}>
        <div style={{ fontSize: textSize, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
          Pandora
          <span style={{
            marginLeft: 3, fontWeight: 800,
            background: 'linear-gradient(135deg, #FF4D4D, #CC0000)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>HR</span>
        </div>
        {sub && (
          <div style={{
            fontSize: Math.max(10, Math.round(textSize * 0.45)), color: '#8a8a8a',
            letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 3,
          }}>{sub}</div>
        )}
      </div>
    </div>
  );
}
