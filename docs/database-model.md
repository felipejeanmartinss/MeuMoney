# Modelo de dados

## Perfis

`public.profiles` contém `id`, `full_name`, `created_at` e `updated_at`. `id` referencia `auth.users(id)` com exclusão em cascata.

A função `handle_new_user` é `security definer`, usa `search_path` vazio e cria o perfil a partir de `raw_user_meta_data.full_name`. Clientes autenticados recebem apenas `SELECT` e `UPDATE (full_name)`; políticas RLS restringem ambas as operações a `auth.uid() = id`. Não há permissão de inserção ou exclusão pelo cliente.

As tabelas financeiras originadas na fundação permanecem reservadas para sprints futuras e não são acessadas pela interface da Sprint 1.
