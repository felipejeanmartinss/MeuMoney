# Roadmap

## Incremento — Caixa do cartão e financiamentos estruturados

- pagamento de fatura registrado como transferência de caixa da conta pagadora para o cartão;
- dashboard mensal alternável entre competência e caixa, sem dupla contagem;
- importação assistida de extrato financeiro Bradesco com prévia e confirmação atômica;
- indicadores de valor pago, principal, juros, encargos e amortizações extraordinárias;
- arquitetura de adaptadores para novos bancos condicionada a fixtures anônimas representativas;
- revisão minimalista do dashboard para melhor leitura em desktop.
- transferência livre de conta para cartão, sem associação obrigatória a fatura;
- classificação de saídas CSV, OFX, QIF ou PDF como pagamento livre para cartão durante a revisão da importação;
- saldo do cartão deduzido pelos pagamentos realizados, com competência das compras preservada;
- diagnóstico da prévia de financiamento quando a migration ainda não está disponível no ambiente.

## Incremento — administração flexível de categorias e contas

- Exclusão atômica de categorias com realocação de vínculos financeiros.
- Edição e exclusão atômica de grupos, preservando a hierarquia em um grupo substituto compatível.
- Exclusão definitiva de contas previamente inativadas.
- Criação rápida de categoria ou subcategoria em lançamentos e importações.
- Grade compacta de categorias inspirada em planilhas, mantendo a identidade visual atual.

## Sprint 12 — Segurança e beta pessoal

Exportação completa, backup restaurável e transacional, exclusão de conta com
reautenticação, retenção de importações, histórico mínimo das operações
críticas, revisão de RLS, monitoramento sem dados financeiros, recuperação de
erros, acessibilidade básica e PWA segura para um beta privado.

## Sprint 0 — Fundação

Estrutura Next.js, PWA inicial, Supabase, documentação, domínio monetário mínimo e qualidade automatizada.

## Sprint 1 — Identidade e segurança

Cadastro, confirmação de e-mail, login, logout, recuperação e troca de senha, sessão SSR, rotas privadas, perfil automático e RLS.

## Sprint 2 — Contas e categorias

Contas financeiras básicas, saldo inicial e data de referência, categorias padrão e personalizadas, contextos Pessoal/Profissional, preferência monetária, arquivamento lógico e RLS específico.

## Sprint 3 — Lançamentos e transferências

Receitas, despesas, estados Previsto/Realizado, filtros, edição e inativação lógica, transferências atômicas entre contas da mesma moeda e saldo atual calculado.

## Sprint 4 — Cartões de crédito

Cartões, compras à vista ou parceladas, competência por fechamento, faturas, pagamento integral, estorno seguro e limites derivados.

## Sprint 5 — Recorrências

Receitas e despesas semanais, mensais ou anuais, calendário ancorado para meses curtos, data final opcional, geração idempotente de lançamentos previstos e estados ativa, suspensa e encerrada.

## Sprint 6 — Orçamento mensal

Planejamento mensal por categoria, contexto e moeda, comparação entre planejado e realizado, reconhecimento das parcelas de cartão por competência, exclusão de transferências e pagamentos técnicos, cópia idempotente do mês anterior e isolamento por RLS.

## Sprint 7 — Dashboard financeiro

Visão mensal consolidada por moeda com saldos por conta, receitas, despesas de consumo, resultado, orçamento consumido, próximas recorrências e faturas não pagas. Evolução dos últimos seis meses e distribuição por categoria usam consultas agregadas seguras, estados vazios, carregamento e layout responsivo.

## Sprint 8 — Patrimônio líquido

Ativos e passivos manuais separados das contas transacionais, avaliações históricas, arquivamento lógico e resumo de patrimônio líquido por moeda. Serviços exclusivos do servidor, RLS e migrations cumulativas preservam isolamento e exatidão.

## Sprint 9 — Investimentos

