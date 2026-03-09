import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Dashboard Citas WhatsApp',
  description: 'MVP de gestión de citas con WhatsApp y Google Calendar'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}

