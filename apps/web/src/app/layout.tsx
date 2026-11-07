import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Plex · Agents, with receipts", template: "%s · Plex" },
  description:
    "Plex is a money layer for the agent era, built on PayPal. Agents can spend and hire people, within your limits, and every dollar comes with a receipt.",
};

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function RootLayout({ children }: LayoutProps<"/">) {
  const app = <Providers>{children}</Providers>;
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* Client-side Clerk only: no `dynamic`, so pages still prerender (cacheComponents). */}
      <body className="min-h-full">{clerkEnabled ? (
          <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" afterSignOutUrl="/home">
            {app}
          </ClerkProvider>
        ) : (
          app
        )}</body>
    </html>
  );
}
