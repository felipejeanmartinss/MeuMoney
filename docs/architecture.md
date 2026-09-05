# Arquitetura

## Segurança operacional — Sprint 12

A rota `/settings/security` usa Server Components e Server Actions. Exportação
e restauração passam pelo serviço de dados pessoais; somente a exclusão da
identidade cria um cliente administrativo, sempre no servidor.

O backup é serializado por RPC `security invoker`. A restauração usa função
privada `security definer`, `search_path` vazio, validação de `auth.uid()` e
privilégios revogados. O navegador não recebe escrita no histórico crítico.

`instrumentation.ts` registra somente erro sanitizado. O service worker guarda
shell estático; navegações privadas usam rede e APIs nunca entram no cache.

## Camadas

- `src/app`: rotas, Server Components, Route Handlers e Server Actions.
- `src/components`: apresentação e formulários; não cria clientes Supabase diretamente.
- `src/services`: casos de acesso a dados no servidor, adaptadores de autenticação e clientes Supabase para browser, servidor e Proxy.
- `src/domain`: tipos, validações e regras puras independentes da interface.
- `src/utils`: utilitários puros e funções de segurança testáveis.
- `supabase/migrations`: esquema cumulativo, triggers e RLS.

## Autenticação

O browser inicia operações interativas do Supabase Auth. A rota `/auth/callback` troca o código PKCE por uma sessão armazenada em cookies. `src/proxy.ts` renova cookies e executa redirecionamentos otimistas. Páginas privadas chamam `requireUser()` no servidor e o PostgreSQL aplica RLS sobre cada consulta.

Redirecionamentos recebidos por query string aceitam apenas caminhos relativos internos. Respostas que atualizam cookies de autenticação recebem `Cache-Control: private, no-store`.

Após a troca de senha, o escopo global de logout invalida os refresh tokens e remove a sessão atual. O usuário entra novamente com a nova senha.

## Fundação financeira — Sprint 2

As rotas `/accounts` e `/categories` usam Server Components para leitura e Server Actions para mutações. Componentes de formulário não acessam o Supabase diretamente. Os serviços em `src/services/finance` sempre obtêm o usuário validado com `requireUser()` e ainda aplicam filtro explícito por `user_id`; o PostgreSQL mantém a barreira definitiva com RLS.

Valores monetários são convertidos na fronteira do formulário e persistidos como inteiros em unidades menores. A moeda é armazenada separadamente. Contas e categorias usam arquivamento lógico (`archived_at`), preservando referências futuras e histórico.

Categorias iniciais são criadas no banco junto ao perfil, por função `security definer`. O campo `is_system` registra apenas que a categoria veio desse conjunto de sugestões; a política de atualização permite ao proprietário editar, inativar ou reativar qualquer uma de suas categorias.

Subcategorias reutilizam a autorreferência `categories.parent_id`. O domínio
filtra pais compatíveis para uma interação imediata, e o trigger do PostgreSQL
repete as invariantes de proprietário, natureza, contexto e profundidade na
fronteira confiável.

## Movimentações financeiras — Sprint 3

As rotas `/transactions` e `/transfers` seguem o mesmo fluxo Server Component → Server Action → serviço de dados. Formulários validam a entrada com Zod, enquanto triggers e funções SQL repetem as invariantes críticas na fronteira confiável do banco.

Receitas e despesas são persistidas em `transactions`. Transferências usam uma tabela canônica separada e duas entradas vinculadas. Mutações de transferência são expostas por fachadas públicas `security invoker`, que delegam à implementação privilegiada no schema `private`; assim, a origem e o destino são criados, editados e inativados atomicamente sem expor uma função privilegiada no schema da Data API.

O saldo não é atualizado por incrementos mutáveis. A view `account_balances`, executada com as políticas do usuário chamador, calcula o valor atual a partir do saldo inicial e apenas de movimentações ativas e realizadas. Essa decisão elimina rotinas de compensação ao editar lançamentos e reduz o risco de divergência.

O detalhe da conta pagina a apresentação, mas o serviço busca o histórico em
lotes no servidor, combina `transactions` e `transfer_entries` e entrega ao
componente apenas a página renderizada. A função pura `buildAccountRegister`
ordena as entradas e calcula o saldo linha a linha usando as mesmas condições
de atividade e realização da view de saldos.

A conciliação usa uma fachada pública `security invoker` e uma implementação
interna que valida `auth.uid()`. O estado fica em cada movimentação de conta,
inclusive separadamente nos dois lados da transferência, e triggers o removem
quando uma alteração financeira torna a confirmação anterior obsoleta.

