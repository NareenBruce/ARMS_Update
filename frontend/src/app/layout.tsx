"use client";

import { useState, useEffect, createContext, useContext } from "react";
import "./globals.css";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/match", label: "Find Reviewer", icon: "🔍" },
  { href: "/database", label: "Database", icon: "📊" },
  { href: "/add", label: "Add Reviewers", icon: "➕" },
];

// Light mode: warm slate palette that complements violet accents
// Dark mode: deep zinc palette (existing)
const themes = {
  dark: {
    bg: "bg-zinc-950",
    text: "text-zinc-100",
    navBg: "bg-zinc-950/80 border-zinc-800",
    cardBg: "bg-zinc-900 border-zinc-800",
    inputBg: "bg-zinc-800 border-zinc-700 placeholder:text-zinc-500",
    mutedText: "text-zinc-400",
    subText: "text-zinc-300",
    hoverBg: "hover:bg-zinc-800",
    statBg: "bg-zinc-800",
    borderFaint: "border-zinc-800/50",
    border: "border-zinc-800",
    badge: { active: "bg-emerald-500/20 text-emerald-400", mild: "bg-amber-500/20 text-amber-400", inactive: "bg-red-500/20 text-red-400", specialist: "bg-blue-500/20 text-blue-400", moderate: "bg-zinc-500/20 text-zinc-400", generalist: "bg-orange-500/20 text-orange-400", strong: "bg-emerald-500/20 text-emerald-400", good: "bg-blue-500/20 text-blue-400", weak: "bg-zinc-500/20 text-zinc-400", verified: "bg-emerald-500/20 text-emerald-400", unverified: "bg-red-500/20 text-red-400" },
    resultCard: { verified: "bg-emerald-500/10 text-emerald-400", unverified: "bg-amber-500/10 text-amber-400", inactive: "bg-orange-500/10 text-orange-400", failed: "bg-red-500/10 text-red-400" },
  },
  light: {
    bg: "bg-white",
    text: "text-gray-900",
    navBg: "bg-white border-gray-200",
    cardBg: "bg-white border-gray-200",
    inputBg: "bg-gray-50 border-gray-300 placeholder:text-gray-400",
    mutedText: "text-gray-500",
    subText: "text-gray-700",
    hoverBg: "hover:bg-gray-50",
    statBg: "bg-gray-50",
    borderFaint: "border-gray-100",
    border: "border-gray-200",
    badge: { active: "bg-emerald-50 text-emerald-700", mild: "bg-amber-50 text-amber-700", inactive: "bg-red-50 text-red-700", specialist: "bg-blue-50 text-blue-700", moderate: "bg-gray-100 text-gray-600", generalist: "bg-orange-50 text-orange-700", strong: "bg-emerald-50 text-emerald-700", good: "bg-blue-50 text-blue-700", weak: "bg-gray-100 text-gray-600", verified: "bg-emerald-50 text-emerald-700", unverified: "bg-red-50 text-red-700" },
    resultCard: { verified: "bg-emerald-50 text-emerald-700", unverified: "bg-amber-50 text-amber-700", inactive: "bg-orange-50 text-orange-700", failed: "bg-red-50 text-red-700" },
  },
};

interface ThemeCtx {
  dark: boolean;
  t: typeof themes.dark;
}

export const ThemeContext = createContext<ThemeCtx>({
  dark: true,
  t: themes.dark,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("arms-theme");
    if (saved !== null) setDark(saved === "dark");
  }, []);

  useEffect(() => {
    localStorage.setItem("arms-theme", dark ? "dark" : "light");
  }, [dark]);

  const t = dark ? themes.dark : themes.light;

  return (
    <html lang="en">
      <head>
        <title>ARMS</title>
      </head>
      <body className={`${t.bg} ${t.text} min-h-screen transition-colors duration-200`}>
        <nav className={`border-b ${t.navBg} backdrop-blur-md sticky top-0 z-50`}>
          <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">
            <Link href="/match" className="flex items-center gap-2 text-lg font-bold text-violet-600">
              ARMS
            </Link>
            <div className="flex items-center gap-1">
              {navItems.map((item) => (
                <NavTab key={item.href} href={item.href} label={item.label} icon={item.icon} t={t} />
              ))}

              {/* Theme Toggle — Pill Switch */}
              <button
                onClick={() => setDark(!dark)}
                className={`ml-3 relative w-14 h-7 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                  dark ? "bg-zinc-700" : "bg-violet-200"
                }`}
                title={dark ? "Switch to light mode" : "Switch to dark mode"}
                aria-label="Toggle theme"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs transition-transform duration-200 ${
                    dark
                      ? "translate-x-7 bg-zinc-900 text-amber-300"
                      : "translate-x-0 bg-white text-violet-500 shadow-sm"
                  }`}
                >
                  {dark ? "☀" : "☾"}
                </span>
              </button>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-8">
          <ThemeContext.Provider value={{ dark, t }}>
            {children}
          </ThemeContext.Provider>
        </main>
      </body>
    </html>
  );
}

function NavTab({ href, label, icon, t }: { href: string; label: string; icon: string; t: typeof themes.dark }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? "bg-violet-600/15 text-violet-600"
          : `${t.mutedText} ${t.hoverBg}`
      }`}
    >
      <span className="mr-1.5">{icon}</span>
      {label}
    </Link>
  );
}
