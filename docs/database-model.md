# Modelo de dados

## Perfis

`public.profiles` contém `id`, `full_name`, `preferred_currency`, `created_at` e `updated_at`. `id` referencia `auth.users(id)` com exclusão em cascata.

A função `handle_new_user` é `security definer`, usa `search_path` vazio, cria o perfil a partir de `raw_user_meta_data.full_name` e semeia as categorias padrão na mesma transação. Clientes autenticados recebem apenas `SELECT` e `UPDATE (full_name, preferred_currency)`; políticas RLS restringem ambas as operações a `auth.uid() = id`. Não há permissão de inserção ou exclusão pelo cliente.

## Contas

`public.accounts` contém proprietário, nome, tipo, contexto, moeda, `opening_balance_minor`, `opening_balance_date`, estado de arquivamento e timestamps. O saldo inicial usa `bigint`, nunca ponto flutuante. RLS separa leitura, inserção e atualização por `auth.uid() = user_id`; não existe política de exclusão.

## Categorias

`public.categories` contém proprietário, nome, natureza, contexto, indicador de categoria padrão, arquivamento e timestamps. A função `seed_default_categories` cria a taxonomia inicial de cada usuário e também atende usuários existentes durante a migration.

RLS permite leitura das categorias do proprietário. Inserção e atualização exigem `is_system = false`, e os privilégios por coluna impedem o cliente de transformar uma categoria personalizada em padrão. Não existe política de exclusão.

## Integridade

- moedas aceitas: BRL, USD e EUR;
- saldo inicial limitado ao intervalo de inteiros seguros do TypeScript;
- `opening_balance_date` é obrigatória;
- nomes de categorias são únicos por usuário, natureza e contexto;
- triggers mantêm `updated_at`;
- chaves estrangeiras para o usuário usam exclusão em cascata, executada apenas quando o usuário é removido pelo fluxo administrativo de identidade.
