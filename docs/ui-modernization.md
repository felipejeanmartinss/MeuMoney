# Modernização da experiência

## Estrutura

O MeuMoney apresenta cinco destinos principais:

1. Início;
2. Contas;
3. Investimentos;
4. Patrimônio;
5. Perfil.

No desktop, a navegação fica em uma barra lateral compacta. No celular, os
destinos principais ficam na barra inferior e o menu do cabeçalho expõe as
funções secundárias da seção atual.

## Compatibilidade

As rotas anteriores permanecem acessíveis por link direto. Contas reúne
Movimentações, Recorrências, Orçamentos, Transferências, Categorias e Cartões.
Investimentos reúne Posições e Financiamentos. Perfil encaminha para
Informações pessoais, Importações e Segurança e dados.

## Regras de apresentação

- valores de moedas diferentes nunca são somados;
- transferências e pagamentos técnicos de fatura não entram no consumo;
- categorias do gráfico mensal são limitadas e o restante vira “Outras”;
- financiamentos são apenas apresentados na central de Investimentos e
  continuam pertencendo ao cadastro patrimonial;
- faturas pendentes são passivos, mas o limite do cartão não é patrimônio;
- estados vazios e erros preservam uma ação segura de recuperação;
- foco visível, navegação por teclado e alternativa textual acompanham
  controles e gráficos.

## Matriz de validação

| Tela | 390×844 | 768×1024 | 1440×900 |
|---|---|---|---|
| Navegação principal e estrutura | Validado | Validado | Validado |
| Dashboard executivo | Revisão estrutural | Revisão estrutural | Revisão estrutural |
| Central e detalhe de conta | Revisão estrutural | Revisão estrutural | Revisão estrutural |
| Recorrências | Revisão estrutural | Revisão estrutural | Revisão estrutural |
| Investimentos e financiamentos | Revisão estrutural | Revisão estrutural | Revisão estrutural |
| Patrimônio e simulador | Revisão estrutural | Revisão estrutural | Revisão estrutural |
| Perfil, importações e segurança | Revisão estrutural | Revisão estrutural | Revisão estrutural |

### Evidências e limites

A navegação foi renderizada localmente nas três resoluções. Foram verificados:

- barra inferior em 390 e 768 pixels e barra lateral em 1440 pixels;
- ausência de rolagem horizontal na página;
- contenção local de tabelas largas;
- foco visível no menu secundário;
- textos longos, valores negativos e moedas BRL e USD;
- uma listagem densa com dezoito registros;
- ausência de erros ou avisos no console do navegador.

As páginas privadas dependem de uma sessão Supabase válida. Sem credenciais de
teste locais, a validação visual completa dessas páginas permanece classificada
como revisão estrutural: compilação, tipos, testes automatizados, regras de
breakpoint e inspeção do código renderizável. Antes da aprovação do PR, execute
um smoke test autenticado nessas mesmas resoluções com dados vazios e com uma
base representativa.
