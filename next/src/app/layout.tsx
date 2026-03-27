import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { SerwistProvider } from "./serwist";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: {
    default: "Personal Dashboard — Privacy-First Life Management",
    template: "%s | Personal Dashboard",
  },
  description:
    "Open-source, self-hosted dashboard for finance, health, gym, investments, trading, and tax reporting. Your life, your data, your server.",
  keywords: [
    "personal dashboard",
    "self-hosted",
    "open source",
    "finance tracker",
    "health dashboard",
    "gym tracker",
    "investment portfolio",
    "trading bot",
    "tax reporting",
    "privacy-first",
    "PWA",
    "next.js",
  ],
  metadataBase: new URL("https://pd.taras.cloud"),
  alternates: {
    canonical: "https://pd.taras.cloud",
  },
  openGraph: {
    type: "website",
    url: "https://pd.taras.cloud",
    title: "Personal Dashboard — Privacy-First Life Management",
    description:
      "Open-source, self-hosted dashboard for finance, health, gym, investments, trading, and tax reporting. Your life, your data, your server.",
    siteName: "Personal Dashboard",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Personal Dashboard — Privacy-First Life Management",
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Personal Dashboard — Privacy-First Life Management",
    description:
      "Open-source, self-hosted dashboard for finance, health, gym, investments, trading, and tax reporting.",
    images: ["/og-image.png"],
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/PD.png",
    shortcut: "/PD.png",
    apple: "/icons/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PD",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const cookieStore = await cookies();
  const skin = cookieStore.get("skin")?.value;

  return (
    <html lang={locale} suppressHydrationWarning {...(skin && skin !== "easy" ? { "data-skin": skin } : {})}>
      <head>
        <meta name="theme-color" content="#0a0a0a" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Personal Dashboard",
              applicationCategory: "LifestyleApplication",
              operatingSystem: "Web",
              description:
                "Open-source, self-hosted dashboard for finance, health, gym, investments, trading, and tax reporting.",
              url: "https://pd.taras.cloud",
              author: {
                "@type": "Person",
                name: "Taras Pedchenko",
                url: "https://taras.cloud",
              },
              license: "https://www.gnu.org/licenses/agpl-3.0.html",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
              screenshot: "https://pd.taras.cloud/og-image.png",
              softwareVersion: "1.0",
              applicationSubCategory: "Personal Finance, Health Tracking",
            }),
          }}
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body
        className={`${inter.variable} ${inter.className} antialiased`}
      >
        <SerwistProvider swUrl="/serwist/sw.js">
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <NextIntlClientProvider messages={messages}>
              {children}
              <Toaster />
            </NextIntlClientProvider>
          </ThemeProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
