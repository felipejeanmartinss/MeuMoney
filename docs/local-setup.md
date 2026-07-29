# Configuração local

## Requisitos

- Node.js 22.14 ou superior;
- npm;
- projeto Supabase ou Supabase CLI/Docker para ambiente local.

## Aplicação

No PowerShell, use `npm.cmd` para evitar bloqueios do arquivo `npm.ps1` pela política de execução:

```powershell
Copy-Item .env.example .env.local
npm.cmd install
npm.cmd run dev
```

Preencha `.env.local` com `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Para testar a exclusão definitiva,
adicione também `SUPABASE_SECRET_KEY`; ela é estritamente server-only e nunca
deve possuir prefixo `NEXT_PUBLIC_`.

## Supabase Auth

- Site URL local: `http://localhost:3000`.
- Redirect URLs locais: `http://localhost:3000/**` e `http://127.0.0.1:3000/**`.
- Adicione também o domínio de produção e previews confiáveis da Vercel.
- Ative confirmação de e-mail para validar o fluxo completo.
- No plano gratuito, a proteção do Supabase contra credenciais vazadas não está
  disponível. O MVP exige 12 caracteres e bloqueia algumas senhas triviais,
  mas esse controle não substitui a checagem do plano Pro.

## Banco

Execute as migrations em ordem. A migration da Sprint 1 cria o perfil automaticamente ao inserir um usuário em `auth.users`; se a criação do perfil falhar, o cadastro falha na mesma transação.

A migration `202607230001_sprint_2_accounts_categories.sql` deve ser aplicada depois das migrations da Sprint 1. Ela:

- adiciona moeda preferencial ao perfil e data do saldo inicial às contas;
- cria categorias padrão para usuários novos e existentes;
- substitui políticas amplas por políticas separadas de leitura, inserção e atualização;
- não concede exclusão de contas ou categorias ao cliente.

Depois de aplicar a migration, reinicie `npm.cmd run dev`. Em ambiente hospedado, configure as mesmas variáveis públicas do Supabase em Production e Preview na Vercel e gere um novo deployment.

Para a Sprint 10, aplique em ordem:

1. `20260726071000_security_advisor_hardening.sql`;
2. `20260726071500_file_imports.sql`.

A primeira migration mantém os nomes públicos das RPCs, mas transforma essa
camada em fachadas `security invoker` e move as implementações privilegiadas
para `private`. A segunda cria jobs, staging, assinaturas, RLS e as operações
atômicas de importação. Só faça deploy da aplicação depois que ambas forem
aplicadas no Supabase do ambiente correspondente.

Para habilitar QIF, aplique depois das migrations de CSV/OFX, PDF e beta:

`20260728215713_qif_imports.sql`

Ela adiciona o formato, os mapeamentos de categoria e conta, a assinatura de
transferência e a confirmação atômica de lançamentos e transferências. A
aplicação só deve ser implantada depois dessa migration no mesmo ambiente.