## Cartões e faturas — Sprint 4

Cartões são lidos e editados por Server Components, Server Actions e serviços exclusivos do servidor. Compras, parcelas, fechamento, pagamento e estorno não aceitam escrita direta do cliente: fachadas públicas sem elevação delegam a funções internas `security definer`, com `search_path` vazio e validação de `auth.uid()`, para executar cada operação crítica em uma única transação PostgreSQL.

O consumo é reconhecido na compra e categorizado como despesa, mas não movimenta uma conta. O fluxo de pagamento integral da fatura continua criando uma transação técnica protegida. Além dele, `transfers.destination_credit_card_id` permite registrar uma transferência comum da conta para o cartão, sem associação obrigatória a fatura. A transferência possui somente a saída da conta, enquanto a view `credit_card_summaries`, com `security_invoker`, deriva o saldo atual das parcelas ativas menos os pagamentos realizados.

Valores de cartão também usam unidades menores inteiras. As colunas `numeric(16,0)` preservam exatidão no PostgreSQL e permanecem dentro do intervalo inteiro seguro adotado pelo TypeScript. Consulte `docs/credit-cards.md`.

## Recorrências

A rota `/recurring-transactions` mantém modelos periódicos por Server Components, Server Actions e um serviço exclusivo do servidor. A geração não ocorre durante renderização e exige uma ação explícita do usuário com data limite, evitando efeitos colaterais ocultos.

O PostgreSQL é a fronteira transacional da geração. A RPC `generate_recurring_transactions` seleciona apenas modelos de `auth.uid()`, bloqueia as linhas processadas e combina índice único parcial com `ON CONFLICT DO NOTHING`. Assim, retries e execuções concorrentes são seguros. Cada ocorrência nasce como lançamento Previsto, com vínculo de origem imutável; o saldo realizado permanece inalterado.

O cálculo de próxima data usa a data inicial como âncora. A mesma regra pura existe no domínio TypeScript para validação e testes de calendário, enquanto a função SQL é a implementação autoritativa durante a geração. Estados são alterados por RPC para impedir que um cliente reative uma recorrência encerrada.

## Segurança de RPCs e senhas

Operações que precisam atravessar várias tabelas mantêm uma fachada de nome estável no schema `public`, marcada como `security invoker`. A implementação transacional fica no schema `private`, usa `security definer`, `search_path` vazio, valida `auth.uid()` e não é exposta diretamente pela Data API. Essa separação elimina a exposição de RPCs privilegiadas sem quebrar os contratos usados pelos serviços.

No plano gratuito do Supabase, a verificação de senhas contra bases de credenciais vazadas não está disponível. O MVP aplica controle compensatório explícito: mínimo de 12 caracteres, bloqueio local de um pequeno conjunto de senhas triviais, confirmação de e-mail, respostas neutras na recuperação e limites do Supabase Auth. Isso reduz o risco, mas não equivale à verificação de credenciais vazadas; o alerta do Advisor permanece aceito até a adoção do plano que oferece o recurso.

## Importação de arquivos — Sprints 10 e 11

As rotas `/imports`, `/imports/new` e `/imports/[id]` usam Server Components para leitura e Server Actions para mutações. O arquivo chega ao servidor, é limitado a 5 MB, decodificado em memória e normalizado por parsers puros de CSV, OFX ou QIF, ou pelo extrator PDF executado exclusivamente no servidor. O byte original nunca é persistido nem enviado a logs; apenas uma impressão SHA-256, metadados mínimos e linhas temporárias entram no banco.

PDFs passam primeiro por `pdf-text-extractor`, que recupera texto, coordenadas
`x/y` e página, sem OCR. Em seguida, o registro de adaptadores em
`src/domain/pdf-imports.ts` seleciona somente layouts reconhecidos. O contrato
do adaptador devolve linhas normalizadas e metadados de banco, documento,
versão, descrição original, páginas e confiança. Adicionar um adaptador exige
fixture anônima representativa e teste de regressão. Os adaptadores Bradesco e
Nubank usam essas coordenadas e o contexto das seções para separar
movimentações de saldos e totais.

CSV é autodetectado no servidor por cabeçalhos e amostras. Presets conhecidos
fixam as convenções de Bradesco e Nubank; um detector genérico exige colunas
inequívocas e amostra predominantemente válida. A configuração efetiva é
persistida no job para rastreabilidade, sem armazenar o arquivo original.

