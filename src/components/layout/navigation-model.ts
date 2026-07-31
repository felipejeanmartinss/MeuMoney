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
  | "financing";

export type NavigationItem = {
  href: string;
  label: string;
  icon: NavigationIcon;
  match: readonly string[];
};

export type NavigationSection =
  | "home"
  | "accounts"
  | "investments"
  | "net-worth"
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
    section: "profile",
    href: "/settings",
    label: "Perfil",
    icon: "profile",
    match: ["/settings", "/imports"],
  },
];

export const SECONDARY_NAVIGATION: Record<
  Exclude<NavigationSection, "home" | "net-worth">,
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
      href: "/transactions",
      label: "Movimentações",
      icon: "transactions",
      match: ["/transactions"],
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
      href: "/transfers",
      label: "Transferências",
      icon: "transfers",
      match: ["/transfers"],
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
    },
    {
      href: "/investments?tab=financing",
      label: "Financiamentos",
      icon: "financing",
      match: [],
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
  if (item.href.includes("?")) {
    const [path, query] = item.href.split("?");
    return pathname === path && searchParams === query;
  }
  if (
    item.href === "/investments" &&
    pathname === "/investments" &&
    searchParams === "tab=financing"
  ) {
    return false;
  }
  return item.match.some((prefix) => matchesPath(pathname, prefix));
}

export function secondaryNavigationFor(pathname: string) {
  const section = resolveNavigationSection(pathname);
  if (section === "home" || section === "net-worth") return [];
  return SECONDARY_NAVIGATION[section];
}
