import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Navigation } from '@/components/layout/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Providers } from '@/components/providers/Providers';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'CiteBite - AI-Powered Research Assistant',
  description:
    'Chat with research papers using RAG and AI. Automatically collect papers and get citation-backed answers.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <Navigation user={user} />
          <main className="min-h-screen">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
