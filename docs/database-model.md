# Modelo de dados

## Segurança e backup — Sprint 12

`critical_operation_events` é um histórico imutável para o cliente. RLS permite
somente leitura do proprietário; escrita ocorre por funções ou triggers
restritos. O registro contém apenas evento, resultado, recurso e horário.

`import_jobs.expires_at` limita staging em revisão a sete dias.
`apply_import_retention` cancela jobs vencidos, remove staging e elimina
metadados terminais após noventa dias.

`export_personal_backup` produz JSON versionado de todas as tabelas do
proprietário. `restore_personal_backup` valida, substitui o proprietário,
restaura relações em ordem e rejeita referências entre tenants. Qualquer erro
reverte toda a operação.

## Perfis

`public.profiles` contém `id`, `full_name`, `preferred_currency`, `created_at` e `updated_at`. `id` referencia `auth.users(id)` com exclusão em cascata.

A função `handle_new_user` é `security definer`, usa `search_path` vazio, cria o perfil a partir de `raw_user_meta_data.full_name` e semeia as categorias padrão na mesma transação. Clientes autenticados recebem apenas `SELECT` e `UPDATE (full_name, preferred_currency)`; políticas RLS restringem ambas as operações a `auth.uid() = id`. Não há permissão de inserção ou exclusão pelo cliente.

## Contas

`public.accounts` contém proprietário, nome, tipo, contexto, moeda, `opening_balance_minor`, `opening_balance_date`, estado de arquivamento e timestamps. O saldo inicial usa `bigint`, nunca ponto flutuante. RLS separa leitura, inserção e atualização por `auth.uid() = user_id`; não existe política de exclusão.

## Categorias

- `delete_category_with_replacement(category_id, replacement_id)` centraliza a exclusão física e a realocação atômica de referências. A função valida `auth.uid()`, propriedade, natureza, contexto e atividade da substituta, sem conceder `DELETE` direto ao cliente.
- A realocação cobre `transactions`, `recurring_transactions`, `credit_card_purchases`, `monthly_budgets` e `import_staging_rows`. Orçamentos coincidentes são somados por mês e moeda antes da remoção.

## Exclusão de contas inativas

- `delete_archived_account(account_id)` aceita somente contas do usuário autenticado com `archived_at` preenchido.
- A função remove dados pertencentes ao extrato da conta e desvincula referências que precisam permanecer, como cartões e faturas já registradas. O cliente não recebe privilégio de `DELETE` nas tabelas.

`public.categories` contém proprietário, nome, natureza, contexto, indicador de origem na taxonomia inicial, arquivamento e timestamps. `parent_id` referencia uma categoria principal do mesmo usuário, natureza e contexto. Um trigger limita a árvore a um nível, impede ciclos e rejeita pai inativo. A unicidade considera a categoria principal, permitindo o mesmo nome sob pais diferentes. A função `seed_default_categories` cria as sugestões iniciais de cada usuário e também atende usuários existentes durante a migration.

RLS permite leitura e atualização das categorias pelo proprietário. O campo `is_system` é mantido somente como informação de origem e não bloqueia alterações. Os privilégios por coluna impedem o cliente de alterar esse indicador, e não existe política de exclusão.

## Lançamentos

`public.transactions` representa somente receitas e despesas. O valor usa `bigint` positivo; `transaction_type` define seu efeito no saldo. `status` diferencia `pending` de `completed`, e `is_active` preserva o histórico sem exclusão física. `reconciled_at` registra a conferência do item realizado e ativo contra um extrato externo.

Um trigger valida que conta, categoria e usuário são compatíveis e que a natureza da categoria coincide com o tipo do lançamento. RLS e privilégios por coluna permitem leitura, inserção e atualização apenas ao proprietário; não há permissão de exclusão.

## Transferências

`public.transfers` é o registro canônico da operação. `public.transfer_entries` materializa exatamente duas movimentações vinculadas por `transfer_id` e direção única: `outflow` na origem e `inflow` no destino. Cada entrada possui `reconciled_at` próprio para que a conciliação da origem seja independente da conta de destino.

O cliente não recebe permissão de escrita direta nessas tabelas. As funções `create_transfer`, `update_transfer` e `set_transfer_active` validam propriedade, contas distintas, mesma moeda e executam a alteração dos dois lados na mesma transação do PostgreSQL.

`set_account_entry_reconciled` é uma fachada pública `security invoker` para uma implementação privilegiada no schema `private`. Ela exige `auth.uid()`, atualiza apenas lançamento ou entrada de transferência do proprietário e aceita somente itens ativos e realizados. Triggers removem a conciliação quando um campo com efeito financeiro muda.

