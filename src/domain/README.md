# Domínio

Regras financeiras puras e invariantes vivem aqui. Este módulo não pode importar React, Next.js, Supabase ou qualquer detalhe de infraestrutura.

Casos de uso e serviços podem depender do domínio; o domínio nunca depende deles.

As regras de orçamento em `budgets.ts` espelham a agregação autoritativa do
PostgreSQL para permitir testes rápidos de competência, exclusões e isolamento.

As regras de patrimônio em `net-worth.ts` classificam ativos e passivos,
validam valores inteiros e espelham a consolidação por usuário e moeda.

As regras de investimentos em `investments.ts` preservam quantidade decimal,
validam posições e separam aporte, resgate, renda e diferença sobre custo sem
inventar rentabilidade.
