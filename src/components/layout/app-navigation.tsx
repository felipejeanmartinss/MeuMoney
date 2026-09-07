"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  isNavigationItemActive,
  MAIN_NAVIGATION,
  resolveNavigationSection,
  SECONDARY_NAVIGATION,
  secondaryNavigationFor,
  type NavigationIcon,
  type NavigationItem,
} from "./navigation-model";

function NavigationGlyph({
  name,
  className = "size-5",
}: {
  name: NavigationIcon;
  className?: string;
}) {
  const paths: Record<NavigationIcon, React.ReactNode> = {
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    accounts: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </>
    ),
    investments: (
      <>
        <path d="M4 19V9" />
        <path d="M10 19V5" />
        <path d="M16 19v-7" />
        <path d="M22 19H2" />
      </>
    ),
    "net-worth": (
      <>
        <path d="M12 3v18" />
        <path d="M17 7.5c0-2-1.8-3.5-5-3.5S7 5.3 7 7.5 9 11 12 11s5 1.2 5 3.5S15.2 18 12 18s-5-1.5-5-3.5" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    transactions: (
      <>
        <path d="M7 7h11" />
        <path d="m15 4 3 3-3 3" />
        <path d="M17 17H6" />
        <path d="m9 14-3 3 3 3" />
      </>
    ),
    recurring: (
      <>
        <path d="M20 7h-5V2" />
        <path d="M4 17h5v5" />
        <path d="M5.5 9a8 8 0 0 1 13-3L20 7" />
        <path d="M18.5 15a8 8 0 0 1-13 3L4 17" />
      </>
    ),
    budgets: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <rect x="7" y="11" width="3" height="5" rx="1" />
        <rect x="13" y="7" width="3" height="9" rx="1" />
      </>
    ),
    transfers: (
      <>
        <path d="M4 8h14" />
        <path d="m15 5 3 3-3 3" />
        <path d="M20 16H6" />
        <path d="m9 13-3 3 3 3" />
      </>
    ),
    categories: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    cards: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M3 10h18" />
        <path d="M7 15h3" />
      </>
    ),
    imports: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    security: (
      <>
        <path d="M12 3 4 6v5c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    financing: (
      <>
        <path d="M4 8h16" />
        <path d="M6 8V5h12v3" />
        <path d="M7 12h2" />
        <path d="M7 16h2" />
        <path d="M13 12h4" />
        <path d="M13 16h4" />
        <path d="M4 21h16" />
      </>
    ),
    reports: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="m7 15 3-4 3 2 4-6" />
        <path d="M17 7h3v3" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function NavLink({
  item,
  pathname,
  search,
  compact = false,
}: {
  item: NavigationItem;
  pathname: string;
  search: string;
  compact?: boolean;
}) {
  const active = isNavigationItemActive(pathname, item, search);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group flex min-h-10 items-center gap-2.5 rounded-xl font-semibold transition ${
        compact ? "px-2.5 text-xs" : "px-3 text-sm"
      } ${
        active
          ? "bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-100"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      }`}
    >
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-lg ${
          active
            ? "bg-emerald-700 text-white"
            : "bg-slate-100 text-slate-500 group-hover:text-slate-800"
        }`}
      >
        <NavigationGlyph name={item.icon} className="size-4" />
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function useNavigationState() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return {
    pathname,
    search: searchParams.toString(),
    section: resolveNavigationSection(pathname),
  };
}

export function DesktopNavigation() {
  const { pathname, search, section } = useNavigationState();
  const secondary = secondaryNavigationFor(pathname);
  const sectionLabel = MAIN_NAVIGATION.find(
    (item) => item.section === section,
  )?.label;

  return (
    <div className="grid content-start gap-4">
      <nav aria-label="Navegação principal" className="grid gap-1">
        {MAIN_NAVIGATION.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            search={search}
          />
        ))}
      </nav>
      {secondary.length ? (
        <nav aria-label={`Opções de ${sectionLabel}`} className="grid gap-1">
          <p className="mb-1 px-2.5 text-[0.64rem] font-extrabold uppercase tracking-[0.16em] text-slate-400">
            {sectionLabel}
          </p>
          {secondary.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              search={search}
              compact
            />
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export function MobileSecondaryMenu() {
  const { pathname, search } = useNavigationState();
  const groups = Object.entries(SECONDARY_NAVIGATION);

  return (
    <details className="group relative">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm marker:hidden">
        <span className="grid gap-1" aria-hidden="true">
          <span className="h-0.5 w-4 rounded bg-current" />
          <span className="h-0.5 w-4 rounded bg-current" />
          <span className="h-0.5 w-4 rounded bg-current" />
        </span>
        Menu
      </summary>
      <div className="absolute right-0 z-40 mt-2 max-h-[70dvh] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
        {groups.map(([section, items]) => (
          <div
            key={section}
            className="grid gap-1 border-b border-slate-100 py-3 first:pt-0 last:border-0 last:pb-0"
          >
            <p className="px-3 text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-slate-400">
              {MAIN_NAVIGATION.find((item) => item.section === section)?.label}
            </p>
            {items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                search={search}
                compact
              />
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

export function MobileBottomNavigation() {
  const { pathname } = useNavigationState();
  const activeSection = resolveNavigationSection(pathname);

  return (
    <nav
      aria-label="Navegação principal no celular"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-slate-200 bg-white/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-0.4rem_1.5rem_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
    >
      {MAIN_NAVIGATION.map((item) => {
        const active = item.section === activeSection;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`grid min-h-14 place-items-center content-center gap-1 rounded-xl px-0.5 text-[0.58rem] font-bold sm:text-[0.64rem] ${
              active ? "text-emerald-800" : "text-slate-500"
            }`}
          >
            <span
              className={`grid h-7 min-w-10 place-items-center rounded-full px-2 ${
                active ? "bg-emerald-100" : ""
              }`}
            >
              <NavigationGlyph name={item.icon} className="size-[1.15rem]" />
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
