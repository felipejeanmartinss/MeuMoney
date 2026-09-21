export type NavigationIcon =
  | "home"
  | "accounts"
  | "investments"
  | "net-worth"
  | "profile"
  | "transactions"
  | "recurring"
  | "budgets"
  | "transfers"
  | "categories"
  | "cards"
  | "imports"
  | "security"
  | "financing"
  | "reports"
  | "target"
  | "checkin";

export type NavigationItem = {
  href: string;
  label: string;
  icon: NavigationIcon;
  match: readonly string[];
  exclude?: readonly string[];
};

export type NavigationSection =
  | "home"
  | "accounts"
  | "investments"
  | "net-worth"
  | "reports"
  | "profile";

export const MAIN_NAVIGATION: ReadonlyArray<
  NavigationItem & { section: NavigationSection }
> = [
  {
    section: "home",
    href: "/dashboard",
    label: "Início",
    icon: "home",
    match: ["/dashboard"],
  },
  {
    section: "home",
    href: "/check-in",
    label: "Check-in",
    icon: "checkin",
    match: ["/check-in"],
  },
  {
    section: "home",
    href: "/goals",
    label: "Metas",
    icon: "target",
    match: ["/goals"],
  },
  {
    section: "accounts",
    href: "/accounts",
    label: "Contas",
    icon: "accounts",
    match: [
      "/accounts",
      "/transactions",
      "/recurring-transactions",
      "/budgets",
      "/transfers",
      "/categories",
      "/credit-cards",
    ],
  },
  {
    section: "investments",
    href: "/investments",
    label: "Investimentos",
    icon: "investments",
    match: ["/investments"],
  },
  {
    section: "net-worth",
    href: "/net-worth",
    label: "Patrimônio",
    icon: "net-worth",
    match: ["/net-worth"],
  },
  {
    section: "reports",
    href: "/reports",
    label: "Relatórios",
    icon: "reports",
    match: ["/reports"],
  },
  {
    section: "profile",
    href: "/settings",
    label: "Perfil",
    icon: "profile",
    match: ["/settings", "/imports", "/data-quality"],
  },
];

export const SECONDARY_NAVIGATION: Record<
  Exclude<NavigationSection, "home" | "net-worth" | "reports">,
  readonly NavigationItem[]
> = {
  accounts: [
    {
      href: "/accounts",
      label: "Visão geral",
      icon: "accounts",
      match: ["/accounts"],
    },
    {
      href: "/recurring-transactions",
      label: "Recorrências",
      icon: "recurring",
      match: ["/recurring-transactions"],
    },
    {
      href: "/budgets",
      label: "Orçamentos",
      icon: "budgets",
      match: ["/budgets"],
    },
    {
      href: "/categories",
      label: "Categorias",
      icon: "categories",
      match: ["/categories"],
    },
    {
      href: "/credit-cards",
      label: "Cartões",
      icon: "cards",
      match: ["/credit-cards"],
    },
  ],
  investments: [
    {
      href: "/investments",
      label: "Posições",
      icon: "investments",
      match: ["/investments"],
      exclude: ["/investments/prices", "/investments/benchmarks", "/investments/financing-imports", "/investments/financings"],
    },
    {
      href: "/investments/prices",
      label: "Cotações",
      icon: "investments",
      match: ["/investments/prices"],
    },
    {
      href: "/investments/benchmarks",
      label: "Benchmarks",
      icon: "reports",
      match: ["/investments/benchmarks"],
    },
    {
      href: "/investments?tab=financing",
      label: "Financiamentos",
      icon: "financing",
      match: ["/investments/financing-imports", "/investments/financings"],
    },
  ],
  profile: [
    {
      href: "/settings/profile",
      label: "Informações pessoais",
      icon: "profile",
      match: ["/settings/profile"],
    },
    {
      href: "/imports",
      label: "Importações",
      icon: "imports",
      match: ["/imports"],
    },
    {
      href: "/data-quality",
      label: "Qualidade dos dados",
      icon: "security",
      match: ["/data-quality"],
    },
    {
      href: "/settings/security",
      label: "Segurança e dados",
      icon: "security",
      match: ["/settings/security"],
    },
  ],
};

function matchesPath(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolveNavigationSection(pathname: string): NavigationSection {
  return (
    MAIN_NAVIGATION.find((item) =>
      item.match.some((prefix) => matchesPath(pathname, prefix)),
    )?.section ?? "home"
  );
}

export function isNavigationItemActive(
  pathname: string,
  item: NavigationItem,
  searchParams = "",
) {
  if (item.exclude?.some((prefix) => matchesPath(pathname, prefix))) return false;
  if (item.href.includes("?")) {
    const [path, query] = item.href.split("?");
    const actual = new URLSearchParams(searchParams);
    return (pathname === path && [...new URLSearchParams(query)].every(
      ([key, value]) => actual.get(key) === value,
    )) || item.match.some((prefix) => matchesPath(pathname, prefix));
  }
  if (
    item.href === "/investments" &&
    pathname === "/investments" &&
    item.label === "Posições" &&
    new URLSearchParams(searchParams).get("tab") === "financing"
  ) {
    return false;
  }
  return item.match.some((prefix) => matchesPath(pathname, prefix));
}

// Keep one row of reachable destinations on narrow screens; the menu holds all routes.
export const MOBILE_NAVIGATION = MAIN_NAVIGATION.filter((item) =>
  ["/dashboard", "/check-in", "/goals", "/accounts", "/investments"].includes(item.href),
);

export function secondaryNavigationFor(pathname: string) {
  const section = resolveNavigationSection(pathname);
  if (
    section === "home" ||
    section === "net-worth" ||
    section === "reports"
  ) {
    return [];
  }
  return SECONDARY_NAVIGATION[section];
}
