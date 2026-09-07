# Cartões de crédito

## Escopo da Sprint 4

A entrega cobre cartões, compras, parcelamento, faturas, pagamento integral, estorno e limites derivados. Não cobre cashback, pontos, milhas, cartões adicionais, juros, parcelamento de fatura, antecipação, moeda estrangeira, notificações, orçamento ou investimentos.

## Modelo monetário

Formulários recebem valores decimais localizados e os convertem para unidades menores inteiras. O banco usa `numeric(16,0)`: não há ponto flutuante nem arredondamento binário. O total é dividido por quociente inteiro; qualquer resto é aplicado à última parcela. A quantidade de parcelas não pode exceder o total em centavos, evitando parcelas de valor zero.

## Competência e calendário

- compra no dia de fechamento ou antes: competência do mês da compra;
- compra após o fechamento: competência do mês seguinte;
- parcelas seguintes avançam uma competência por mês;
- fechamento ou vencimento em dia inexistente usa o último dia do mês;
- o vencimento é a primeira ocorrência configurada após o fechamento: pode
  ficar no mesmo mês quando o dia de vencimento for posterior ao fechamento
  ou no mês seguinte nos demais casos.

As funções puras TypeScript fornecem a prévia do formulário. As funções SQL repetem a regra na fronteira confiável e geram as parcelas efetivas.

## Estados

Compras são `active` ou `cancelled`. Parcelas são `pending`, `invoiced`, `paid` ou `cancelled`. Faturas são `open`, `closed`, `paid` ou `overdue`; a interface também apresenta uma fatura fechada vencida como `overdue` com base na data atual.

O fechamento atualiza parcelas pendentes para faturadas e é idempotente. Uma compra só pode ter estrutura ou atividade alterada enquanto todas as suas faturas estiverem abertas e nenhuma parcela tiver sido paga.

## Pagamento, transferência e saldo

Uma compra não movimenta o saldo bancário. O usuário pode transferir um valor positivo de uma conta ativa para qualquer cartão ativo próprio da mesma moeda, sem selecionar uma fatura. A operação reduz o saldo da conta e o saldo devedor atual do cartão de forma atômica.

O cartão aparece como destino em Novo lançamento e Nova transferência. O valor, a data e o estado seguem as mesmas regras das demais transferências; uma transferência prevista não afeta os saldos. O fluxo específico de pagamento integral continua no detalhe da fatura para marcar fatura e parcelas como pagas.

O pagamento integral usa `origin_type = credit_card_invoice_payment`, categoria nula e vínculo obrigatório com a fatura. Já o pagamento livre é uma transferência canônica com `destination_credit_card_id`, sem categoria nem vínculo de fatura, e pode ser editado ou inativado como as demais transferências.

O consumo é exibido e categorizado na compra. No regime de competência, pagamentos são excluídos e as parcelas são reconhecidas em seus meses. No regime de caixa, as parcelas são excluídas e as transferências realizadas para o cartão são reconhecidas na data do pagamento. Os dois regimes nunca são somados entre si.

## Limite

O saldo atual é derivado de todas as parcelas de compras ativas nos estados `pending` e `invoiced`, menos as transferências realizadas para o cartão. O limite utilizado é a parte positiva desse saldo, e o disponível é o limite menos o saldo assinado. Um pagamento superior ao saldo produz crédito visível no cartão.

## Segurança e atomicidade

Compras também podem ser importadas por CSV, OFX, QIF ou PDF usando o staging de
importações. Cada linha confirmada vira uma compra de uma parcela e reutiliza a
mesma função que gera a fatura e a parcela do cadastro manual. Categoria de
Despesa, propriedade do cartão, atividade, valor, data e duplicidade são
validados antes da confirmação atômica.

Todas as tabelas usam RLS por `auth.uid() = user_id`. O cliente autenticado recebe escrita direta apenas nos cartões próprios. Compra, regeneração de parcelas, cancelamento, fechamento, pagamento e estorno usam RPCs `security definer` com `search_path` vazio e validações explícitas de propriedade.

Para validar RLS em um Supabase local:

1. execute `npx.cmd supabase db reset`;
2. crie dois usuários de teste;
3. defina o JWT do usuário A e crie cartão e compra;
4. consulte e tente alterar os UUIDs com o JWT do usuário B;
5. confirme zero linhas visíveis e falha nas RPCs;
6. simule falha de validação no pagamento e confirme que fatura, parcelas e saldo não mudaram;
7. repita fechamento e confirme idempotência;
8. pague, estorne e confirme que existe somente uma movimentação técnica ativa por fatura.

Os testes unitários em `tests/credit-cards.test.ts` cobrem competência, meses curtos, ano bissexto, divisão exata e status vencido. O teste de RLS exige PostgreSQL/Supabase real e não é substituído por mocks.
