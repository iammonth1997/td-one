import "./globals.css";

export const metadata = {
  title: "TD One ERP",
  description: "ThaiDrill Lao Human Resource System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-black text-white">{children}</body>
    </html>
  );
}