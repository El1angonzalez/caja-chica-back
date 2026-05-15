import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// 1️⃣ Configura tu transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    servername: process.env.SMTP_HOST || 'smtp.gmail.com'
  }
});

// 2️⃣ Verifica la conexión (opcional)
transporter.verify((err, success) => {
  if (err) {
    console.error('❌ SMTP Error:', err);
  } else {
    console.log('✅ SMTP conectado:', success);
  }
});

// 3️⃣ Función para enviar correo
const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  attachments?: { filename: string; path: string; cid?: string }[]
): Promise<void> => {

  const text = html.replace(/<[^>]+>/g, '').trim();

  await transporter.sendMail({
    from: `"Tu Sistema" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
    attachments,  // ahora soporta CID
  });
};


export { sendEmail };
