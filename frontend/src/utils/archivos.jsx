// Archivos protegidos (/api/...): se piden con el token JWT y se muestran como blob,
// porque <img src> y los enlaces directos no envían la cabecera Authorization.
import { useEffect, useState } from 'react';
import api from './api';

export function useArchivoUrl(ruta, activo = true) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!activo || !ruta) { setUrl(null); return; }
    let objectUrl = null;
    let cancelado = false;
    api.get(ruta, { responseType: 'blob' })
      .then(r => {
        if (cancelado) return;
        objectUrl = URL.createObjectURL(r.data);
        setUrl(objectUrl);
      })
      .catch(() => { if (!cancelado) setUrl(null); });
    return () => { cancelado = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [ruta, activo]);
  return url;
}

export function ImagenProtegida({ src, ...props }) {
  const url = useArchivoUrl(src);
  return url ? <img src={url} {...props} /> : null;
}

export async function abrirArchivo(ruta) {
  // Abrir la pestaña antes del await para que el navegador no la bloquee
  const win = window.open('', '_blank');
  try {
    const r = await api.get(ruta, { responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    if (win) win.location.href = url; else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (win) win.close();
    alert(err.response?.status === 404 ? 'El archivo no existe en el servidor. Vuelve a subirlo.' : 'No se pudo abrir el archivo');
  }
}
