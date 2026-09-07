# Regras de negócio

## Segurança e ciclo de vida dos dados — Sprint 12

- Todo backup é versionado, pertence à sessão autenticada e inclui todas as
  tabelas funcionais sem incluir senha ou token.
- A restauração substitui os dados do usuário em uma única transação, força o
  proprietário atual e rejeita vínculos externos ou histórico inconsistente.
- A exclusão exige senha atual e confirmação explícita; não existe recuperação.
- Eventos críticos guardam apenas tipo, resultado, recurso e horário.
- Arquivos importados nunca são persistidos. Staging expira em sete dias e
  metadados terminais em noventa dias.
- Dados autenticados e respostas de API nunca entram no cache da PWA.
- Cada tabela do usuário mantém RLS, política de proprietário e privilégio mínimo.

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
- Contas ativas não podem ser excluídas. Depois de inativada, uma conta pode ser excluída definitivamente mediante confirmação explícita; a operação remove seu histórico transacional, transferências, recorrências e importações vinculadas, e apenas desvincula cartões que a utilizavam como conta de pagamento.
- Categorias separam natureza (Receita ou Despesa) e contexto (Pessoal ou Profissional).
- Categorias iniciais são criadas automaticamente para cada usuário e partem de uma taxonomia inspirada na orientação AUVP adaptada aos contextos do MeuMoney.
- A taxonomia inicial é somente uma sugestão: todas as categorias pertencem ao usuário e podem ser editadas, inativadas e reativadas pelo proprietário.
- Uma categoria pode ser principal ou subcategoria. A hierarquia possui um único nível; pai e filha pertencem ao mesmo usuário e mantêm a mesma natureza e contexto.
- O nome é único dentro da mesma categoria principal, natureza e contexto. Assim, duas categorias principais distintas podem possuir subcategorias homônimas.
- Uma categoria principal com subcategorias ativas só pode ser inativada depois delas, evitando opções órfãs nos formulários.
- Categorias e subcategorias podem ser excluídas definitivamente. Se a categoria ou alguma subcategoria removida tiver lançamentos, recorrências, compras de cartão, orçamentos ou linhas em revisão de importação, o usuário deve escolher uma categoria ativa da mesma natureza e contexto; a realocação e a exclusão ocorrem atomicamente.
- Ao excluir uma categoria principal, suas subcategorias diretas também são removidas. Sem vínculos financeiros, nenhuma substituta é exigida, permitindo ao usuário manter uma estrutura sem categorias.
- Categorias e subcategorias podem ser criadas durante a inclusão de um lançamento e durante a revisão de uma importação, usando os mesmos grupos, natureza, contexto e validações da administração de categorias.
- Grupos podem ser editados e excluídos definitivamente. Se um grupo possuir categorias ou subcategorias, o usuário deve escolher outro grupo ativo da mesma natureza e contexto; toda a hierarquia é movida atomicamente antes da exclusão.
- A exclusão de grupo é bloqueada quando categorias principais homônimas gerariam conflito no destino. Nenhuma categoria é mesclada ou renomeada silenciosamente.
- O saldo inicial permanece como ponto de partida imutável do cálculo histórico, embora possa ser corrigido pelo usuário na edição da conta.

## Movimentações financeiras — Sprint 3