`import_jobs` controla o fluxo; `import_staging_rows` contém a prévia corrigível; `imported_transaction_signatures` mantém a barreira de idempotência. Conta e categorias são associadas antes da confirmação. QIF acrescenta mapeamento explícito de categorias e contas citadas em transferências. A revisão é paginada no servidor para arquivos maiores.

A confirmação acontece em uma função interna transacional: bloqueia o job, recalcula duplicidades, valida todas as linhas selecionadas, cria lançamentos ou transferências realizadas e registra as assinaturas. Qualquer falha reverte tudo. Ao concluir ou cancelar, as linhas de staging são apagadas. O arquivo original já havia sido descartado imediatamente após a leitura.

A limpeza de jobs cancelados usa a RPC `clear_cancelled_import_jobs`. A função
privada valida `auth.uid()` e exclui somente registros `cancelled` do usuário
autenticado; a função pública é apenas um wrapper `security invoker`. Nenhuma
permissão direta de exclusão é concedida às tabelas de importação.

## Orçamento mensal — Sprint 6

A rota `/budgets` é protegida no servidor e segue o fluxo Server Component → Server Action → serviço financeiro. Os filtros de mês, contexto e moeda ficam na URL, permitindo recarregar e compartilhar o mesmo recorte sem estado global no cliente. O único Client Component contém o formulário editável e não acessa o Supabase.

O PostgreSQL calcula o realizado nas views `monthly_consumption` e `monthly_budget_progress`, ambas `security_invoker`, de modo que as políticas das tabelas de origem continuam sendo aplicadas. Lançamentos em conta são reconhecidos pela data da transação; compras no cartão, pela competência das parcelas. A transação técnica de pagamento da fatura é excluída da fonte de consumo.

O planejamento é salvo com `UPSERT` na chave única usuário/mês/moeda/categoria. A cópia do mês anterior é uma RPC transacional idempotente que valida o usuário autenticado e não sobrescreve linhas existentes. A regra pura equivalente em `src/domain/budgets.ts` sustenta os testes de agregação, exclusões e isolamento.

## Dashboard financeiro — Sprint 7

A rota `/dashboard` permanece um Server Component dinâmico. Ela recebe somente o mês pela URL e delega a leitura a `src/services/reports/financial-dashboard-service.ts`, que valida a sessão, filtra novamente por `user_id` e consulta views `security_invoker`.

O navegador recebe apenas o recorte necessário: resumo do mês e dos cinco anteriores, categorias do mês selecionado, contas ativas e no máximo cinco recorrências e cinco faturas por moeda. O serviço consulta cada moeda separadamente para que um grupo não esconda os próximos itens de outro e monta seções independentes para BRL, USD e EUR.

As agregações de alto volume ocorrem no PostgreSQL. A interface renderiza gráficos acessíveis com HTML e CSS no servidor, sem biblioteca cliente nem carregamento do histórico bruto. `loading.tsx` oferece o estado de transição e `error.tsx` isola falhas inesperadas com tentativa segura de recarga.

No regime de competência, o cartão permanece reconhecido pelas parcelas. No regime de caixa, transferências realizadas para cartões são agregadas pela data da saída da conta. As duas fontes ficam separadas no banco para impedir dupla contagem.

## Patrimônio líquido — Sprint 8

A rota `/net-worth` é independente das contas transacionais. Ela usa Server Components para resumo, listagem e histórico, Server Actions para mutações e `src/services/finance/net-worth-service.ts` como única camada de acesso ao Supabase. O formulário cliente apenas coleta e valida a entrada; não cria cliente de banco nem executa consultas.

`net_worth_items` mantém a posição atual de cada bem ou dívida. Um trigger interno, executado na mesma transação, grava a avaliação inicial e cada alteração de valor ou data em `net_worth_valuations`. A tabela histórica não concede escrita a clientes autenticados. A moeda e a natureza Ativo/Passivo ficam imutáveis depois do cadastro para impedir que avaliações anteriores mudem de significado.

`net_worth_summary` é uma view `security_invoker` que agrega apenas itens ativos por usuário e moeda. O PostgreSQL calcula ativos, passivos e a diferença antes da renderização; nenhuma conversão cambial ou soma entre moedas ocorre no navegador. RLS, filtros explícitos por `user_id`, privilégios por coluna e ausência de `DELETE` formam barreiras complementares.

## Investimentos — Sprint 9

As rotas `/investments` usam Server Components para resumo, posições e
históricos, Server Actions para mutações e
`src/services/finance/investments-service.ts` como única camada de acesso ao
Supabase. Quantidades atravessam a aplicação como texto decimal canônico;
valores monetários permanecem inteiros.

