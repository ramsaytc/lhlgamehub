import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ClientOnly } from "@/components/client-only/ClientOnly";
import { HeaderBar } from "@/components/header/HeaderBar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LHL Game Hub",
  description: "League schedule and game results",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = cookies();
  const themeCookie =
    cookieStore?.get?.("theme")?.value ?? cookieStore?.["theme"] ?? undefined;
  const forceDark = themeCookie === "dark";

  return (
    <html lang="en" className={forceDark ? "dark" : ""} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const match = document.cookie.match(/(?:^|; )theme=([^;]+)/);
                if (match && match[1] === "dark") {
                  document.documentElement.classList.add("dark");
                }
              })();
            `,
          }}
        />
        <ClientOnly>
          <HeaderBar />
        </ClientOnly>
        {children}
      </body>
    </html>
  );
}
