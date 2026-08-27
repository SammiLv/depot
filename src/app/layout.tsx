import type { Metadata } from "next";
import { DeploymentSync } from "@/components/deployment-sync";
import "./globals.css";

export const metadata: Metadata = {
  title: "产品部管理工作台",
  description: "部门内部管理网站 MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <DeploymentSync />
        {children}
      </body>
    </html>
  );
}
