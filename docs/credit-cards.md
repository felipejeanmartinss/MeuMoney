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

Uma compra não movimenta o saldo bancário. O pagamento integral exige fatura fechada, conta ativa do mesmo usuário e moeda idêntica. A RPC cria uma saída técnica realizada na conta bancária e um registro canônico em `credit_card_payments`, que representa a transferência de caixa para o cartão. Na mesma transação, as parcelas e a fatura são marcadas como pagas.

A transação usa `origin_type = credit_card_invoice_payment`, categoria nula e vínculo obrigatório com a fatura. Ela aparece em Movimentações como item técnico, mas não pode ser editada ou inativada diretamente. O estorno deve ser feito pela fatura; ele inativa a transação técnica e restaura os estados anteriores na mesma transação.

O consumo é exibido e categorizado na compra. No regime de competência, a saída técnica é excluída e as parcelas são reconhecidas em seus meses. No regime de caixa, as parcelas são excluídas e a transferência para o cartão é reconhecida na data do pagamento. Os dois regimes nunca são somados entre si.

## Limite

O limite utilizado é derivado de todas as parcelas de compras ativas nos estados `pending` e `invoiced`, inclusive competências futuras. O limite disponível é `limite total - utilizado`; ele pode ficar negativo, pois a Sprint 4 informa excesso de limite sem bloquear retroativamente o registro.

## Segurança e atomicidade

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
