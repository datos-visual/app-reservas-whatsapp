import './globals.css';

export const metadata = {
  title: 'CanalAgenda — Panel',
  description: 'Reservas por WhatsApp para tu negocio'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
