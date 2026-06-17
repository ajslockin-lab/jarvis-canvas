import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JARVIS — Canvas Assistant",
  description: "Your personal academic voice assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="text-slate-100 font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
