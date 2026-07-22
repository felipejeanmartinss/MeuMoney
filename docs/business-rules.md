# Regras de negócio

## Identidade — Sprint 1

- Senhas existem somente no Supabase Auth e nunca são persistidas ou registradas pela aplicação.
- Cada usuário possui exatamente um perfil com o mesmo UUID de `auth.users`.
- O perfil nasce na mesma transação do cadastro por trigger do banco.
- Um usuário autenticado pode ler e editar somente o próprio perfil.
- Recuperação de senha sempre responde de forma neutra, sem confirmar a existência de uma conta.
- Redirecionamentos de autenticação são restritos a caminhos internos.
- A troca de senha encerra todas as sessões e exige novo login.

## Regras financeiras futuras

Dinheiro será armazenado em unidades menores inteiras. Transferências, cartões, contextos pessoal/profissional e demais regras financeiras serão detalhados e implementados em sprints posteriores.
