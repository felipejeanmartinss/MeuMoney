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
- Categorias padrão são criadas automaticamente para cada usuário, partem de uma taxonomia inspirada na orientação AUVP adaptada aos contextos do MeuMoney e são imutáveis pelo cliente.
- Categorias personalizadas podem ser criadas, editadas, inativadas e reativadas pelo proprietário.
- A combinação nome, natureza e contexto é única por usuário.
- A interface não cria lançamentos nem calcula saldo atual nesta sprint. O valor exibido na conta é explicitamente o saldo inicial.

## Regras financeiras futuras

Lançamentos, transferências, cartões, faturas, orçamentos, investimentos, conversão monetária e saldo calculado serão definidos em sprints posteriores.
