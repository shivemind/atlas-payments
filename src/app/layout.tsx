import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Atlas Payments Service",
  description: "Core payment processing service for the Atlas platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
