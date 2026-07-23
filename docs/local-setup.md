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

Preencha `.env.local` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A chave de serviço não é usada pela aplicação web.

## Supabase Auth

- Site URL local: `http://localhost:3000`.
- Redirect URLs locais: `http://localhost:3000/**` e `http://127.0.0.1:3000/**`.
- Adicione também o domínio de produção e previews confiáveis da Vercel.
- Ative confirmação de e-mail para validar o fluxo completo.

## Banco

Execute as migrations em ordem. A migration da Sprint 1 cria o perfil automaticamente ao inserir um usuário em `auth.users`; se a criação do perfil falhar, o cadastro falha na mesma transação.

A migration `202607230001_sprint_2_accounts_categories.sql` deve ser aplicada depois das migrations da Sprint 1. Ela:

- adiciona moeda preferencial ao perfil e data do saldo inicial às contas;
- cria categorias padrão para usuários novos e existentes;
- substitui políticas amplas por políticas separadas de leitura, inserção e atualização;
- não concede exclusão de contas ou categorias ao cliente.

Depois de aplicar a migration, reinicie `npm.cmd run dev`. Em ambiente hospedado, configure as mesmas variáveis públicas do Supabase em Production e Preview na Vercel e gere um novo deployment.