- Lançamentos são exclusivamente receitas ou despesas. O valor é sempre positivo em unidades menores; o tipo define o sinal no saldo.
- Categorias de Receita só podem classificar receitas, e categorias de Despesa só podem classificar despesas. A integridade é validada no banco.
- Somente lançamentos ativos e realizados participam do saldo atual. Lançamentos previstos e inativos permanecem no histórico sem efeito financeiro.
- Editar conta, tipo, valor, status ou atividade não exige ajustar um saldo persistido: o saldo é recalculado a partir dos registros vigentes.
- Transferência não é receita nem despesa e não recebe categoria.
- A origem deve ser uma conta ativa. O destino pode ser outra conta ativa ou um cartão de crédito ativo do mesmo usuário e da mesma moeda.
- Uma transferência entre contas possui duas movimentações vinculadas: saída na origem e entrada no destino. Uma transferência para cartão possui somente a saída vinculada à conta; o destino é registrado no próprio cartão.
- Criar, editar, inativar ou reativar uma transferência altera seus registros vinculados na mesma transação SQL. Uma falha reverte toda a operação.
- Transferências previstas ou inativas não afetam o saldo realizado.
- Lançamentos manuais podem ser excluídos definitivamente pelo proprietário com uma confirmação simples na própria listagem. Movimentos de investimento são removidos pela operação própria, que também reverte a posição. Lançamentos técnicos de fatura e contas a pagar continuam protegidos; transferências sem vínculo de investimento podem ser excluídas definitivamente.
- Novos lançamentos, transferências e movimentos de investimento podem ser registrados dentro do extrato da conta, reutilizando os mesmos campos, validações e serviços das rotas dedicadas.
- O saldo atual é o saldo inicial, mais receitas realizadas ativas, menos despesas realizadas ativas, mais transferências recebidas realizadas ativas e menos transferências enviadas realizadas ativas, sempre com data anterior ao dia corrente no fuso de São Paulo.
- O saldo projetado parte do saldo atual e incorpora todos os lançamentos e transferências ativos com data de hoje ou futura, inclusive os previstos. Itens previstos vencidos continuam fora dos dois saldos até serem realizados ou remarcados.
- O extrato pertence à conta e combina receitas, despesas e o lado correspondente de cada transferência em ordem cronológica. O saldo linha a linha usa o realizado até ontem e passa a representar a projeção a partir de hoje; uma divisória visual separa os dois períodos.
- A conciliação confirma um item realizado e ativo contra o extrato externo. Cada lado de uma transferência possui estado próprio, porque contas diferentes podem ser conciliadas em momentos diferentes.
- `reconciled_at` registra quando ocorreu a última conciliação. Alterar conta, tipo, direção, moeda, valor, data, status ou atividade remove automaticamente essa confirmação e exige nova conferência.
- Itens previstos ou inativos permanecem visíveis no extrato, mas não podem ser marcados como reconciliados nem alterar o saldo realizado.

## Cartões de crédito — Sprint 4

- Compra de cartão é despesa de consumo e exige categoria de Despesa ativa do mesmo usuário.
- Compra não altera saldo de conta. Uma transferência realizada para o cartão reduz o saldo da conta de origem e o saldo devedor atual do cartão, sem exigir vínculo com uma fatura.
- Valores são positivos e exatos em unidades menores; parcelas nunca possuem valor zero. Eventual resto da divisão fica na última parcela.
- Compra realizada até o dia de fechamento pertence à competência atual; após esse dia, pertence à seguinte. Dias inexistentes em um mês são limitados ao último dia real.
- O saldo devedor atual soma parcelas ativas pendentes ou faturadas e deduz transferências realizadas para o cartão. O limite utilizado não fica negativo; eventual pagamento excedente permanece visível como crédito no saldo atual.
- Fechamento é idempotente. Uma fatura fechada ou paga impede mudanças estruturais nas compras que a compõem.
- A transferência para cartão exige conta ativa, mesmo usuário e mesma moeda. Ela não recebe categoria nem altera a competência das compras. O fluxo integral de uma fatura continua disponível quando for necessário marcar parcelas e fatura como pagas.
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
- Recorrências encerradas permanecem preservadas para auditoria, mas são removidas da agenda operacional e das listas por conta.
- Editar uma recorrência altera somente gerações futuras. Lançamentos previstos já gerados permanecem como registro histórico.
- Conta e categoria devem estar ativas e pertencer ao usuário autenticado; a natureza da categoria deve coincidir com a natureza da recorrência.
- Recorrências e ocorrências não são excluídas fisicamente pela interface.

## Orçamento mensal — Sprint 6

