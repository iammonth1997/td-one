import "./globals.css";
import { Noto_Sans, Noto_Sans_Thai, Noto_Sans_Lao, Inter } from "next/font/google";
import { LanguageProvider } from "@/app/context/LanguageContext";
import type { Metadata, Viewport } from "next";
import PWARegister from "@/app/components/PWARegister";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans",
  display: "swap",
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-thai",
  display: "swap",
});

const notoSansLao = Noto_Sans_Lao({
  subsets: ["lao"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-lao",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TD One ERP",
  description: "ThaiDrill Lao Human Resource System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TD One",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1352A3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="th"
      className={`${notoSans.variable} ${notoSansThai.variable} ${notoSansLao.variable} ${inter.variable}`}
    >
      <body className="bg-[#F5F7FA] text-[#1A2B4A]">
        <LanguageProvider>{children}</LanguageProvider>
        <PWARegister />
      </body>
    </html>
  );
}