## Saldos

`public.account_balances` é uma view com `security_invoker`. Ela deriva `current_balance_minor` do saldo inicial, dos lançamentos e das movimentações de transferência que estejam ativos e realizados. O saldo atual não é duplicado em uma coluna mutável.

A central da conta lê lançamentos e entradas de transferência em páginas internas do servidor, combina os registros e calcula o saldo cronológico com uma função pura. Apenas a página solicitada é enviada ao navegador, preservando uma visão completa por conta sem carregar o histórico bruto no cliente.

## Cartões, compras, parcelas e faturas

`public.credit_cards` guarda configuração, limite e conta de pagamento opcional. `public.credit_card_purchases` registra o consumo categorizado. `public.credit_card_installments` materializa a divisão exata da compra e vincula cada parcela a uma `public.credit_card_invoices`.

O cliente só escreve diretamente na configuração do cartão. Compras e faturas são mutadas por RPCs atômicas. A fatura tem competência única por cartão, datas de fechamento e vencimento, total consolidado e referências ao pagamento. A view `public.credit_card_summaries` deriva limites utilizado e disponível sem manter acumuladores editáveis.

`public.transactions.origin_type` distingue lançamentos manuais da saída técnica de pagamento de fatura. Pagamentos possuem `category_id` nulo, vínculo obrigatório com a fatura e não podem ser alterados pelas políticas de atualização manual.

## Recorrências

`public.recurring_transactions` é o modelo de uma receita ou despesa periódica. Mantém proprietário, conta, categoria, natureza, valor inteiro, frequência, datas inicial/final, próxima ocorrência, atividade e encerramento definitivo.

`public.transactions.recurring_transaction_id` vincula cada previsão à recorrência de origem. Lançamentos gerados usam `origin_type = 'system'`, `status = 'pending'`, categoria obrigatória e o mesmo UUID em `origin_id`. O índice parcial único em `(recurring_transaction_id, transaction_date)` é a barreira de idempotência.

`generate_recurring_transactions(target_until)` processa somente recorrências ativas do usuário retornado por `auth.uid()`. A função bloqueia cada modelo com `FOR UPDATE SKIP LOCKED`, insere com `ON CONFLICT DO NOTHING`, avança `next_occurrence` e encerra calendários que ultrapassaram a data final, tudo na mesma transação PostgreSQL.

`set_recurring_transaction_state` concentra as transições ativa, suspensa e encerrada. A fachada pública usa `security invoker`; a implementação interna usa `security definer`, `search_path` vazio, valida o usuário chamador e só pode ser alcançada pelo papel autenticado. A tabela mantém RLS por `user_id`, não expõe `DELETE` e restringe escrita a colunas do modelo.

## Orçamentos mensais

`public.monthly_budgets` armazena o valor planejado por proprietário, categoria de Despesa, mês e moeda. `planned_amount_minor` usa `bigint` no intervalo inteiro seguro do TypeScript. O contexto é obtido da categoria, que já é a dimensão canônica Pessoal/Profissional, evitando duas fontes divergentes para a mesma classificação.

RLS restringe leitura, inserção e atualização a `auth.uid() = user_id`. Um trigger confirma que a categoria está ativa, pertence ao usuário e possui natureza Despesa. O cliente recebe privilégios apenas de leitura, inserção das colunas do planejamento e atualização do valor; não recebe `DELETE`.

`public.monthly_consumption` é uma view `security_invoker` que agrega duas fontes:

- despesas categorizadas, ativas e concluídas em `transactions`, usando a moeda da conta e excluindo a origem técnica de pagamento de fatura;
- parcelas em `credit_card_installments`, usando a moeda do cartão e `competence_date`, desde que compra e parcela não estejam canceladas.

Transferências ficam fora naturalmente por usarem tabelas próprias. `public.monthly_budget_progress`, também `security_invoker`, combina orçamento e consumo com `FULL OUTER JOIN`, mantendo visível uma categoria com gasto realizado mesmo sem planejamento. Ela deriva planejado, realizado, disponível e percentual consumido sem persistir acumuladores mutáveis.

`copy_previous_month_budgets` copia somente categorias ativas do contexto e moeda solicitados. A RPC valida `auth.uid()`, usa `search_path` vazio e `ON CONFLICT DO NOTHING`, tornando retries seguros e preservando valores já cadastrados no destino.

## Visões do dashboard financeiro

As quatro views da Sprint 7 são somente leitura e usam `security_invoker`, preservando as políticas RLS das tabelas de origem:

