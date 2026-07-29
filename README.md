# MeuMoney

## Beta pessoal e segurança

- exportação completa em JSON versionado e restauração transacional;
- exclusão definitiva com reautenticação e segredo administrativo só no servidor;
- histórico imutável das operações críticas, sem conteúdo financeiro;
- retenção de staging e metadados de importação;
- monitoramento sanitizado, recuperação de erros, acessibilidade e PWA sem cache privado;
- revisão de RLS e teste SQL de isolamento entre dois usuários.

Consulte [docs/personal-beta-operations.md](docs/personal-beta-operations.md)
antes de aplicar a migration ou liberar um usuário no beta.

Progressive Web App de gestão financeira pessoal. A feature atual acrescenta
importação assistida de CSV, OFX, QIF e PDFs pesquisáveis suportados, com staging,
correção, duplicidades e confirmação atômica.

## Stack

- Next.js 16, React 19, App Router e TypeScript estrito;
- Tailwind CSS 4;
- Supabase Auth, PostgreSQL, migrations e Row Level Security;
- PWA, Vitest e ESLint;
- Vercel e GitHub.

## Executar localmente

1. Copie `.env.example` para `.env.local` e informe a URL e a chave publicável do Supabase.
2. Instale as dependências com `npm.cmd install` no PowerShell.
3. Aplique as migrations com `npx.cmd supabase db reset` (ambiente local) ou pelo fluxo de deploy do Supabase.
4. Inicie com `npm.cmd run dev`.
5. Abra `http://localhost:3000` — não use a extensão Live Server, pois a aplicação precisa do servidor Next.js.

Configure no Supabase Auth as URLs permitidas `http://localhost:3000/**` e as URLs equivalentes da Vercel. Consulte [docs/local-setup.md](docs/local-setup.md).

## Patrimônio líquido

- imóveis, veículos, outros bens, financiamentos, empréstimos e outras dívidas;
- histórico automático de avaliações;
- resumo de ativos, passivos e patrimônio líquido por BRL, USD e EUR;
- arquivamento lógico e isolamento por usuário com RLS;
- valores inteiros e serviços exclusivos do servidor;
- tabelas patrimoniais independentes de contas e movimentações.

Conversão cambial, investimentos com cotação, depreciação automática e integração de bens com contas permanecem fora desta entrega.

## Investimentos

- renda fixa, ações, fundos, ETFs, fundos imobiliários, previdência e criptomoedas;
- instituição, ativo, quantidade decimal exata, custo acumulado e valor atual;
- fotografias históricas da posição e fluxos separados de aporte, resgate e renda;
- resultado total somente quando o histórico for declarado completo;
- valor atual integrado ao patrimônio, sem misturar moedas;
- RLS, arquivamento lógico e serviços exclusivos do servidor.

Cotações automáticas, integração bancária, conversão cambial e cálculo de
rentabilidade sem histórico suficiente permanecem fora da Sprint 9.

## Importação de arquivos

- CSV com autodetecção de Bradesco e Nubank, além de configuração manual;
- OFX estruturado;
- QIF de contas do Microsoft Money, com categorias sugeridas e transferências
  entre contas revisadas explicitamente;
- PDF pesquisável de Bradesco e Nubank por adaptadores versionados e testados;
- arquivo original lido em memória e descartado antes da criação do job;
- prévia com associação de conta e categoria, correção e linhas ignoradas;
- assinatura estável e duplicidades verificadas antes da confirmação;
- confirmação atômica e staging apagado ao concluir ou cancelar;
- descrição original, páginas de origem e confiança preservadas para revisão;
- fixtures anônimas e testes de datas, valores, layouts, duplicidades e rollback.

O suporte declarado é restrito aos layouts cobertos pelas fixtures anônimas;
mudanças nos documentos dos emissores exigem nova regressão. Lançamentos QIF
divididos, XLS, OCR e
categorização automática permanecem fora do escopo. Consulte
[docs/file-imports.md](docs/file-imports.md) e
[docs/pdf-imports.md](docs/pdf-imports.md).

## Qualidade

```bash
npm.cmd run check
```

## Branches

- `main`: releases estáveis;
- `develop`: integração da próxima versão;
- `feature/*`: trabalho isolado com merge para `develop`.