`investment_positions` mantém a fotografia atual. Triggers atômicos criam
`investment_position_snapshots` no cadastro e em alterações de quantidade,
custo, valor ou data. `investment_cash_flows` é um histórico separado e
acrescentável de aportes, resgates e rendas; registrar um fluxo não altera
silenciosamente a posição.

As views `investment_position_summary` e `net_worth_summary` usam
`security_invoker`. A primeira separa fluxos e só deriva o resultado total com
histórico declarado completo. A segunda incorpora o valor atual das posições
ativas como ativos, mantendo investimentos, ativos manuais e passivos em
colunas distintas e consolidação independente por moeda.

## Camada de experiência moderna

O shell autenticado possui cinco destinos estáveis: Início, Contas,
Investimentos, Patrimônio e Perfil. No desktop, a navegação principal e o
submenu contextual ficam em uma barra lateral; no celular, os cinco destinos
ficam na navegação inferior e as ações secundárias são abertas pelo menu do
cabeçalho. A resolução de seção e estado ativo está isolada em
`src/components/layout/navigation-model.ts` e coberta por testes.

As rotas históricas continuam sendo as rotas canônicas. As centrais apenas
agrupam e encaminham para `/transactions`, `/recurring-transactions`,
`/transfers`, `/categories`, `/credit-cards`, `/imports` e
`/settings/security`, sem duplicar serviços ou regras financeiras.

O detalhe de conta consulta no servidor somente o recorte da conta autenticada:
até 100 lançamentos, 50 recorrências e 20 jobs de importação. Criar lançamento,
recorrência ou importação a partir desse detalhe envia somente o identificador
predefinido; o serviço e o banco continuam validando propriedade e RLS.

## Regimes financeiros e extratos de financiamento

O dashboard envia `month` e `basis` à camada de relatórios. As views agregadas
do PostgreSQL calculam competência e caixa separadamente; o Server Component
recebe apenas os meses e moedas solicitados. A interface não recompõe o
histórico nem mistura os dois regimes no navegador.

Extratos de financiamento seguem a porta `FinancingPdfAdapter`: detecção,
versão do layout e parser vivem no domínio; extração do PDF e persistência ficam
em serviços exclusivos do servidor. O arquivo é lido em memória e convertido
em staging estruturado. RPCs autenticadas fazem confirmação ou cancelamento de
forma atômica, sob RLS e chaves compostas de proprietário.

A disponibilidade da prévia depende da migration cumulativa do financiamento.
O servidor diferencia falhas de leitura de ausência da RPC e registra somente
metadados técnicos seguros, nunca texto, valores ou identificadores do PDF.

O simulador patrimonial é o único novo Client Component com cálculo financeiro.
A função pura `projectSavings` recebe dinheiro inteiro, taxa em pontos-base e
prazo inteiro. O componente apenas coleta entradas e apresenta a projeção; não
acessa o Supabase e não persiste simulações.

## Experiência centrada na conta

O dashboard e a central de Contas encaminham para `/accounts/[id]`, que reúne
Extrato, Contas a Pagar e Importar. O formulário `/transactions/new` aceita a
conta de origem e alterna entre Receita, Despesa e Transferência; cada modo
continua chamando suas Server Actions e serviços financeiros existentes.

Grupos de categorias são lidos junto das categorias no servidor e enviados
como opções mínimas aos formulários cliente. Nenhum Client Component acessa o
Supabase diretamente. A central de Investimentos apenas organiza posições por
família e reutiliza passivos patrimoniais para financiamentos e empréstimos,
sem mover registros entre domínios.

## Operações financeiras e relatórios executivos

O formulário unificado de lançamentos oferece um modo de investimento somente
para contas desse tipo. A Server Action valida a entrada e chama
`create_investment_account_entry`, uma fachada `security invoker` para a
operação privada e atômica que grava a transação da conta e o fluxo da posição.
A posição atual não é recalculada a partir do evento: quantidade, custo e valor
continuam sendo fotografias manuais e auditáveis.

`/reports` consulta exclusivamente `financial_dashboard_monthly_basis`, com
ano, moeda e regime filtrados no servidor. O navegador recebe no máximo doze
linhas agregadas, sem carregar o histórico financeiro. A mesma view separa
competência e caixa e distingue renda de investimento de simples devolução de
capital.

`/budgets` mantém a edição mensal e adiciona uma grade anual que executa
`UPSERT` sobre as mesmas linhas mensais. `monthly_budget_actuals` e
`monthly_budget_progress` são views `security_invoker` e agregam receitas e
despesas por proprietário, categoria, contexto, moeda e mês.
