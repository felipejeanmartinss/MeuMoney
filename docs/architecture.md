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

Valores monetários são convertidos na fronteira do formulário e persistidos como inteiros em unidades menores. A moeda é armazenada separadamente. Contas e categorias usam arquivamento lógico (`archived_at`), preservando referências futuras e histórico.

Categorias iniciais são criadas no banco junto ao perfil, por função `security definer`. O campo `is_system` registra apenas que a categoria veio desse conjunto de sugestões; a política de atualização permite ao proprietário editar, inativar ou reativar qualquer uma de suas categorias.

## Movimentações financeiras — Sprint 3

As rotas `/transactions` e `/transfers` seguem o mesmo fluxo Server Component → Server Action → serviço de dados. Formulários validam a entrada com Zod, enquanto triggers e funções SQL repetem as invariantes críticas na fronteira confiável do banco.

Receitas e despesas são persistidas em `transactions`. Transferências usam uma tabela canônica separada e duas entradas vinculadas. Mutações de transferência são expostas apenas por RPCs `security definer` com `search_path` vazio; assim, a origem e o destino são criados, editados e inativados atomicamente.

O saldo não é atualizado por incrementos mutáveis. A view `account_balances`, executada com as políticas do usuário chamador, calcula o valor atual a partir do saldo inicial e apenas de movimentações ativas e realizadas. Essa decisão elimina rotinas de compensação ao editar lançamentos e reduz o risco de divergência.

## Cartões e faturas — Sprint 4

Cartões são lidos e editados por Server Components, Server Actions e serviços exclusivos do servidor. Compras, parcelas, fechamento, pagamento e estorno não aceitam escrita direta do cliente: RPCs `security definer`, com `search_path` vazio e validação de `auth.uid()`, executam cada operação crítica em uma única transação PostgreSQL.

O consumo é reconhecido na compra e categorizado como despesa, mas não movimenta uma conta. O pagamento integral da fatura cria uma transação técnica realizada, vinculada à fatura por `origin_type` e chaves estrangeiras. Essa transação representa a liquidação financeira e é protegida contra edição manual. A view `credit_card_summaries`, com `security_invoker`, deriva o limite utilizado de todas as parcelas ativas ainda não pagas.

Valores de cartão também usam unidades menores inteiras. As colunas `numeric(16,0)` preservam exatidão no PostgreSQL e permanecem dentro do intervalo inteiro seguro adotado pelo TypeScript. Consulte `docs/credit-cards.md`.

## Recorrências

A rota `/recurring-transactions` mantém modelos periódicos por Server Components, Server Actions e um serviço exclusivo do servidor. A geração não ocorre durante renderização e exige uma ação explícita do usuário com data limite, evitando efeitos colaterais ocultos.

O PostgreSQL é a fronteira transacional da geração. A RPC `generate_recurring_transactions` seleciona apenas modelos de `auth.uid()`, bloqueia as linhas processadas e combina índice único parcial com `ON CONFLICT DO NOTHING`. Assim, retries e execuções concorrentes são seguros. Cada ocorrência nasce como lançamento Previsto, com vínculo de origem imutável; o saldo realizado permanece inalterado.

O cálculo de próxima data usa a data inicial como âncora. A mesma regra pura existe no domínio TypeScript para validação e testes de calendário, enquanto a função SQL é a implementação autoritativa durante a geração. Estados são alterados por RPC para impedir que um cliente reative uma recorrência encerrada.
