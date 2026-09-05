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

O lançamento por conta oferece o modo Investimento. Aplicações geram saída na
conta e aporte na posição; liquidações geram entrada e resgate; JCP, dividendos,
bonificações em dinheiro e outros rendimentos geram entrada e renda detalhada.
Os dois registros são criados atomicamente e exibem o vínculo no histórico.
Conta e posição precisam ter o mesmo proprietário, moeda e contexto.
No primeiro aporte, o mesmo fluxo pode criar a posição; o valor aplicado se
torna custo e valor da fotografia inicial, sem valorização presumida.

O cadastro direto de posição continua disponível para patrimônio anterior ao
histórico transacional. Nessa situação, o usuário pode marcar o histórico como
incompleto e nenhuma rentabilidade total é inferida.

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

## Financiamentos estruturados

Financiamentos e empréstimos permanecem passivos patrimoniais. A importação de
um extrato pesquisável cria um único `net_worth_item` e o vincula a um contrato
estruturado, evitando que o mesmo saldo devedor seja contado duas vezes.

O fluxo é leitura em memória, prévia, confirmação explícita e gravação atômica.
Parcelas preservam principal, juros, seguros, tarifas, encargos, saldo devedor,
situação e páginas de origem. Amortizações extraordinárias distinguem recursos
próprios, FGTS e redução de prazo ou prestação. O PDF original não é salvo.

O primeiro adaptador cobre exclusivamente o layout Bradesco versionado e
testado com fixture anônima. Outros bancos entram por novos adaptadores somente
depois de fixtures representativas; PDF digitalizado, protegido e OCR ficam
fora deste incremento.
