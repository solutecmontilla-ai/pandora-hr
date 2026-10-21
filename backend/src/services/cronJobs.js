const cron = require('node-cron');
const axios = require('axios');
const db = require('../db/database');
const dayjs = require('dayjs');

async function actualizarTasaBCV() {
  try {
    const [resUsd, resAll] = await Promise.allSettled([
      axios.get('https://ve.dolarapi.com/v1/dolares/oficial', { timeout: 10000 }),
      axios.get('https://ve.dolarapi.com/v1/dolares', { timeout: 10000 })
    ]);
    const tasa_usd = resUsd.status === 'fulfilled'
      ? (resUsd.value.data?.promedio || resUsd.value.data?.precio || resUsd.value.data?.tasa)
      : null;
    const allRates = resAll.status === 'fulfilled' ? resAll.value.data : [];
    const eurData = Array.isArray(allRates) ? allRates.find(r => r.nombre?.toLowerCase().includes('euro') || r.moneda === 'EUR') : null;
    const tasa_eur = eurData ? (eurData.promedio || eurData.precio || eurData.tasa) : null;
    if (tasa_usd) {
      await db.execute(
        'INSERT INTO tasas_bcv (fecha, tasa_usd, tasa_eur) VALUES (CURDATE(), ?, ?) ON DUPLICATE KEY UPDATE tasa_usd=?, tasa_eur=?',
        [tasa_usd, tasa_eur, tasa_usd, tasa_eur]
      );
      console.log(`[BCV] USD: ${tasa_usd} | EUR: ${tasa_eur || 'N/A'}`);
    }
  } catch (err) {
    console.error('[BCV] Error actualizando tasa:', err.message);
  }
}

// Ejecutar al arrancar el servidor
actualizarTasaBCV();

// Actualizar diariamente a las 6am Venezuela (lunes a viernes)
cron.schedule('0 6 * * 1-5', actualizarTasaBCV, { timezone: 'America/Caracas' });

// Notificar planes vencidos diariamente
cron.schedule('0 9 * * *', async () => {
  try {
    const vencidas = await db.query(
      "SELECT id, email, razon_social FROM empresas WHERE fecha_vencimiento_plan < CURDATE() AND activo = 1 AND id > 1"
    );
    for (const empresa of vencidas) {
      console.log(`[SAAS] Plan vencido: ${empresa.razon_social} (${empresa.email})`);
      // TODO: enviar email de renovación y suspender después de días de gracia
    }
  } catch (err) {
    console.error('[SaaS] Error verificando planes:', err.message);
  }
}, { timezone: 'America/Caracas' });

console.log('✅ Cron jobs inicializados');
