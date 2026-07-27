# Importação assistida por PDF

## Suporte declarado

| Banco | Documento | Layout | Fixture de regressão | Situação |
| --- | --- | --- | --- | --- |
| Banco Exemplo (fixture) | Extrato de conta | 1 | `anonymous-fixture-bank-statement-v1.pdf` | Apenas validação técnica |

`Banco Exemplo` é fictício. Nenhum banco real é suportado nesta entrega porque
o repositório não contém PDFs anonimizados representativos de bancos reais.

## Contrato dos adaptadores

Cada adaptador implementa `PdfImportAdapter` e declara:

- identificador estável;
- banco;
- tipo de documento;
- versão do layout;
- detecção determinística do documento;
- normalização de data, descrição e valor inteiro;
- descrição original;
- páginas de origem;
- confiança entre zero e um.

Um novo adaptador só deve entrar no registro quando sua fixture anônima cobrir
o layout declarado e houver teste de regressão com datas, valores, páginas e
descrições esperadas.

## Fluxo

1. O Server Action recebe o PDF e aplica os mesmos limites do pipeline existente.
2. O extrator recupera somente texto pesquisável, com a página de cada trecho.
3. O registro escolhe um adaptador compatível; layouts desconhecidos são rejeitados.
4. As linhas entram no mesmo staging usado por CSV e OFX.
5. O usuário associa conta e categorias, corrige ou ignora linhas.
6. A confirmação explícita e atômica cria os lançamentos.
7. Os bytes do PDF são descartados antes da criação do job; o staging é apagado ao confirmar ou cancelar.

## Erros esperados

- **Protegido:** o arquivo exige senha; deve ser exportada uma cópia sem proteção.
- **Digitalizado:** não há texto pesquisável suficiente; OCR não está disponível.
- **Incompatível:** o arquivo não é um PDF válido ou usa recursos que o extrator não processa.
- **Layout não suportado:** existe texto, mas nenhum adaptador testado reconhece o documento.

As mensagens não incluem conteúdo financeiro nem detalhes internos do parser.

## Limitações

- OCR e PDFs compostos somente por imagens estão fora do escopo;
- senhas não são solicitadas, armazenadas ou registradas;
- tabelas complexas podem exigir um adaptador específico por versão de layout;
- uma alteração visual do emissor exige nova fixture e regressão;
- confiança não substitui revisão humana;
- não há suporte genérico ou presumido para qualquer banco real.