- Cada orçamento pertence a um usuário, mês de referência, categoria de Despesa e moeda. O contexto Pessoal ou Profissional é o contexto atual da categoria.
- Valores planejados são inteiros não negativos em unidades monetárias menores. Moedas diferentes nunca são somadas no mesmo comparativo.
- O realizado de lançamentos em conta considera somente despesas ativas e concluídas, com categoria, no mês da transação.
- Transferências não são despesas e ficam fora do orçamento. Pagamentos técnicos de fatura também são excluídos para que uma compra no cartão não seja contada duas vezes.
- O realizado de cartão é reconhecido pela competência de cada parcela. Parcelas de compras canceladas ou parcelas canceladas não participam do cálculo.
- Uma compra parcelada pode comprometer orçamentos de meses futuros; o pagamento da fatura não altera o realizado de consumo.
- Disponível é `planejado - realizado` e pode ser negativo. Percentual consumido é `realizado / planejado`; quando o planejado é zero, o percentual não é calculado.
- Consumo sem orçamento aparece no comparativo com planejado zero, deixando gastos não planejados visíveis.
- Copiar o mês anterior mantém contexto e moeda, ignora categorias inativas e não sobrescreve linhas que já existem no mês de destino. A operação é idempotente.
- O cliente não exclui orçamentos fisicamente. Um valor planejado igual a zero representa uma categoria sem verba no mês.

## Dashboard financeiro — competência e caixa

- Todo indicador consolidado é calculado por mês e moeda. Valores em BRL, USD e EUR nunca são somados entre si e não há conversão cambial implícita.
- Receita mensal considera apenas receitas ativas e realizadas na data do lançamento.
- Em competência, despesa mensal considera consumo ativo e realizado: despesas categorizadas em conta e parcelas de cartão reconhecidas na competência. O pagamento da fatura não é novo consumo.
- Em caixa, despesa mensal considera as saídas ativas e realizadas na data em que o dinheiro deixa a conta. A compra do cartão não entra novamente; entra qualquer transferência realizada para o cartão, com ou sem associação a uma fatura.
- Transferências entre contas próprias não compõem receita ou despesa em nenhum regime. A transferência para cartão é a exceção explícita do regime de caixa porque liquida uma obrigação externa já reconhecida em competência.
- Resultado mensal é `receitas realizadas - despesas de consumo`.
- Orçamento consumido compara todas as despesas por competência do mês com todo o valor planejado na mesma moeda. No regime de caixa ele não é calculado.
- Saldo por conta representa a posição atual, derivada do saldo inicial e de movimentações realizadas. Ele não é reconstruído para o encerramento do mês histórico selecionado.
- A evolução apresenta o mês selecionado e os cinco meses anteriores, preenchendo meses sem movimento com zero.
- Próximas recorrências exibem apenas modelos ativos, não encerrados e com próxima ocorrência a partir da data atual.
- Faturas abertas, fechadas ou vencidas permanecem visíveis até o pagamento. Uma fatura aberta ou fechada cuja data de vencimento passou recebe estado visual Vencida.
- O dashboard é somente leitura; suas consultas respeitam RLS e são limitadas no servidor antes da renderização.

## Patrimônio líquido — Sprint 8

