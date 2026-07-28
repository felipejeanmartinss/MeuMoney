# Importação CSV, OFX e PDF pesquisável

## Fluxo

1. O usuário envia um arquivo de até 5 MB.
2. O servidor lê o conteúdo em memória, calcula SHA-256 e descarta os bytes.
3. O parser normaliza no máximo 1.000 movimentações em staging.
4. O usuário associa conta e categorias, corrige dados ou ignora linhas.
5. O banco recalcula assinaturas e duplicidades a cada alteração.
6. A confirmação explícita cria todos os lançamentos em uma transação.
7. O staging é apagado ao confirmar ou cancelar.

## CSV

A leitura automática é a opção padrão. Ela reconhece:

| Emissor | Layout testado | Preset |
| --- | --- | --- |
| Bradesco | `Data; Histórico; Docto.; Crédito; Débito; Saldo; Valor` | `bradesco-account-statement-v1` |
| Nubank | `Data, Valor, Identificador, Descrição` | `nubank-account-statement-v1` |

O detector genérico também aceita cabeçalhos inequívocos de data, descrição e
valor. Delimitador, formato da data e separador decimal são inferidos e a
amostra precisa atingir pelo menos 60% de linhas válidas. Linhas automáticas
com valor zero são descartadas porque não representam movimentação.

Quando a detecção falha, o modo manual continua disponível com:

- vírgula, ponto e vírgula, tabulação ou barra vertical;
- cabeçalho opcional e até 20 linhas iniciais ignoradas;
- posição das colunas de data, descrição e valor;
- datas `DD/MM/AAAA`, `AAAA-MM-DD` ou `MM/DD/AAAA`;
- decimal com vírgula ou ponto;
- inversão opcional do sinal.

Campos entre aspas, delimitadores dentro de campos e aspas duplicadas são
suportados.

## OFX

São aceitos documentos SGML ou XML com blocos fechados `STMTTRN`. Os campos
lidos são `DTPOSTED`, `TRNAMT`, `FITID`, `NAME` e `MEMO`.

## PDF

PDFs precisam conter texto pesquisável e corresponder a um adaptador
versionado coberto por fixture anônima:

- Bradesco, extrato de conta, layout 1;
- Nubank, extrato de conta, layout 1;
- Banco Exemplo, fixture técnica.

O parser preserva descrição original, páginas e confiança. No Bradesco, a
posição horizontal separa crédito, débito e saldo; linhas de saldo e valores
zero não são importados. No Nubank, o sinal é herdado do bloco de entradas ou
saídas e os totais do bloco não são importados.

Esses metadados servem para revisão e nunca autorizam confirmação automática.

## Duplicidades

O material da assinatura é:

```text
user_id|account_id|transaction_date|signed_amount_minor|normalized_description
```

O banco aplica SHA-256 e mantém restrição única por usuário. Isso protege
contra duplicidades no histórico, em jobs anteriores e dentro do mesmo upload.

## Privacidade e descarte

- os bytes originais não são persistidos;
- conteúdo financeiro não é registrado em logs;
- apenas dados necessários à revisão permanecem no staging;
- confirmar ou cancelar apaga o staging;
- o job retém nome saneado, hash, configuração e contadores de auditoria;
- jobs cancelados podem ser removidos definitivamente pelo próprio usuário;
- os anexos reais usados para validação local não fazem parte do repositório.

## Limitações

- não há XLS nem OCR;
- PDFs protegidos, digitalizados ou incompatíveis são rejeitados;
- mudanças de layout do emissor exigem nova fixture e versão do adaptador;
- não há categorização automática;
- transferências e compras de cartão não são inferidas do arquivo;
- duplicidades com data, valor ou descrição diferentes exigem revisão humana.
