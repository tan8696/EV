"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap } from "lucide-react";

export const PAGES = [{ href: "/cockpit", label: "Cockpit" }] as const;

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00F0FF]";

export default function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07090E]/80 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className={`flex shrink-0 items-center gap-2 rounded-md text-sm font-semibold text-white ${focus}`}>
          <Zap className="h-4 w-4 text-[#00F0FF]" aria-hidden />
          <span>PakkaRange</span>
        </Link>
        <ul className="-mr-2 flex flex-1 justify-end gap-1 overflow-x-auto">
          {PAGES.map((p) => {
            const active = path === p.href;
            return (
              <li key={p.href}>
                <Link
                  href={p.href}
                  aria-current={active ? "page" : undefined}
                  className={`block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${focus} ${
                    active ? "bg-[#00F0FF]/15 text-[#00F0FF]" : "text-white/60 hover:text-white"
                  }`}
                >
                  {p.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
