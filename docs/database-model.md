# Modelo de dados

## Perfis

`public.profiles` contém `id`, `full_name`, `preferred_currency`, `created_at` e `updated_at`. `id` referencia `auth.users(id)` com exclusão em cascata.

A função `handle_new_user` é `security definer`, usa `search_path` vazio, cria o perfil a partir de `raw_user_meta_data.full_name` e semeia as categorias padrão na mesma transação. Clientes autenticados recebem apenas `SELECT` e `UPDATE (full_name, preferred_currency)`; políticas RLS restringem ambas as operações a `auth.uid() = id`. Não há permissão de inserção ou exclusão pelo cliente.

## Contas

`public.accounts` contém proprietário, nome, tipo, contexto, moeda, `opening_balance_minor`, `opening_balance_date`, estado de arquivamento e timestamps. O saldo inicial usa `bigint`, nunca ponto flutuante. RLS separa leitura, inserção e atualização por `auth.uid() = user_id`; não existe política de exclusão.

## Categorias

`public.categories` contém proprietário, nome, natureza, contexto, indicador de origem na taxonomia inicial, arquivamento e timestamps. A função `seed_default_categories` cria as sugestões iniciais de cada usuário e também atende usuários existentes durante a migration.

RLS permite leitura e atualização das categorias pelo proprietário. O campo `is_system` é mantido somente como informação de origem e não bloqueia alterações. Os privilégios por coluna impedem o cliente de alterar esse indicador, e não existe política de exclusão.

## Lançamentos

`public.transactions` representa somente receitas e despesas. O valor usa `bigint` positivo; `transaction_type` define seu efeito no saldo. `status` diferencia `pending` de `completed`, e `is_active` preserva o histórico sem exclusão física.

Um trigger valida que conta, categoria e usuário são compatíveis e que a natureza da categoria coincide com o tipo do lançamento. RLS e privilégios por coluna permitem leitura, inserção e atualização apenas ao proprietário; não há permissão de exclusão.

## Transferências

`public.transfers` é o registro canônico da operação. `public.transfer_entries` materializa exatamente duas movimentações vinculadas por `transfer_id` e direção única: `outflow` na origem e `inflow` no destino.

O cliente não recebe permissão de escrita direta nessas tabelas. As funções `create_transfer`, `update_transfer` e `set_transfer_active` validam propriedade, contas distintas, mesma moeda e executam a alteração dos dois lados na mesma transação do PostgreSQL.

## Saldos

`public.account_balances` é uma view com `security_invoker`. Ela deriva `current_balance_minor` do saldo inicial, dos lançamentos e das movimentações de transferência que estejam ativos e realizados. O saldo atual não é duplicado em uma coluna mutável.

## Cartões, compras, parcelas e faturas

`public.credit_cards` guarda configuração, limite e conta de pagamento opcional. `public.credit_card_purchases` registra o consumo categorizado. `public.credit_card_installments` materializa a divisão exata da compra e vincula cada parcela a uma `public.credit_card_invoices`.

O cliente só escreve diretamente na configuração do cartão. Compras e faturas são mutadas por RPCs atômicas. A fatura tem competência única por cartão, datas de fechamento e vencimento, total consolidado e referências ao pagamento. A view `public.credit_card_summaries` deriva limites utilizado e disponível sem manter acumuladores editáveis.

`public.transactions.origin_type` distingue lançamentos manuais da saída técnica de pagamento de fatura. Pagamentos possuem `category_id` nulo, vínculo obrigatório com a fatura e não podem ser alterados pelas políticas de atualização manual.

## Recorrências

`public.recurring_transactions` é o modelo de uma receita ou despesa periódica. Mantém proprietário, conta, categoria, natureza, valor inteiro, frequência, datas inicial/final, próxima ocorrência, atividade e encerramento definitivo.

`public.transactions.recurring_transaction_id` vincula cada previsão à recorrência de origem. Lançamentos gerados usam `origin_type = 'system'`, `status = 'pending'`, categoria obrigatória e o mesmo UUID em `origin_id`. O índice parcial único em `(recurring_transaction_id, transaction_date)` é a barreira de idempotência.

`generate_recurring_transactions(target_until)` processa somente recorrências ativas do usuário retornado por `auth.uid()`. A função bloqueia cada modelo com `FOR UPDATE SKIP LOCKED`, insere com `ON CONFLICT DO NOTHING`, avança `next_occurrence` e encerra calendários que ultrapassaram a data final, tudo na mesma transação PostgreSQL.

`set_recurring_transaction_state` concentra as transições ativa, suspensa e encerrada. As RPCs são `security definer`, usam `search_path` vazio, validam o usuário chamador e possuem execução concedida somente a `authenticated`. A tabela mantém RLS por `user_id`, não expõe `DELETE` e restringe escrita a colunas do modelo.

## Integridade

- moedas aceitas: BRL, USD e EUR;
- saldo inicial limitado ao intervalo de inteiros seguros do TypeScript;
- `opening_balance_date` é obrigatória;
- nomes de categorias são únicos por usuário, natureza e contexto;
- valores de lançamentos e transferências são positivos e limitados ao intervalo inteiro seguro do TypeScript;
- valores de cartão usam `numeric(16,0)`, sem escala decimal, no mesmo intervalo seguro;
- valores de recorrências usam `bigint` positivo no mesmo intervalo inteiro seguro;
- uma recorrência possui no máximo uma ocorrência por data, garantida por índice parcial único;
- parcelas somam exatamente o total da compra e nenhuma parcela pode ser zero;
- cada transferência possui no máximo uma entrada e uma saída, garantidas por restrição única;
- triggers mantêm `updated_at`;
- chaves estrangeiras para o usuário usam exclusão em cascata, executada apenas quando o usuário é removido pelo fluxo administrativo de identidade.
