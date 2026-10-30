import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { Squares } from "@/components/react-bits";
import { DEPARTURE_HOUR, TripProvider } from "@/components/TripContext";

export const metadata: Metadata = {
  title: "PakkaRange — EV range you can trust",
  description: "Probabilistic EV range and charger reliability for Indian highways.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <TripProvider>
          <Squares />
          <Nav />
          <div className="flex-1">{children}</div>
          <footer className="mx-auto max-w-6xl px-4 py-6 text-center text-[11px] text-white/30 sm:px-6">
            Runs fully offline. Vehicle figures from public spec sheets; corridor, charger and report data are a curated demo dataset.
            Departure assumed <span className="font-mono tabular-nums">{String(DEPARTURE_HOUR).padStart(2, "0")}:00</span>.
          </footer>
        </TripProvider>
      </body>
    </html>
  );
}
