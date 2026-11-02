import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import '@fontsource-variable/manrope';
import './globals.css';

export const metadata: Metadata = {
  title: 'PROV · Planejador Financeiro',
  description: 'Controle de cartões, dívidas, rendas, contas fixas e investimentos.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f8fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1626' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
