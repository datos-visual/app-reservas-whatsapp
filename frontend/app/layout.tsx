import './globals.css';
import { Instrument_Sans, Instrument_Serif } from 'next/font/google';

// Tipografía del sistema «editorial cálida»:
//  · Instrument Sans para toda la interfaz — humanista, legible a tamaño
//    pequeño y con más carácter que las neo-grotescas de rigor.
//  · Instrument Serif SOLO para el título de pantalla y la marca. Misma
//    fundición, así que casan sin esfuerzo.
//
// next/font descarga las fuentes EN EL BUILD y las sirve desde nuestro
// dominio: ni una petición del navegador de la clienta a Google (mejor
// rendimiento y ningún dato cedido a terceros — coherente con el aviso de
// privacidad). Si algún día el build de Render fallase por no poder
// descargarlas, basta con borrar estos imports y el className del <html>:
// las alternativas (system-ui y Georgia) están declaradas en globals.css.
const sans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans'
});
const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-serif'
});

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
    <html lang="es" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
