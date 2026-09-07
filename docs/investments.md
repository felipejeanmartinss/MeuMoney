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
- aportes aumentam valor, custo e quantidade da posição; resgates reduzem o
  valor e o custo proporcionalmente e reduzem a quantidade quando informada;
- rendas permanecem fora do principal e não alteram valor, custo ou quantidade.

Cada fluxo guarda os deltas exatos aplicados à posição. Ao excluí-lo, esses
deltas são revertidos na mesma transação. Um resgate integral zera valor, custo
e, quando a quantidade não foi informada, toda a quantidade remanescente.

Atualizações manuais da posição também podem ser excluídas. A fotografia
inicial é preservada; ao remover a atualização mais recente, quantidade, custo,
valor e data retornam atomicamente à fotografia anterior. A reversão é
bloqueada quando existem fluxos posteriores que dependem daquele estado.

O lançamento por conta oferece o modo Investimento. Aplicações geram saída na
conta e aporte na posição; liquidações geram entrada e resgate; JCP, dividendos,
bonificações em dinheiro e outros rendimentos geram entrada e renda detalhada.
Os dois registros são criados atomicamente e exibem o vínculo no histórico.
Conta e posição precisam ter o mesmo proprietário, moeda e contexto.
No primeiro aporte, o mesmo fluxo pode criar a posição; o valor aplicado se
torna custo e valor da fotografia inicial, sem valorização presumida.

O cadastro direto de posição continua disponível para patrimônio anterior ao
histórico transacional. Nessa situação, o usuário pode marcar o histórico como
incompleto; resultado e retorno total são estimados pela diferença entre valor
atual e custo acumulado, sem estimar retornos mensal ou anualizado.

Transferências já realizadas em contas do tipo Investimento aparecem em uma
fila de vínculo. Uma entrada pode originar uma aplicação de mesmo valor; uma
saída pode corresponder a liquidação, JCP, dividendos, bonificação ou outro
rendimento. O sistema mantém a transferência original e cria o movimento
oposto na conta de investimento: a entrada de recursos é consumida pelo aporte
e o resgate disponibiliza recursos antes da saída. Assim, o saldo representa o
caixa livre, enquanto a posição representa o principal investido. Cada perna da
transferência aceita um único vínculo e fica financeiramente imutável enquanto
esse vínculo existir.

A diferença sobre o custo é `valor atual - custo acumulado`. Aportes, resgates e
rendas são somados separadamente. Quando o usuário declara que o histórico
contém todos os fluxos desde o início, o resultado total é
`valor atual + resgates + rendas - aportes`; o lucro ou perda realizado compara
os resgates com o custo baixado da posição. O retorno total divide o resultado
pela base de aportes completa. O retorno anualizado usa os aportes, resgates,
rendas e valor final em suas datas e só aparece quando há histórico completo e
uma solução financeira válida. O retorno mensal é a taxa efetiva mensal
equivalente ao retorno anualizado, permitindo comparar investimentos em uma
referência comum. Com histórico parcial, a base do retorno total é o custo
acumulado e o resultado permanece identificado por um asterisco, explicado na
própria tela.

A carteira principal lista somente posições ativas. Arquivadas permanecem
acessíveis em uma visão separada e não compõem os totais. Cada grupo informa a
participação de sua família — renda fixa, renda variável, previdência ou
alternativos — e também de cada tipo de produto, como Tesouro Direto, ações ou
fundos, no valor da carteira da mesma moeda. O resumo lateral repete essa
composição para comparação rápida, e a listagem omite a data da última posição.

## Patrimônio líquido

Investimentos não são inseridos em `net_worth_items`. A view
`net_worth_summary` soma o valor atual das posições ativas à parcela de ativos,
mantém os investimentos identificados em uma coluna própria e subtrai apenas os
passivos manuais. Todos os grupos permanecem separados por moeda.

## Segurança

As três tabelas usam RLS por `user_id`. Posições e fluxos são excluídos por RPCs
transacionais com validação explícita do proprietário; a exclusão de uma
posição preserva transferências originais. Fotografias são somente leitura para
o cliente e criadas por trigger. Chaves estrangeiras compostas impedem ligar
histórico a uma posição de outro usuário.

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
