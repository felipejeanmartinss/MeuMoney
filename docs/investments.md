# Investimentos

## Escopo da Sprint 9

O módulo mantém posições atualizadas manualmente para renda fixa, ações,
fundos, ETFs, fundos imobiliários, previdência e criptomoedas. Cada posição
registra instituição, classe, ativo, moeda, quantidade, custo acumulado, valor
atual, data, contexto e observações.

Não existem cotações automáticas, integração bancária ou conversão cambial.

## Precisão

Dinheiro continua em unidades mínimas inteiras, limitado ao intervalo inteiro
seguro do TypeScript. Quantidades usam `numeric(30,12)` no PostgreSQL e são
transportadas como texto decimal no TypeScript. Isso evita arredondamentos de
ponto flutuante e atende ativos fracionários, inclusive criptomoedas.

## Históricos distintos

- `investment_position_snapshots` registra automaticamente quantidade, custo e
  valor em cada data de posição;
- `investment_cash_flows` registra aportes, resgates e rendas informados pelo
  usuário;
- um fluxo histórico não altera silenciosamente a posição atual. O usuário
  atualiza a posição separadamente quando quantidade, custo ou valor mudarem.

A diferença sobre o custo é `valor atual - custo acumulado`. Aportes, resgates e
rendas são somados separadamente. O resultado total
`valor atual + resgates + rendas - aportes` só é exibido quando o usuário
declara que o histórico contém todos os fluxos desde o início. Não é calculada
taxa de rentabilidade ou retorno anualizado.

## Patrimônio líquido

Investimentos não são inseridos em `net_worth_items`. A view
`net_worth_summary` soma o valor atual das posições ativas à parcela de ativos,
mantém os investimentos identificados em uma coluna própria e subtrai apenas os
passivos manuais. Todos os grupos permanecem separados por moeda.

## Segurança

As três tabelas usam RLS por `user_id`. Posições aceitam leitura, inserção e
atualização do proprietário, sem exclusão física. Fotografias são somente
leitura para o cliente e criadas por trigger. Fluxos históricos são
acrescentados de forma imutável pela interface. Chaves estrangeiras compostas
impedem ligar histórico a uma posição de outro usuário.
