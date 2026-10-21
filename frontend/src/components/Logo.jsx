import { useId } from 'react';

// Isotipo PandoraHR: "P" cuyo hueco contiene una silueta de persona (RRHH)
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
      {/* Letra P con el hueco recortado */}
      <path fillRule="evenodd" fill={`url(#p${id})`}
        d="M11.5 8.5H21a9 9 0 0 1 0 18h-3v5h-6.5zM21 12.6a4.9 4.9 0 1 0 0 9.8a4.9 4.9 0 0 0 0-9.8z" />
      {/* Persona dentro del hueco */}
      <circle cx="21" cy="15.9" r="1.55" fill="#fff" />
      <path d="M18.1 21.2a2.9 2.4 0 0 1 5.8 0z" fill="#fff" />
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
