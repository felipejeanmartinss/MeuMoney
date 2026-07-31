# Orçamento mensal

## Escopo

A Sprint 6 planeja despesas por mês, categoria, contexto e moeda. A tela
`/budgets` apresenta valores planejado, realizado, disponível e percentual
consumido, além do comparativo por categoria.

## Competência do realizado

- despesas em conta entram quando estão ativas, concluídas e categorizadas;
- transferências não são despesas e não entram;
- o pagamento de fatura é uma liquidação técnica e não entra;
- cada parcela de cartão entra em seu próprio `competence_date`;
- compras ou parcelas canceladas não entram;
- receitas e previsões pendentes não entram.

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
views de consumo e progresso usam `security_invoker`, mantendo as políticas das
tabelas de origem. A RPC valida `auth.uid()` antes de copiar dados.
