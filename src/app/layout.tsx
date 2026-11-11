import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DeploymentSync } from "@/components/deployment-sync";
import "./globals.css";

function getProductionBuildId() {
  try {
    return readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return "dev";
  }
}

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
      <body className="min-h-full flex flex-col" data-build-id={getProductionBuildId()}>
        <DeploymentSync />
        {children}
      </body>
    </html>
  );
}
