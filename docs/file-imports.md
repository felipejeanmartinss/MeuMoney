# Importação CSV, OFX, QIF e PDF pesquisável

## Fluxo

1. O usuário envia um arquivo de até 5 MB.
2. O servidor lê o conteúdo em memória, calcula SHA-256 e descarta os bytes.
3. O parser normaliza no máximo 5.000 movimentações em staging.
4. O usuário associa conta e categorias, corrige dados ou ignora linhas. Todas as linhas ignoradas mantêm seu estado durante as revisões seguintes, deixam de exigir revisão e não participam da confirmação; ao reincluir uma linha, ela é avaliada novamente.
5. O banco recalcula assinaturas e duplicidades a cada alteração.
6. A confirmação explícita cria todos os lançamentos em uma transação.
7. O staging é apagado ao confirmar ou cancelar.

## CSV

A leitura automática é a opção padrão. Ela reconhece:

| Emissor | Layout testado | Preset |
| --- | --- | --- |
| Bradesco | metadados opcionais, seguidos por `Data; Histórico; Docto.; Crédito; Débito; Saldo` | `bradesco-account-statement-v1` |
| Nubank | `Data, Valor, Identificador, Descrição` | `nubank-account-statement-v1` |

O detector examina as primeiras 20 linhas para localizar o cabeçalho real e
aceita tanto uma coluna única de valor quanto colunas separadas de crédito e
débito. O detector genérico também aceita cabeçalhos inequívocos de data,
descrição e valor. Delimitador, formato da data e separador decimal são inferidos e a
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

## QIF

São aceitas seções de conta `Bank`, `Cash` e `CCard`. O parser suporta datas
do Microsoft Money como `31/01'2026`, anos com dois ou quatro dígitos e valores
com ponto ou vírgula decimal. Na ausência de metadado regional, datas ambíguas
seguem o padrão brasileiro dia/mês.

O nome original da categoria é preservado como sugestão. O trecho após o
último `:` pode ser associado automaticamente a uma categoria existente com
mesma natureza; a tela também permite aplicar um mapeamento a todas as linhas
de mesmo nome.

Categorias entre colchetes, como `[Poupança]`, nunca viram receita ou despesa.
Elas exigem associação a outra conta ativa, da mesma moeda, e são confirmadas
como transferências. Valor negativo significa saída da conta representada pelo
arquivo; valor positivo significa entrada. A assinatura usa as duas contas em
ordem estável, data e valor absoluto, evitando reimportação pelo outro lado.

Lançamentos QIF divididos (`S`, `E` e `$`) permanecem em erro para revisão e
não são achatados silenciosamente.

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
Transferências usam uma assinatura própria, independente da direção em que as
duas contas aparecem.

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
- o QIF apenas sugere categorias por nome; a decisão continua explícita;
- transferências são reconhecidas somente pela sintaxe QIF `[Conta]`;
- compras de cartão não são inferidas do arquivo;
- lançamentos QIF divididos ainda não são suportados;
- duplicidades com data, valor ou descrição diferentes exigem revisão humana.
