# Importação assistida por PDF

## Matriz de suporte

| Banco | Documento | Layout | Fixture | Situação |
| --- | --- | --- | --- | --- |
| Bradesco | Extrato de conta | 1 | `anonymous-bradesco-account-statement-v1.pdf` | Suportado |
| Nubank | Extrato de conta | 1 | `anonymous-nubank-account-statement-v1.pdf` | Suportado |
| Banco Exemplo | Extrato fictício | 1 | `anonymous-fixture-bank-statement-v1.pdf` | Validação técnica |

O suporte vale somente para os layouts cobertos pelas fixtures e pelos testes.
Uma mudança visual relevante exige nova versão do adaptador.

## Contrato dos adaptadores

Cada `PdfImportAdapter` declara identificador, banco, documento e versão. Sua
detecção usa marcadores estruturais do emissor, evitando selecionar um banco
apenas porque seu nome aparece na descrição de uma movimentação.

O extrator preserva texto, página e posição `x/y`. Isso permite:

- distinguir crédito, débito e saldo no extrato Bradesco;
- manter a data enquanto o emissor omite repetições;
- herdar o sinal dos blocos de entradas e saídas do Nubank;
- juntar descrições quebradas em mais de uma linha;
- excluir totais e saldos que não são movimentações.

O resultado contém valor inteiro, data, descrição normalizada, descrição
original, páginas e confiança.

## Segurança do fluxo

1. O Server Action recebe no máximo 5 MB.
2. O extrator trabalha exclusivamente no servidor e sem OCR.
3. Um adaptador reconhecido produz staging, nunca lançamentos diretos.
4. O usuário revisa conta, categorias, datas, descrições e valores.
5. A confirmação explícita e atômica cria os lançamentos.
6. O arquivo original é descartado antes da criação do job.
7. O staging é apagado ao confirmar ou cancelar.

## Erros esperados

- **Protegido:** exportar uma cópia sem senha.
- **Digitalizado:** não há texto pesquisável; OCR está fora do escopo.
- **Incompatível:** o arquivo não pôde ser processado.
- **Layout não suportado:** o PDF tem texto, mas não corresponde a uma fixture.

Mensagens públicas não incluem conteúdo financeiro nem detalhes internos.

## Regressão

Cada banco suportado possui fixture totalmente anônima e teste de:

- seleção do adaptador;
- datas e sinais;
- valores em unidades monetárias inteiras;
- descrições multilinha;
- páginas de origem;
- exclusão de saldos e totais.