- Ativos manuais podem ser imóveis, veículos ou outros bens. Passivos manuais podem ser financiamentos, empréstimos ou outras dívidas.
- Itens patrimoniais são independentes de contas, lançamentos, transferências, cartões e investimentos. Cadastrar ou avaliar um item não altera saldo nem fluxo de caixa.
- Cada item pertence a um único usuário e possui nome, natureza, tipo, contexto, moeda, valor atual, data de avaliação, observações e estado.
- Valores são inteiros não negativos em unidades monetárias menores e limitados ao intervalo inteiro seguro do TypeScript.
- Patrimônio líquido é `ativos ativos - passivos ativos`, calculado separadamente para BRL, USD e EUR. Não existe conversão cambial implícita.
- A avaliação inicial é registrada automaticamente. Alterar valor ou data registra uma nova avaliação na mesma transação; corrigir a mesma data atualiza esse ponto sem criar duplicidade.
- Uma nova avaliação deve usar data igual ou posterior à avaliação atual e não pode estar no futuro.
- A moeda e a natureza Ativo/Passivo não mudam depois do cadastro, preservando o significado do histórico. O subtipo pode mudar somente dentro da mesma natureza.
- Arquivar um item é uma operação lógica e o remove do resumo sem apagar seu cadastro ou histórico. Reativar volta a considerá-lo nos cálculos.
- O histórico é somente leitura para o cliente. A interface não oferece exclusão física de itens nem avaliações.
- Todos os acessos passam por serviços de servidor, filtros explícitos de proprietário e RLS no PostgreSQL.

## Investimentos — Sprint 9

- Classes aceitas: renda fixa, ação, fundo, ETF, fundo imobiliário, previdência e criptomoeda.
- Posições são atualizadas manualmente; cotações e integrações bancárias não fazem parte do módulo.
- Dinheiro usa unidades mínimas inteiras; quantidade usa decimal exato com até 12 casas e nunca é calculada com ponto flutuante.
- Moeda é imutável após o cadastro e posições arquivadas não compõem o patrimônio.
- Aportes, resgates e rendas são históricos independentes da fotografia atual.
- A diferença sobre o custo usa somente custo acumulado e valor atual informados.
- O resultado total só é calculado quando o usuário declara que todos os fluxos desde o início foram registrados.
- Nenhuma taxa de rentabilidade, anualização ou valorização é inventada quando o histórico não sustenta o cálculo.
- O patrimônio soma o valor atual das posições ativas como ativos, sempre por usuário e moeda.

## Importação CSV e OFX — Sprint 10

- Upload nunca cria lançamentos diretamente. O fluxo obrigatório é leitura, normalização, prévia, associação, correção e confirmação explícita.
- CSV usa autodetecção por cabeçalho como padrão, com presets versionados de Bradesco e Nubank. Configuração manual de separador, cabeçalho, linhas ignoradas, colunas, data, decimal e sinal permanece disponível.
- Linhas CSV detectadas automaticamente com valor zero são descartadas porque não representam movimentação.
- OFX exige blocos estruturados `STMTTRN`; data, valor, identificador, nome e memorando são normalizados quando disponíveis.
- O valor com sinal no staging define a natureza: positivo é Receita e negativo é Despesa. O lançamento final mantém valor positivo inteiro e usa o tipo para definir o efeito financeiro.
- Conta e categoria devem estar ativas, pertencer ao usuário e ter natureza compatível com a linha.
- A assinatura SHA-256 usa usuário, conta, data, valor com sinal e descrição normalizada. Ela não substitui as validações de propriedade ou RLS.
- Duplicidades são detectadas no histórico, em jobs já confirmados e dentro do próprio arquivo. Uma linha duplicada nasce desmarcada e precisa ser corrigida para mudar sua assinatura.
- Uma linha ignorada recebe o estado `ignored`, mantém esse estado quando outras linhas são alteradas, não bloqueia a prontidão do job e é excluída da confirmação. É permitido ignorar várias linhas no mesmo job. Ao reincluir, todas as validações e verificações de duplicidade são executadas novamente.
- A confirmação insere somente linhas válidas e selecionadas, sempre como lançamentos realizados. Linhas ignoradas são desconsideradas, e qualquer falha nas linhas selecionadas reverte todos os lançamentos daquele job.
- O arquivo original é descartado imediatamente após a leitura em memória. Conteúdo financeiro não pode ser enviado a logs.
- Staging é apagado ao confirmar ou cancelar. O job preserva apenas metadados e contadores de auditoria.
- O usuário pode limpar definitivamente os metadados dos próprios jobs cancelados. A operação nunca alcança jobs em revisão, prontos, concluídos ou pertencentes a outro usuário.
- CSV, OFX, QIF e PDF são limitados a 5 MB e 5.000 movimentações por job.

