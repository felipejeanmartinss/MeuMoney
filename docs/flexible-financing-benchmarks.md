# Financiamentos flexíveis e benchmarks

Branch: `feature/flexible-financing-benchmarks`.

## Disponibilização

1. Aplicar em ambiente de teste a migration `20260921235122_flexible_financing_and_benchmarks.sql` pelo fluxo habitual de migrations do projeto, revisando previamente as pendências. Ela adiciona campos de amortização/vínculo, a gravação transacional e a tabela de referências. Não remove contratos ou lançamentos.
2. Publicar a branch no ambiente de teste. Sem a migration, a edição do fluxo ficará indisponível; publicar somente o código não conclui a entrega.
3. Validar um contrato manual, uma edição e uma amortização. Conferir os valores do banco antes de confirmar a prévia.
4. Carregar os benchmarks com o comando administrativo abaixo. Nenhuma carga nem migration remota foi executada durante o desenvolvimento.

## Índices no Supabase

`investment_benchmark_months` contém uma linha por `(code, reference_month)`, com `return_percent`, `source` e `synced_at`. Não pertence a um usuário: é uma referência pública compartilhada, separada das posições pessoais. RLS permite leitura autenticada; somente `service_role` pode gravar. A chave secreta nunca participa do bundle do navegador.

Fontes: [SGS do Banco Central](https://www3.bcb.gov.br/sgspub/), [Selic mensal no portal BCB](https://dadosabertos.bcb.gov.br/dataset/4390-taxa-de-juros---selic-acumulada-no-mes), [índices B3](https://www.b3.com.br/pt_br/indices/).

O script consulta CDI, Selic, IPCA e dólar. Taxas já mensais não são divididas por 12. Dólar usa a razão entre fechamentos PTAX consecutivos. A leitura valida tipos, duplicações, meses e cobertura antes de fazer um único upsert idempotente. Falha de rede ou mês ausente interrompe a carga sem substituir dados por zero.

```powershell
# Consultar e validar, SEM gravar; nem precisa de credenciais.
node scripts/sync-investment-benchmarks.mjs --from 2026-01 --to 2026-03 --dry-run

# Gravar no ambiente apontado pelo .env.local após conferir seu projeto.
# Usa NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY somente no processo local.
npm run benchmarks:sync -- --from 2020-01 --to 2026-08
```

Para Ibovespa e IFIX, usar histórico mensal da B3 ou fornecedor autorizado e verificar suas condições de uso. A integração não presume uma API pública irrestrita. O script aceita `--b3-json caminho.json`, com uma lista de objetos:

```json
[{ "code": "ifix", "reference_month": "2026-01-01", "return_percent": 1.23, "source": "Identificação da fonte autorizada" }]
```

Esse número é apenas exemplo de formato, **não uma cotação real**. Sem arquivo, os dois índices permanecem sem referência. Uma série incompleta nunca libera comparação parcial silenciosa.

A primeira carga pode cobrir todo o histórico utilizado. Depois, recomendamos uma execução administrativa diária reconsultando os últimos três meses encerrados, pois séries podem ser revisadas e o IPCA é divulgado posteriormente. Não foi instalado agendamento nesta feature. A execução deve registrar falhas e manter os dados anteriores.

## Comparações

A seleção pode ser um ativo ou uma classe completa, incluindo posições arquivadas. Nesta etapa, somente BRL e meses encerrados. Todas as posições precisam de avaliações em cada fechamento mensal e histórico marcado como completo. A tela explica qual ativo/data impede o cálculo. Para ativos sem posição em uma extremidade, registre a avaliação correta; não se assume valor zero automaticamente.

O método é Dietz modificado mensal com composição dos resultados. Contribuições e resgates não contam como ganho/perda; rendimentos distribuídos entram no retorno. Valores monetários permanecem em centavos inteiros. A diferença para o benchmark aparece em pontos percentuais; o retorno real desconta o IPCA composto do mesmo período.

## Verificação reproduzível

- `npm run check`: lint, tipos, 345 testes e compilação.
- `scripts/verify-financing-migration.mjs`: executa as migrations reais de financiamento em PostgreSQL isolado (PGlite), sem Supabase remoto. Requer PGlite instalado separadamente; `PGLITE_MODULE_PATH` pode apontar para seu `dist/index.js`. Testa proprietário, permissões, conflitos, rollback, vínculos, preservação de campos legados e exclusão do lançamento vinculado.
- `node scripts/verify-financing-ui.mjs`: fixture local dos componentes reais em `127.0.0.1:4317`, com 360 parcelas, `/new` e `/quotes`. As ações são substituídas por stubs: não serve para comprovar gravação real. Encerrar o processo ao terminar.
- Banco de teste: confirmar um vínculo, editar a parcela, desfazer o vínculo e verificar que o lançamento na conta não mudou. Tentar salvar a mesma versão em duas abas e conferir o aviso de conflito.

## Limites conhecidos

- A projeção nominal não inclui correções de indexador ou fórmulas específicas do banco. As células continuam editáveis para refletir o extrato real.
- A tabela extensa tem rolagem interna; não é um redesenho completo do fluxo mobile.
- Não há sincronização automática de Ibovespa/IFIX, nem histórico sintético para preencher lacunas de investimentos.
- Importadores legados e suas tabelas permanecem para preservar contratos existentes e compatibilidade histórica; novas importações não são oferecidas na interface.
