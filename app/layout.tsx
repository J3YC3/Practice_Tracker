import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ex Senior Tracker",
  description: "Team attendance and performance review system"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