## Importação QIF

- QIF usa o mesmo staging, revisão e confirmação transacional dos demais formatos.
- Categorias do arquivo são sugestões editáveis e nunca bypassam a validação de natureza e propriedade.
- Referências `[Conta]` representam transferências e exigem uma conta diferente, ativa, do mesmo usuário e moeda.
- Transferência QIF negativa sai da conta representada pelo arquivo; positiva entra nela.
- A assinatura de transferência ordena as duas contas e impede duplicidade ao importar o extrato do outro lado.
- Lançamentos divididos não são achatados: ficam bloqueados como não suportados.
- O arquivo original é decodificado em UTF-8 ou Windows-1252, processado em memória e descartado.

## Seleção pesquisável e classificação de transferências

- Categorias e subcategorias são apresentadas em ordem alfabética pelo nome mais específico, com o caminho completo e o contexto Pessoal ou Profissional visíveis.
- A busca de categorias ignora diferenças entre maiúsculas, minúsculas e acentos e procura tanto no nome principal quanto na subcategoria.
- No lançamento por conta e na revisão de importação, contas ativas e cartões de crédito ativos da mesma moeda podem aparecer no seletor como destinos de transferência. A escolha cria ou reclassifica uma transferência canônica e nunca grava uma categoria fictícia.
- Uma linha em staging pode ser corrigida de lançamento para transferência ou de transferência para lançamento. A troca limpa a referência incompatível, revalida proprietário, moeda e natureza e atualiza o job na mesma transação SQL.
- A transferência livre para cartão representa pagamento, não exige associação a uma fatura e aceita valor parcial ou integral. Ela usa somente a conta bancária como origem e o cartão como destino técnico.
- Na importação, somente uma linha negativa pode ser classificada como pagamento de cartão. A confirmação cria a transferência e sua assinatura na mesma transação SQL; falha em qualquer linha desfaz o job inteiro.
- O pagamento integral associado a uma fatura continua disponível no detalhe da fatura. Em ambos os fluxos, o pagamento entra no regime de caixa e não cria uma segunda despesa de consumo na competência.

## Importação assistida por PDF — Sprint 11

- PDF segue obrigatoriamente o mesmo fluxo de staging, correção e confirmação explícita usado por CSV e OFX. A extração nunca cria lançamentos diretamente.
- Somente PDFs com texto pesquisável e layout reconhecido por um adaptador versionado são aceitos. Arquivos protegidos, digitalizados, inválidos ou incompatíveis recebem mensagem amigável.
- Cada adaptador declara banco, tipo de documento e versão de layout. Um banco só pode ser anunciado como suportado quando houver fixture anônima representativa e teste de regressão correspondente.
- A descrição original extraída, as páginas de origem e o nível de confiança permanecem no staging para auditoria e revisão humana.
- Confiança é evidência de extração, não autorização financeira. Nenhuma linha é realizada automaticamente por causa da confiança.
- Os bytes originais são processados somente em memória e descartados antes da persistência do job; confirmar ou cancelar também remove todo o staging.
- Bradesco e Nubank são suportados somente nos layouts versionados cobertos por fixtures anônimas. A posição das colunas define crédito e débito no Bradesco; o bloco de entradas ou saídas define o sinal no Nubank.
- Totais, saldos e valores zero não são tratados como movimentações.
- OCR, PDFs protegidos por senha, tabelas baseadas apenas em imagem e treinamento automático de layouts estão fora do escopo.

## Regras financeiras futuras

Cashback, milhas, cartões adicionais, juros rotativos, parcelamento de fatura, antecipação, conversão monetária, cotações e avaliações automáticas de mercado serão definidos em sprints posteriores.

## Central por conta, grupos de categorias e investimentos detalhados

