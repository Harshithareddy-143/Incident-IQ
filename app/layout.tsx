import type { Metadata } from "next";
import "../incidentiq.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "IncidentIQ | Incident operations",
  description: "Incident response with persistent engineering memory.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