- `public.financial_dashboard_monthly_summary`: agrega receitas, despesas de consumo, resultado, planejamento e percentual consumido por usuário, mês e moeda;
- `public.financial_dashboard_expense_categories`: expõe o consumo do mês por categoria, contexto e moeda;
- `public.financial_dashboard_upcoming_recurrences`: combina recorrências ativas com conta, categoria e moeda;
- `public.financial_dashboard_invoices`: expõe faturas não pagas e deriva o status efetivo Vencida conforme `due_date`.

O resumo mensal reutiliza `monthly_consumption`, portanto herda a exclusão de transferências e pagamentos técnicos e o reconhecimento das parcelas pela competência. Índices parciais cobrem receitas realizadas ativas e faturas não pagas. As permissões das views são revogadas de `anon` e concedidas explicitamente a `authenticated`.

## Patrimônio líquido

`public.net_worth_items` armazena ativos e passivos manuais fora do domínio transacional. `kind` separa Ativo e Passivo; `item_type` detalha imóvel, veículo, outro bem, financiamento, empréstimo ou outra dívida. Uma restrição impede combinações incompatíveis. Moeda, valor atual inteiro, data da avaliação, contexto, observações e estado de arquivamento completam a posição atual.

`public.net_worth_valuations` guarda cada ponto histórico com proprietário, item, moeda, valor inteiro e data. A chave estrangeira composta `(item_id, user_id)` impede associar uma avaliação a item de outro usuário. A combinação item/data é única. O cliente recebe somente `SELECT`; triggers `security definer`, sem `search_path` implícito e sem permissão pública de execução, registram a avaliação inicial e mudanças posteriores atomicamente.

`public.net_worth_summary` é uma view `security_invoker` que considera somente itens ativos e agrega ativos, passivos e sua diferença por usuário e moeda. Índices compostos atendem a RLS, listagem, histórico e resumo. Não há chave estrangeira ou trigger conectando essas tabelas a `accounts`, `transactions` ou estruturas de cartão.

RLS permite ao proprietário ler, inserir e atualizar seus itens, mas não excluir. Avaliações só podem ser lidas pelo proprietário. Privilégios por coluna mantêm `user_id`, `kind` e `currency` imutáveis depois do cadastro e exigem que arquivamento atualize estado e timestamp de forma consistente.

## Investimentos

`public.investment_positions` guarda a posição manual atual. Quantidade usa
`numeric(30,12)`; custo acumulado e valor atual usam `bigint` no intervalo
inteiro seguro. Moeda é imutável e o arquivamento combina `is_active` com
`archived_at`.

`public.investment_position_snapshots` guarda fotografias automáticas da posição
por data. A chave estrangeira composta `(position_id, user_id)` preserva o
proprietário e a combinação posição/data é única. Clientes possuem somente
`SELECT`; triggers internos fazem o `UPSERT` atômico.

`public.investment_cash_flows` registra aportes, resgates e rendas com valor
positivo, quantidade opcional e data. A chave estrangeira composta impede
histórico entre usuários. A interface acrescenta eventos, sem `UPDATE` ou
`DELETE`.

`public.investment_position_summary` agrega os três tipos de fluxo e deriva a
diferença não realizada entre valor atual e custo acumulado. O resultado total
fica `NULL` quando `history_is_complete` é falso. `public.net_worth_summary`
passa a combinar ativos manuais, investimentos ativos e passivos manuais em
colunas distintas, por moeda.

Todas as tabelas possuem RLS por `user_id`, índices iniciados pelo proprietário
e privilégios mínimos. As views usam `security_invoker`.

## Importações de arquivo

`public.import_jobs` guarda proprietário, conta associada, nome saneado, formato,
impressão SHA-256 do arquivo, configuração do CSV, estado, contadores e
timestamps de descarte, confirmação ou cancelamento. Não contém os bytes do
arquivo. Para PDF, `source_adapter_id` e `source_document_type` identificam o
adaptador versionado que produziu o staging. O formato também aceita `qif`.

`public.import_staging_rows` guarda somente a representação temporária
normalizada e os campos originais mínimos necessários para correção. Em PDFs,
`source_description_original`, `source_pages` e `confidence` preservam a
proveniência da extração. Valor com sinal define receita ou despesa;
`amount_minor` permanece positivo. Status separa linhas pendentes, válidas,
duplicadas, ignoradas e com erro.

Para QIF, `record_kind` distingue lançamento e transferência;
`source_category_name` preserva a categoria sugerida e
`transfer_account_name`/`transfer_account_id` registram a associação explícita
da conta entre colchetes. `duplicate_transfer_id` aponta uma transferência já
existente quando aplicável.

