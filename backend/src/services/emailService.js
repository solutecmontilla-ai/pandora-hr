const nodemailer = require('nodemailer');

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendMail({ to, subject, html }) {
  const transporter = getTransporter();
  // Sin SMTP se informa el error: antes se registraba en el log y la pantalla
  // decía "Recibo enviado" aunque el correo nunca salía.
  if (!transporter) {
    console.log(`[EMAIL] SMTP sin configurar → ${to} | ${subject}`);
    throw new Error('el servidor de correo (SMTP) no está configurado');
  }
  await transporter.sendMail({
    from: `"PandoraHR" <${process.env.SMTP_FROM || 'noreply@pandorahr.amaysgroup.com'}>`,
    to, subject, html
  });
}

module.exports = { sendMail };
