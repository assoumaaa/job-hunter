import "./globals.css";

import { Inter } from "next/font/google";
import type { Metadata } from "next";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
	title: "Job Hunter",
	description: "AI-powered job hunting dashboard",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			lang="en"
			className={`${inter.variable} h-full overflow-hidden antialiased`}
		>
			<body className="h-full font-sans">{children}</body>
		</html>
	);
}
