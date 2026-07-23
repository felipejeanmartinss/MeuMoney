# MeuMoney

Progressive Web App de gestão financeira pessoal. A Sprint 2 acrescenta a fundação financeira segura: contas, saldos iniciais, categorias padrão e personalizadas, contextos Pessoal/Profissional e preferência monetária.

## Stack

- Next.js 16, React 19, App Router e TypeScript estrito;
- Tailwind CSS 4;
- Supabase Auth, PostgreSQL, migrations e Row Level Security;
- PWA, Vitest e ESLint;
- Vercel e GitHub.

## Executar localmente

1. Copie `.env.example` para `.env.local` e informe a URL e a chave publicável do Supabase.
2. Instale as dependências com `npm.cmd install` no PowerShell.
3. Aplique as migrations com `npx.cmd supabase db reset` (ambiente local) ou pelo fluxo de deploy do Supabase.
4. Inicie com `npm.cmd run dev`.
5. Abra `http://localhost:3000` — não use a extensão Live Server, pois a aplicação precisa do servidor Next.js.

Configure no Supabase Auth as URLs permitidas `http://localhost:3000/**` e as URLs equivalentes da Vercel. Consulte [docs/local-setup.md](docs/local-setup.md).

## Sprint 2

- contas correntes, poupanças, dinheiro e outras contas;
- saldo inicial em unidades monetárias inteiras e sua data de referência;
- inativação e reativação sem exclusão destrutiva;
- categorias padrão imutáveis e categorias personalizadas;
- separação Pessoal/Profissional;
- moedas BRL, USD e EUR, com moeda preferencial no perfil;
- RLS e permissões por coluna para isolamento entre usuários.

Lançamentos, transferências, cartões, faturas, orçamentos, investimentos e dashboard financeiro completo permanecem fora desta entrega.

## Qualidade

```bash
npm.cmd run check
```

## Branches

- `main`: releases estáveis;
- `develop`: integração da próxima versão;
- `feature/*`: trabalho isolado com merge para `develop`.
