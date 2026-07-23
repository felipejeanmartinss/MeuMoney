# Arquitetura

## Camadas

- `src/app`: rotas, Server Components, Route Handlers e Server Actions.
- `src/components`: apresentação e formulários; não cria clientes Supabase diretamente.
- `src/services`: casos de acesso a dados no servidor, adaptadores de autenticação e clientes Supabase para browser, servidor e Proxy.
- `src/domain`: tipos, validações e regras puras independentes da interface.
- `src/utils`: utilitários puros e funções de segurança testáveis.
- `supabase/migrations`: esquema cumulativo, triggers e RLS.

## Autenticação

O browser inicia operações interativas do Supabase Auth. A rota `/auth/callback` troca o código PKCE por uma sessão armazenada em cookies. `src/proxy.ts` renova cookies e executa redirecionamentos otimistas. Páginas privadas chamam `requireUser()` no servidor e o PostgreSQL aplica RLS sobre cada consulta.

Redirecionamentos recebidos por query string aceitam apenas caminhos relativos internos. Respostas que atualizam cookies de autenticação recebem `Cache-Control: private, no-store`.

Após a troca de senha, o escopo global de logout invalida os refresh tokens e remove a sessão atual. O usuário entra novamente com a nova senha.

## Fundação financeira — Sprint 2

As rotas `/accounts` e `/categories` usam Server Components para leitura e Server Actions para mutações. Componentes de formulário não acessam o Supabase diretamente. Os serviços em `src/services/finance` sempre obtêm o usuário validado com `requireUser()` e ainda aplicam filtro explícito por `user_id`; o PostgreSQL mantém a barreira definitiva com RLS.

Valores monetários são convertidos na fronteira do formulário e persistidos como inteiros em unidades menores. A moeda é armazenada separadamente. Contas e categorias personalizadas usam arquivamento lógico (`archived_at`), preservando referências futuras e histórico.

Categorias padrão são criadas no banco junto ao perfil, por função `security definer`. O cliente pode consultá-las, mas não recebe política nem privilégio de atualização para registros `is_system = true`.
