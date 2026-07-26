# Regras de negócio

## Identidade — Sprint 1

- Senhas existem somente no Supabase Auth e nunca são persistidas ou registradas pela aplicação.
- Cada usuário possui exatamente um perfil com o mesmo UUID de `auth.users`.
- O perfil nasce na mesma transação do cadastro por trigger do banco.
- Um usuário autenticado pode ler e editar somente o próprio perfil.
- Recuperação de senha sempre responde de forma neutra, sem confirmar a existência de uma conta.
- Redirecionamentos de autenticação são restritos a caminhos internos.
- A troca de senha encerra todas as sessões e exige novo login.

## Fundação financeira — Sprint 2

- Cada conta e categoria pertence a exatamente um usuário e só pode ser acessada por ele.
- Contas são classificadas como Pessoal ou Profissional.
- Nesta sprint, novas contas podem ser dos tipos conta corrente, poupança, dinheiro ou outra conta. Cartões e investimentos permanecem fora do fluxo de cadastro.
- O saldo inicial é obrigatório, pode ser positivo, zero ou negativo e possui data de referência obrigatória.
- Dinheiro é persistido como inteiro em unidades menores; valores de ponto flutuante não são aceitos no domínio.
- As moedas suportadas inicialmente são BRL, USD e EUR. A moeda preferencial do perfil apenas sugere o valor inicial de novas contas; ela não converte contas existentes.
- Contas não são excluídas pela interface: podem ser inativadas e reativadas.
- Categorias separam natureza (Receita ou Despesa) e contexto (Pessoal ou Profissional).
- Categorias iniciais são criadas automaticamente para cada usuário e partem de uma taxonomia inspirada na orientação AUVP adaptada aos contextos do MeuMoney.
- A taxonomia inicial é somente uma sugestão: todas as categorias pertencem ao usuário e podem ser editadas, inativadas e reativadas pelo proprietário.
- A combinação nome, natureza e contexto é única por usuário.
- O saldo inicial permanece como ponto de partida imutável do cálculo histórico, embora possa ser corrigido pelo usuário na edição da conta.

## Movimentações financeiras — Sprint 3

- Lançamentos são exclusivamente receitas ou despesas. O valor é sempre positivo em unidades menores; o tipo define o sinal no saldo.
- Categorias de Receita só podem classificar receitas, e categorias de Despesa só podem classificar despesas. A integridade é validada no banco.
- Somente lançamentos ativos e realizados participam do saldo atual. Lançamentos previstos e inativos permanecem no histórico sem efeito financeiro.
- Editar conta, tipo, valor, status ou atividade não exige ajustar um saldo persistido: o saldo é recalculado a partir dos registros vigentes.
- Transferência não é receita nem despesa e não recebe categoria.
- Origem e destino devem ser contas ativas distintas do mesmo usuário e, nesta sprint, da mesma moeda.
- Cada transferência possui um registro canônico e exatamente duas movimentações vinculadas: saída na origem e entrada no destino.
- Criar, editar, inativar ou reativar uma transferência altera os dois lados na mesma transação SQL. Uma falha reverte toda a operação.
- Transferências previstas ou inativas não afetam o saldo realizado.
- Lançamentos e transferências não são excluídos fisicamente pela interface.
- O saldo atual é o saldo inicial, mais receitas realizadas ativas, menos despesas realizadas ativas, mais transferências recebidas realizadas ativas e menos transferências enviadas realizadas ativas.

## Cartões de crédito — Sprint 4

- Compra de cartão é despesa de consumo e exige categoria de Despesa ativa do mesmo usuário.
- Compra não altera saldo de conta. A conta só recebe uma saída técnica quando a fatura integral é paga.
- Valores são positivos e exatos em unidades menores; parcelas nunca possuem valor zero. Eventual resto da divisão fica na última parcela.
- Compra realizada até o dia de fechamento pertence à competência atual; após esse dia, pertence à seguinte. Dias inexistentes em um mês são limitados ao último dia real.
- O limite utilizado soma todas as parcelas ativas pendentes ou faturadas, inclusive futuras. O limite disponível é o limite total menos esse valor e pode ficar negativo.
- Fechamento é idempotente. Uma fatura fechada ou paga impede mudanças estruturais nas compras que a compõem.
- Pagamento exige conta ativa, do mesmo usuário e na mesma moeda do cartão. A transação técnica é realizada, não possui categoria e não pode ser editada pela interface de movimentações.
- Estorno de pagamento inativa a transação técnica e devolve fatura e parcelas ao estado fechado/faturado na mesma transação SQL.
- Cartões e compras não são excluídos fisicamente pela interface.

## Recorrências — feature/recurring-transactions

- Recorrências representam exclusivamente receitas ou despesas e mantêm valor positivo em unidades menores inteiras.
- As frequências disponíveis são semanal, mensal e anual. O dia da data inicial é a âncora do calendário; em meses curtos, usa-se o último dia real e a âncora volta a ser aplicada nos meses seguintes.
- A data final é opcional e inclusiva. Depois da última ocorrência válida, a recorrência é encerrada automaticamente.
- Toda ocorrência gerada é um lançamento `pending` (Previsto). Nenhuma recorrência cria um lançamento Realizado automaticamente.
- A geração é idempotente. A combinação entre recorrência e data da ocorrência é única, e chamadas repetidas ou concorrentes não criam duplicidades.
- A próxima ocorrência indica a primeira data ainda não processada pelo gerador.
- Suspender impede novas gerações e permite reativação. Encerrar é definitivo e não permite reativação.
- Editar uma recorrência altera somente gerações futuras. Lançamentos previstos já gerados permanecem como registro histórico.
- Conta e categoria devem estar ativas e pertencer ao usuário autenticado; a natureza da categoria deve coincidir com a natureza da recorrência.
- Recorrências e ocorrências não são excluídas fisicamente pela interface.

## Regras financeiras futuras

Cashback, milhas, cartões adicionais, juros rotativos, parcelamento de fatura, antecipação, conversão monetária, orçamentos e investimentos serão definidos em sprints posteriores.