- A central de Contas é a entrada principal para movimentações. Cada conta possui extrato próprio com receitas, despesas e os dois lados das transferências que a envolvem.
- O histórico global permanece acessível por URL para compatibilidade, mas não é a navegação operacional principal.
- Transferência é criada no mesmo fluxo visual de entrada da conta, continua sem categoria e preserva criação, edição e inativação atômicas.
- A classificação possui três níveis: grupo de relatório, categoria e subcategoria opcional. Uma subcategoria pertence à mesma natureza, contexto, proprietário e grupo da categoria principal.
- Grupos e categorias sugeridos no cadastro são editáveis pelo proprietário. Alterar natureza ou contexto de um grupo em uso é bloqueado para não reinterpretar históricos.
- Contas de investimento registram caixa, aportes e resgates; posições de investimento continuam separadas para evitar dupla contagem.
- Posições distinguem produto operacional: Tesouro, CDB, LCI/LCA, debênture, outras rendas fixas, ações, FIIs, ETFs, fundos, previdência e criptoativos.
- Financiamentos e empréstimos continuam passivos patrimoniais, apenas apresentados na central de Investimentos; cartões de crédito não integram essa aba.

## Importação de financiamentos

- O extrato de financiamento é processado somente no servidor e o PDF original é descartado depois da extração em memória.
- Nenhum passivo é criado antes da revisão e confirmação explícita do usuário.
- A confirmação cria atomicamente um passivo patrimonial, um contrato, seu cronograma e as amortizações extraordinárias. Qualquer falha reverte toda a operação.
- O contrato e o passivo usam vínculo um-para-um; o patrimônio considera apenas o passivo para impedir dupla contagem.
- Valores monetários são inteiros em unidades menores. Taxas e fatores usam decimal exato no banco e texto decimal no domínio.
- Valor pago, principal, juros e encargos consideram apenas parcelas marcadas como pagas no documento. Amortizações extraordinárias são somadas separadamente por recursos próprios e FGTS.
- As páginas de origem são preservadas nos registros estruturados, mas dados cadastrais do cliente não são persistidos.
- Apenas layouts cobertos por adaptador versionado e fixture anônima podem ser anunciados como suportados. OCR e PDFs protegidos ou digitalizados não são inferidos.

## Consolidação patrimonial executiva

- A visão executiva de patrimônio mantém uma seção independente para cada moeda.
- Saldos positivos de contas transacionais, investimentos ativos e bens manuais compõem os ativos.
- Saldos negativos de contas, faturas não pagas, financiamentos, empréstimos e outras dívidas compõem os passivos.
- A coluna agregada `assets_minor` da view patrimonial não é somada novamente: a interface usa explicitamente ativos manuais e investimentos para impedir dupla contagem.
- Cartões aparecem pelo valor pendente das faturas, nunca pelo limite de crédito.
- O simulador de poupança é educativo, não persiste dados e usa capitalização mensal com aritmética inteira em unidades monetárias menores.
- A taxa anual nominal é convertida para pontos-base. Impostos, inflação, custos e variações reais não são inferidos.

## Operação de investimentos, relatórios e orçamento anual

