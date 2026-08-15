# Dashboard financeiro

## Escopo mensal e regime

O dashboard recebe `month=AAAA-MM` e `basis=competence|cash`. Competência é o padrão. O saldo das contas, as próximas recorrências e as faturas pendentes são posições atuais; receitas, despesas, resultado, orçamento e categorias respeitam o mês e o regime informados.

## Definições

- **Saldo atual:** saldo inicial mais lançamentos e transferências ativos e realizados, apresentado por conta.
- **Receitas:** lançamentos de receita ativos e realizados.
- **Despesas por competência:** despesas manuais categorizadas, ativas e realizadas, somadas às parcelas de cartão na competência da parcela. O pagamento da fatura é excluído.
- **Saídas por caixa:** despesas ativas e realizadas na data de pagamento. Compras do cartão não são repetidas; entra somente a transferência efetiva da conta para a fatura.
- **Resultado:** receitas menos despesas de consumo.
- **Orçamento consumido:** despesas de consumo divididas pelo planejamento total da moeda no mês.
- **Distribuição por categoria:** mesma base de despesas de consumo, agrupada por categoria.

Transferências entre contas próprias são excluídas dos dois regimes. O pagamento técnico da fatura é excluído da competência e incluído no caixa como `Pagamento de cartões`. O orçamento continua sendo comparado apenas à competência.

## Segurança e desempenho

As views são `security_invoker`, portanto as políticas RLS das tabelas subjacentes permanecem ativas. O serviço também aplica `user_id` explícito. Não existe consulta do histórico completo: a evolução é limitada a seis meses, as categorias ao mês escolhido e os próximos itens a cinco por moeda.

## Aplicação da migration

Aplicar cumulativamente:

`supabase/migrations/20260726050129_financial_dashboard.sql`

`supabase/migrations/20260815135005_card_cash_financing_imports.sql`

Depois da aplicação, faça um novo deploy do ambiente que usa o mesmo projeto Supabase.
