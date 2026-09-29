import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slide Studio",
  description: "Create presentations with text, images and video",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
