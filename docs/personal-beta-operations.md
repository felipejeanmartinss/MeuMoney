# Operação do beta pessoal

## Pré-requisitos

- beta privado, sem cadastro público divulgado;
- migrations aplicadas em ordem, incluindo `20260728192413_personal_beta_hardening.sql`;
- variáveis públicas do Supabase configuradas;
- `SUPABASE_SECRET_KEY` configurada somente no servidor da Vercel;
- URLs de autenticação restritas aos domínios usados pelo beta.

A chave secreta nunca pode usar o prefixo `NEXT_PUBLIC_`, ser incluída em
logs, enviada ao navegador ou adicionada ao Git.

## Backup, exportação e recuperação

A área `/settings/security` gera um JSON versionado com todos os dados do
usuário autenticado. O arquivo contém dados financeiros sensíveis, mas não
contém senha nem token. Ele deve ser guardado em local criptografado.

A restauração aceita somente a versão suportada e executa no PostgreSQL em uma
única transação. IDs internos são preservados, o proprietário é substituído
pelo usuário autenticado e referências entre usuários são rejeitadas. Se
qualquer validação falhar, a transação sofre rollback e os dados anteriores
permanecem intactos.

Procedimento de recuperação:

1. confirmar que projeto e migrations suportam a versão do backup;
2. criar ou acessar a conta de destino;
3. exportar um backup do estado atual;
4. restaurar o arquivo em `/settings/security`;
5. conferir contas, saldos, cartões, orçamento, patrimônio e importações;
6. registrar a evidência sem copiar valores financeiros para tickets.

## Exclusão de conta

A exclusão exige sessão válida, senha atual e a frase
`EXCLUIR MINHA CONTA`. O servidor reautentica o usuário e usa a chave secreta
somente para remover a identidade pelo Supabase Admin. As chaves estrangeiras
com `ON DELETE CASCADE` removem os dados vinculados. Não há lixeira.

## Retenção de importações

- bytes originais: não persistidos; descarte imediato após leitura;
- staging em revisão ou pronto: sete dias;
- staging confirmado ou cancelado: descarte imediato;
- metadados terminais do job: noventa dias;
- assinaturas de duplicidade: mantidas com o histórico correspondente.

A retenção é aplicada ao acessar a lista de importações. Com maior volume, a
mesma função deverá ser chamada por um agendamento confiável.

## Monitoramento e privacidade

Erros inesperados produzem somente evento estruturado com horário, tipo da
rota, método, nome técnico e `digest` do Next.js. Mensagem, stack trace, URL com
parâmetros, e-mail, ID do usuário, descrição e valores não são registrados.

No plano Hobby, consultar os logs da Vercel durante o beta. Nunca copiar dados
financeiros de produção para issues; fixtures de diagnóstico devem ser
anônimas.

## Teste de RLS

`supabase/tests/personal_beta_rls.sql` cria dois usuários e confirma que cada
sessão vê somente a própria conta e histórico e não pode forjar eventos. Rode
em banco local descartável:

```powershell
npx.cmd supabase db reset
npx.cmd supabase test db
```

## Checklist de liberação

- [ ] migration da Sprint 12 aplicada no Supabase de Preview;
- [ ] `SUPABASE_SECRET_KEY` disponível apenas no servidor;
- [ ] `npm.cmd run check` aprovado no mesmo commit;
- [ ] cadastro, confirmação, login e recuperação testados;
- [ ] isolamento com dois usuários testado;
- [ ] exportação e restauração testadas com dados anônimos;
- [ ] contas, lançamentos, transferências e cartões conferidos;
- [ ] orçamento, patrimônio e importações conferidos;
- [ ] exclusão validada em usuário descartável;
- [ ] navegação por teclado e foco visível verificados;
- [ ] instalação PWA e página offline verificadas;
- [ ] logs confirmados sem dados financeiros;
- [ ] URLs de callback e variáveis de Preview/Production revisadas.

## Riscos residuais

- o plano gratuito não verifica senhas em bases vazadas;
- a retenção depende de acesso à lista até existir agendamento;
- a chave secreta aumenta o impacto de configuração incorreta;
- o backup JSON não é criptografado pelo aplicativo;
- a PWA não oferece operação financeira offline;
- E2E real depende de ambiente Supabase/Vercel descartável;
- o beta não substitui backup administrado do banco.
