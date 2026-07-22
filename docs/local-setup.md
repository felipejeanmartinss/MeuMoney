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
