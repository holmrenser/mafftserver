import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
// react-bio-viz injects this at runtime too; importing it here means the
// viewers' toolbars are already styled in the server-rendered HTML instead
// of flashing unstyled until hydration.
import "react-bio-viz/style.css";
import "./globals.css";
import { Nav } from "./nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "mafftserver",
  description: "Run MAFFT multiple sequence alignments from your browser.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Nav />
        {children}
      </body>
    </html>
  );
}
