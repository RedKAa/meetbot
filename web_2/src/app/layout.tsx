import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import Navbar from '@/components/Navbar';

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "MeetBot AI - Cuộc họp thông minh với AI",
  description: "Tự động ghi âm, phân tích và tóm tắt cuộc họp Google Meet với công nghệ AI tiên tiến",
  keywords: "AI, meeting, recording, Google Meet, transcription, analysis",
  authors: [{ name: "MeetBot AI Team" }],
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className={`${inter.className} antialiased bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 min-h-screen`}>
        <AuthProvider>
          <Navbar />
          <main className="relative">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
