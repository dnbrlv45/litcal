import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Sidebar from "@/components/nav/Sidebar";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "LitCal",
  description: "Calendar-first litigation management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} h-full antialiased`}
    >
      <body className="h-full flex bg-background text-foreground overflow-hidden">
        <ClerkProvider appearance={{ theme: shadcn }}>
          <Sidebar />
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</main>
        </ClerkProvider>
      </body>
    </html>
  );
}