Posições manuais de renda fixa, ações, fundos, ETFs, fundos imobiliários,
previdência e criptomoedas. Quantidade decimal exata, custo, valor atual,
fotografias históricas, aportes, resgates e rendas permanecem separados. O valor
atual integra o patrimônio por moeda, sem cotações automáticas ou rentabilidade
inventada.

## Sprint 10 — Importação CSV e OFX

Fluxo assistido com leitura temporária, normalização, staging, prévia,
associação de conta e categoria, correção, assinatura estável, detecção de
duplicidades e confirmação atômica. CSV possui autodetecção versionada para
Bradesco e Nubank, detector genérico e modo manual; OFX permanece estruturado.
Arquivos originais e staging possuem descarte explícito.

## Sprint 11 — Importação assistida por PDF

O pipeline de staging passa a aceitar PDFs com texto pesquisável por meio de
adaptadores versionados. Descrição original, páginas e confiança acompanham
cada linha até a revisão compartilhada com CSV/OFX. Bradesco e Nubank possuem
adaptadores de extrato versionados, fixtures anônimas e regressão contra os
layouts fornecidos. PDFs protegidos, digitalizados, incompatíveis ou com layout
desconhecido são rejeitados e o documento original é descartado.

## Incremento — Importação QIF

Importação direta de arquivos QIF do Microsoft Money usando o staging
existente. Categorias originais são preservadas como sugestões; referências
`[Conta]` são mapeadas e confirmadas como transferências reais, com assinatura
idempotente independente do lado importado. A revisão passa a ser paginada e o
limite sobe para 5.000 linhas. Lançamentos divididos permanecem fora do escopo.

## Próximas sprints

Novas versões e novos bancos com fixtures representativas, lançamentos QIF
divididos, OCR, importação XLS,
relatórios analíticos, avaliações automáticas de mercado e recursos avançados
de cartão serão planejados separadamente.

## Incremento visual consolidado — MeuMoney moderno

- shell responsivo com cinco destinos principais e submenus contextuais;
- dashboard executivo mensal, controlado por um único filtro e separado por moeda;
- central de contas com extrato, recorrências e importação contextual;
- agenda de recorrências com filtros, indicadores e linha do tempo;
- central de investimentos com posições e financiamentos;
- patrimônio executivo com regra explícita contra dupla contagem;
- simulador educativo de poupança sem persistência;
- central de Perfil para informações pessoais, importações e segurança;
- padronização visual, acessibilidade, estados de erro, PWA e regressão responsiva.

O incremento é exclusivamente de experiência e composição de dados já
autorizados. Não altera as regras financeiras existentes nem exige migration.

## Incremento — Subcategorias, extrato por conta e conciliação

- categorias principais recebem subcategorias de um nível, preservando
  natureza, contexto, proprietário e isolamento por RLS;
- a página de cada conta passa a ser o registro cronológico completo de
  receitas, despesas e transferências, com saldo após cada item;
- lançamentos ativos e realizados podem ser reconciliados, com confirmação
  independente para cada lado de uma transferência;
- mudanças financeiras invalidam automaticamente a conciliação anterior.

## Incremento — Operação centrada na conta

- dashboard e central com acesso direto ao extrato de cada conta;
- filtro entre contas ativas e todas as contas;
- lançamento unificado de receita, despesa ou transferência no contexto da conta;
- grupos de relatório editáveis acima de categorias e subcategorias;
- recorrências com a mesma classificação hierárquica dos lançamentos;
- contas transacionais de investimento separadas das posições;
- posições organizadas em renda fixa, renda variável, previdência e alternativos;
- financiamentos e empréstimos acessíveis na central de Investimentos sem duplicação patrimonial.

## Incremento — Classificação pesquisável e transferências no lançamento

- seleção alfabética e pesquisável de categorias e subcategorias;
- exibição do caminho completo e do contexto de cada categoria;
- destinos de transferência de mesma moeda disponíveis no fluxo de lançamento por conta;
- reclassificação segura de linhas importadas entre lançamento e transferência;
- pagamentos de cartão preservados no fluxo técnico da fatura, sem dupla contagem.
