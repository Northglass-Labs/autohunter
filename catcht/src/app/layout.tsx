import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { INSTANCE_CONFIG } from "@/lib/instance-config";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const display = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://autohunter.northglass.io"),
  title: { default: INSTANCE_CONFIG.appName, template: `%s · ${INSTANCE_CONFIG.appName}` },
  description: "Private vehicle intelligence for used-car opportunities, lease programs, package evidence, and household decisions.",
  applicationName: INSTANCE_CONFIG.appName,
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], shortcut: "/favicon.ico" },
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
