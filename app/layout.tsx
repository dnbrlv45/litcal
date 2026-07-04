import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Fraunces } from "next/font/google";
import Sidebar from "@/components/nav/Sidebar";
import MobileNav from "@/components/nav/MobileNav";
import { AskLitCalProvider } from "@/components/ask-litcal/AskLitCalContext";
import AskLitCalPanel from "@/components/ask-litcal/AskLitCalPanel";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspaces";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// Serif display face for page/date headings (see DESIGN.md).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "LitCal",
  description: "Calendar-first litigation management",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const isSuperAdmin = user?.isSuperAdmin ?? false;
  let isViewer = false;
  if (user) {
    const { membership } = await getCurrentWorkspace(user.id);
    isViewer = membership?.role === "VIEWER";
  }

  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="h-full flex bg-background text-foreground overflow-hidden">
        <AskLitCalProvider>
          <Sidebar isSuperAdmin={isSuperAdmin} isViewer={isViewer} />
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden pb-16 md:pb-0">{children}</main>
          <MobileNav isViewer={isViewer} />
          <AskLitCalPanel />
        </AskLitCalProvider>
      </body>
    </html>
  );
}
