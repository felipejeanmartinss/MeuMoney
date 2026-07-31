# Patrimônio líquido

## Escopo

A Sprint 8 registra manualmente ativos e passivos sem produzir movimentações:

- ativos: imóveis, veículos e outros bens;
- passivos: financiamentos, empréstimos e outras dívidas;
- moedas: BRL, USD e EUR, sempre consolidadas separadamente;
- contextos: Pessoal e Profissional.

Investimentos com posição ou cotação, depreciação automática, garantias, amortização e conversão cambial não fazem parte desta entrega.

## Fluxo de avaliação

O cadastro cria o item e sua primeira avaliação na mesma transação. Na edição, uma mudança de valor ou data atualiza a posição corrente e grava o ponto histórico. A mesma data pode ser corrigida sem duplicidade; datas anteriores à posição corrente são recusadas.

A moeda e a natureza do item são imutáveis. Para corrigir uma classificação entre Ativo e Passivo ou mudar a moeda, arquive o registro incorreto e crie outro item. Essa decisão preserva o significado de todas as avaliações anteriores.

## Segurança

- componentes não acessam o Supabase;
- serviços marcados como `server-only` validam a sessão e filtram `user_id`;
- RLS repete o isolamento no banco;
- a tabela de avaliações não concede escrita ao cliente;
- triggers internos registram o histórico;
- itens e avaliações não possuem permissão de exclusão pela aplicação.

## Aplicação da migration

As migrations `20260726053536_net_worth.sql` e `20260726055159_net_worth_fk_index.sql` devem ser aplicadas ao projeto Supabase antes do deploy da aplicação. A segunda cobre a chave estrangeira composta do histórico conforme o advisor de performance. O processo de deploy deve manter a ordem cumulativa das migrations e interromper a publicação se o banco não estiver atualizado.
