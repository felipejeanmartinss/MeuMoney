# Orçamento mensal

## Escopo

A tela `/budgets` planeja receitas e despesas por mês, categoria, contexto e
moeda. A visão mensal apresenta planejado, realizado, diferença e percentual;
a visão anual abre os doze meses em uma grade compacta sobre os mesmos registros.

## Competência do realizado

- despesas em conta entram quando estão ativas, concluídas e categorizadas;
- transferências não são despesas e não entram;
- o pagamento de fatura é uma liquidação técnica e não entra;
- cada parcela de cartão entra em seu próprio `competence_date`;
- compras ou parcelas canceladas não entram;
- receitas e previsões pendentes não entram.

Receitas realizadas entram somente quando são categorizadas, ativas e
concluídas. A diferença de receita é `realizado - planejado`; a diferença de
despesa é `planejado - realizado`.

Essa separação evita contar primeiro a compra e novamente o pagamento da fatura.

## Contexto e moeda

O contexto é o contexto atual da categoria de despesa. A moeda vem da conta para
lançamentos comuns e do cartão para parcelas. A aplicação nunca soma moedas
diferentes no mesmo painel.

## Cópia do mês anterior

A RPC `copy_previous_month_budgets` copia valores da competência anterior para
categorias ativas do mesmo contexto e moeda. Linhas já existentes no destino são
preservadas por `ON CONFLICT DO NOTHING`, então repetir a ação é seguro.

## Segurança

`monthly_budgets` possui RLS por `user_id` e não concede exclusão ao cliente. As
views `monthly_consumption`, `monthly_budget_actuals` e
`monthly_budget_progress` usam `security_invoker`, mantendo as políticas das
tabelas de origem. A RPC valida `auth.uid()` antes de copiar dados.
