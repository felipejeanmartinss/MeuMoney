# Arquitetura

## Camadas

- `src/app`: rotas, Server Components, Route Handlers e Server Actions.
- `src/components`: apresentação e formulários; não cria clientes Supabase diretamente.
- `src/services`: adaptadores de autenticação e clientes Supabase para browser, servidor e Proxy.
- `src/utils`: validações e funções puras testáveis.
- `supabase/migrations`: esquema cumulativo, triggers e RLS.

## Autenticação

O browser inicia operações interativas do Supabase Auth. A rota `/auth/callback` troca o código PKCE por uma sessão armazenada em cookies. `src/proxy.ts` renova cookies e executa redirecionamentos otimistas. Páginas privadas chamam `requireUser()` no servidor e o PostgreSQL aplica RLS sobre cada consulta.

Redirecionamentos recebidos por query string aceitam apenas caminhos relativos internos. Respostas que atualizam cookies de autenticação recebem `Cache-Control: private, no-store`.

Após a troca de senha, o escopo global de logout invalida os refresh tokens e remove a sessão atual. O usuário entra novamente com a nova senha.
