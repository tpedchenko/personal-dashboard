import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PD Setup Wizard",
  description: "Personal Dashboard — Setup & Configuration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg">{children}</body>
    </html>
  );
}
