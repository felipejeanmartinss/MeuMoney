# Importação de financiamentos

## Fluxo

1. O servidor valida um PDF pesquisável de até 5 MB.
2. Um adaptador versionado reconhece banco, documento e layout.
3. O arquivo é extraído em memória e descartado; seus bytes não são salvos.
4. Cabeçalho, parcelas e amortizações extraordinárias entram em staging.
5. O usuário revisa o nome, o tipo e o contexto do passivo.
6. A confirmação cria contrato, cronograma e passivo patrimonial em uma única transação.

Nenhum lançamento bancário é gerado automaticamente. O cronograma importado é
uma representação do contrato e serve aos indicadores de financiamento.

## Suporte atual

- Bradesco — Extrato Financeiro de financiamento, layout v1, coberto por fixture anônima.

Outros bancos exigem amostras anonimizadas representativas e testes de
regressão antes de serem adicionados ao registro de adaptadores. PDF protegido,
digitalizado ou sem texto pesquisável recebe erro amigável. OCR está fora do
escopo inicial.

## Indicadores

- valor pago;
- principal amortizado;
- juros pagos;
- seguros, tarifas e encargos pagos;
- amortizações extraordinárias com recursos próprios;
- amortizações extraordinárias com FGTS;
- parcelas pagas e a vencer;
- saldo devedor e sua data-base.

Dinheiro é persistido em unidades menores inteiras. Taxas e fatores mantêm
precisão decimal. Dados cadastrais encontrados no documento não são
persistidos e conteúdo financeiro não deve aparecer em logs.

## Migration

Aplicar cumulativamente antes do deploy:

`supabase/migrations/20260815135005_card_cash_financing_imports.sql`
