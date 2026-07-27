# Roadmap

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
duplicidades e confirmação atômica. CSV configurável e OFX estruturado entram
primeiro; arquivos originais e staging possuem descarte explícito.

## Sprint 11 — Importação assistida por PDF

O pipeline de staging passa a aceitar PDFs com texto pesquisável por meio de
adaptadores versionados. Descrição original, páginas e confiança acompanham
cada linha até a revisão compartilhada com CSV/OFX. A primeira implementação
usa somente fixtures anônimas de um banco fictício para validar o contrato, sem
declarar suporte a banco real. PDFs protegidos, digitalizados ou incompatíveis
são rejeitados e o documento original é descartado.

## Próximas sprints

Adaptadores de bancos reais com fixtures representativas, OCR, importação XLS,
relatórios analíticos, avaliações automáticas de mercado e recursos avançados
de cartão serão planejados separadamente.