`public.imported_transaction_signatures` vincula uma assinatura estável ao
lançamento ou transferência criada. A chave única `(user_id, signature)`
impede que dois jobs confirmados gravem a mesma movimentação. Lançamentos usam
usuário, conta, data, valor com sinal e descrição normalizada; transferências
usam usuário, as duas contas ordenadas, data e valor absoluto.

As três tabelas possuem RLS de leitura por proprietário e não aceitam escrita
direta do cliente. As fachadas públicas `security invoker` delegam a funções
internas transacionais. Confirmação e cancelamento apagam o staging; a
confirmação também cria todos os lançamentos e assinaturas de forma atômica.

## Integridade

- moedas aceitas: BRL, USD e EUR;
- saldo inicial limitado ao intervalo de inteiros seguros do TypeScript;
- `opening_balance_date` é obrigatória;
- nomes de categorias são únicos por usuário, grupo, categoria principal e nome normalizado;
- valores de lançamentos e transferências são positivos e limitados ao intervalo inteiro seguro do TypeScript;
- valores de cartão usam `numeric(16,0)`, sem escala decimal, no mesmo intervalo seguro;
- valores de recorrências usam `bigint` positivo no mesmo intervalo inteiro seguro;
- valores de orçamento usam `bigint` não negativo no mesmo intervalo inteiro seguro;
- valores patrimoniais e avaliações usam `bigint` não negativo no mesmo intervalo inteiro seguro;
- quantidades de investimento usam `numeric(30,12)` não negativo e valores de posição usam `bigint` não negativo;
- fluxos de investimento usam valor inteiro positivo e quantidade decimal positiva opcional;
- valores importados são convertidos para inteiro com sinal no staging e inteiro positivo no lançamento final;
- a combinação usuário e assinatura importada é única;
- cada linha de origem é única dentro de um job;
- páginas de origem de PDF são inteiros positivos e confiança fica entre zero e um;
- uma posição possui no máximo uma fotografia por data;
- natureza e tipo patrimonial devem ser compatíveis, e moeda e natureza são imutáveis após o cadastro;
- um item possui no máximo uma avaliação por data;
- a combinação usuário, mês, moeda e categoria de um orçamento é única;
- uma recorrência possui no máximo uma ocorrência por data, garantida por índice parcial único;
- parcelas somam exatamente o total da compra e nenhuma parcela pode ser zero;
- cada transferência possui no máximo uma entrada e uma saída, garantidas por restrição única;
- triggers mantêm `updated_at`;
- chaves estrangeiras para o usuário usam exclusão em cascata, executada apenas quando o usuário é removido pelo fluxo administrativo de identidade.

## Incremento visual consolidado

O incremento visual não adiciona tabelas nem altera contratos persistidos. As
centrais de navegação, contas, investimentos, perfil e patrimônio reutilizam
as tabelas, views e RPCs existentes. A consolidação patrimonial executiva lê
separadamente `account_balances`, `net_worth_summary` e
`financial_dashboard_invoices`; não grava um novo total e não cria risco de
divergência entre valores derivados.

O simulador de poupança é não persistente. Nenhuma migration é necessária para
essa funcionalidade.

## Grupos de categorias e tipos de investimento

`public.category_groups` organiza categorias do mesmo usuário, natureza e
contexto. `categories.group_id` usa chave estrangeira composta com `user_id`,
impedindo associação entre proprietários. `parent_id` continua limitado a um
nível e agora também exige o mesmo grupo. Grupos com categorias ativas não
podem ser arquivados, e sua classificação não muda enquanto estiver em uso.
`delete_category_group_with_replacement(group_id, replacement_id)` expõe um
wrapper `security invoker` para uma função privada que valida `auth.uid()`,
bloqueia os grupos envolvidos e move a hierarquia completa antes da exclusão.
O destino deve estar ativo e manter natureza e contexto; conflitos entre nomes
de categorias principais são rejeitados, sem fusão implícita.

`investment_positions.investment_type` detalha o produto dentro de
`investment_class`. Uma restrição no banco impede, por exemplo, classificar
uma ação como renda fixa. A view `investment_position_summary` expõe o novo
campo sem alterar os cálculos de custo, valor ou resultado.

As duas estruturas possuem RLS por proprietário, privilégios explícitos por
coluna e índices que começam pelas colunas usadas nas chaves estrangeiras ou
filtros de proprietário. A migration é cumulativa e migra todas as categorias
e posições existentes para valores compatíveis.
