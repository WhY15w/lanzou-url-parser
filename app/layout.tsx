import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "蓝奏云直链解析工具",
  description: "快速解析蓝奏云分享链接，获取直链下载地址",
  keywords: "蓝奏云, 直链, 解析, 下载",
  authors: [
    {
      name: "HurryWang",
      url: "https://github.com/WhY15w",
    },
  ],
  creator: "HurryWang",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
   return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
