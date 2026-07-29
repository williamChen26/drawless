import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "drawless",
  description: "与 Drew 一起梳理想法、推进工作的协作画布。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
