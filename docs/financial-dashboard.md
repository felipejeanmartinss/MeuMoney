# Dashboard financeiro

## Escopo mensal

O dashboard recebe `month=AAAA-MM` e mostra o mês selecionado. O saldo das contas, as próximas recorrências e as faturas pendentes são posições atuais; receitas, despesas, resultado, orçamento e categorias respeitam o mês informado.

## Definições

- **Saldo atual:** saldo inicial mais lançamentos e transferências ativos e realizados, apresentado por conta.
- **Receitas:** lançamentos de receita ativos e realizados.
- **Despesas de consumo:** despesas manuais categorizadas, ativas e realizadas, somadas às parcelas de cartão pela competência.
- **Resultado:** receitas menos despesas de consumo.
- **Orçamento consumido:** despesas de consumo divididas pelo planejamento total da moeda no mês.
- **Distribuição por categoria:** mesma base de despesas de consumo, agrupada por categoria.

Transferências e pagamentos técnicos de fatura são excluídos dos indicadores de consumo. Faturas são compromissos de liquidação e não uma segunda ocorrência da compra.

## Segurança e desempenho

As views são `security_invoker`, portanto as políticas RLS das tabelas subjacentes permanecem ativas. O serviço também aplica `user_id` explícito. Não existe consulta do histórico completo: a evolução é limitada a seis meses, as categorias ao mês escolhido e os próximos itens a cinco por moeda.

## Aplicação da migration

Aplicar cumulativamente:

`supabase/migrations/20260726050129_financial_dashboard.sql`

Depois da aplicação, faça um novo deploy do ambiente que usa o mesmo projeto Supabase.