- Uma aplicação ou aporte cria uma saída realizada somente em uma conta ativa do tipo Investimento e um aporte vinculado à posição escolhida, na mesma moeda, contexto e proprietário. No primeiro aporte, a posição pode ser criada na mesma operação, usando o valor aplicado como custo e valor inicial sem ganho presumido.
- Uma liquidação ou resgate cria uma entrada na conta e um resgate vinculado. É movimento de capital, não renda econômica, e por isso não compõe receitas dos relatórios.
- Juros sobre capital, dividendos, bonificações em dinheiro e outros rendimentos criam entrada na conta e renda vinculada à posição. Somente esses eventos compõem a receita econômica de investimentos.
- O vínculo entre extrato e histórico da posição é criado atomicamente. Aportes aumentam valor, custo e quantidade; resgates reduzem o valor, o custo proporcional e a quantidade informada; rendas não alteram o principal. A regra usa centavos inteiros e não inventa rentabilidade.
- Posições anteriores ao histórico transacional podem continuar sendo cadastradas diretamente, com indicação de histórico incompleto.
- Uma transferência realizada que entra em conta de Investimento pode financiar uma aplicação de igual valor; o vínculo cria a saída de aplicação e preserva a entrada original. Uma transferência que sai da conta pode ser ligada a uma liquidação ou renda, criando a entrada correspondente. Os movimentos opostos deixam o saldo da conta representando caixa livre, enquanto a posição representa o principal investido.
- Cada lado de uma transferência só pode financiar ou liquidar uma posição uma vez. Depois do vínculo, os campos financeiros da transferência ficam imutáveis para não divergir do movimento da posição.
- Movimentos de investimento podem ser excluídos pelo proprietário; a exclusão reverte exatamente seu efeito na posição e preserva a transferência original. Posições também podem ser excluídas com todo seu histórico. Transferências sem vínculo podem ser excluídas definitivamente.
- Avaliações patrimoniais podem ser excluídas; se a mais recente for removida, o item retorna à avaliação anterior. O item patrimonial completo também pode ser excluído, exceto quando administrado por um financiamento importado.
- O relatório de competência reconhece compras de cartão pelas parcelas e exclui pagamentos de fatura, transferências e movimentos de capital de investimentos.
- O relatório de caixa reconhece despesas realizadas na data da saída e pagamentos livres para cartões, mas exclui transferências entre contas e movimentos patrimoniais de investimentos.
- Orçamentos aceitam categorias ativas de receita e despesa. O realizado de receitas considera entradas categorizadas ativas e concluídas; o realizado de despesas mantém a regra de consumo por competência.
- As grades mensal e anual começam pelas receitas, consolidam os valores na categoria principal e usam o mesmo controle de abertura em todas as categorias. Quando não há subcategorias, o valor direto é editado na linha `Sem subcategoria`. A grade anual apenas edita os doze orçamentos mensais em conjunto, não cria uma nova unidade de consolidação e nunca soma moedas ou contextos diferentes.
- A central de relatórios usa a navegação principal da aplicação e agrupa seus tipos em uma faixa horizontal compacta abaixo do cabeçalho, preservando a largura principal para as matrizes. Os filtros permitem ajustar ano ou períodos, moeda, contexto e regime quando aplicável.
- Receitas x despesas detalha grupos, categorias e subcategorias por mês; categorias removidas continuam identificadas como históricas, sem reclassificação implícita.
- Uma subcategoria de despesa pode ser marcada pelo usuário como fixa. O relatório de despesas fixas considera somente lançamentos reais dessas subcategorias, segundo o regime selecionado; a marcação não cria lançamento nem recorrência.
- As matrizes consolidam categoria principal e usam o mesmo botão de abertura para categorias com ou sem subcategorias; valores diretos aparecem como `Sem subcategoria`. Os valores permanecem em centavos inteiros, são exibidos sem repetir o símbolo monetário e ordenados de forma crescente dentro de cada seção.
- Comparativos exibem o segundo período menos o primeiro; a variação percentual fica vazia quando o primeiro período é zero.
- Performance de ativos usa somente aportes, resgates, rendimentos, custo e valor registrados. Com histórico completo, o resultado total é `valor atual + resgates + rendimentos - aportes`, o lucro ou perda realizado compara resgates com o custo baixado, e o retorno anualizado é calculado pelos fluxos datados; o retorno mensal é a taxa efetiva equivalente à taxa anualizada. Com histórico parcial, resultado e retorno total usam `valor atual - custo acumulado`, ficam identificados por `*` e os retornos mensal e anualizado permanecem vazios.
- A visão principal da carteira exibe apenas posições ativas. Posições arquivadas ficam em uma lista própria, acessível pelo botão superior, e não participam dos totais nem da participação percentual por classe.
