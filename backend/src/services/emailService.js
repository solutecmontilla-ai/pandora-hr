const nodemailer = require('nodemailer');

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendMail({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[EMAIL] → ${to} | ${subject}`);
    return;
  }
  await transporter.sendMail({
    from: `"PandoraHR" <${process.env.SMTP_FROM || 'noreply@pandorahr.amaysgroup.com'}>`,
    to, subject, html
  });
}

module.exports = { sendMail };
