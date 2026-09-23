# Navegação e apresentação

## Estrutura integrada

Ordem principal: Início, Check-in, Metas, Contas, Investimentos, Patrimônio,
Relatórios e Perfil.

- Desktop: barra lateral com destinos principais e opções da seção.
- Mobile: uma linha inferior com Início, Check-in, Metas, Contas e Investimentos.
  O Menu do cabeçalho disponibiliza **todas** as seções e opções secundárias.
- O Menu fecha ao escolher um destino, mudar de rota ou pressionar Esc.
  Esc devolve o foco ao controle de abertura.
- Metas, Check-in e Qualidade dos dados usam a mesma estrutura autenticada
  dos demais módulos e têm um retorno explícito no cabeçalho.
- Cotações, Benchmarks e Financiamentos têm seleção própria na navegação.
  A posição atual não é marcada simultaneamente em várias opções.

## Componentes e padrões

`AuthenticatedLayout` concentra a autenticação e a estrutura de navegação.
As rotas existentes foram preservadas. Perfil continua usando sua estrutura
própria com `AppShell`, sem duplicar o menu.

`PageHeader` reúne título, contexto curto, ações e retorno opcional.
`PageHelp` mantém orientações complementares recolhidas.
`app-page` padroniza espaçamentos, largura e tipografia das páginas principais.
Relatórios e Investimentos preservam largura adicional para suas matrizes.

As páginas e os componentes de apresentação continuam no servidor.
A navegação interativa permanece em um único componente cliente, sem novas
bibliotecas de interface nem carregamento adicional de dados no navegador.
O Check-in separa a busca de dados da apresentação testável.

## Simplificação

- Home: indicadores antes de “Sua atenção hoje”; sem subtítulos redundantes.
- Check-in: lista de revisão compacta, nota opcional recolhida e fechamento
  separado. A nota é consultada no próprio mês.
- Metas: instruções recolhidas em vez de uma coluna permanente de orientação.
- Qualidade: lista compacta; falhas de carregamento não são apresentadas como
  confirmação de que os dados estão em ordem.
- Perfil: acesso direto à Qualidade dos dados e cartões mais compactos.
- Cabeçalhos comuns em Contas, Cartões, Categorias, Lançamentos, Transferências,
  Importações, Recorrências, Orçamentos, Investimentos, Relatórios e Patrimônio.

## Cuidados de apresentação

- Não somar moedas diferentes sem conversão. O Check-in mostra a quantidade
  de faturas, sem o antigo somatório de moedas distintas.
- Não interpretar dados parciais como ausência de pendências.
- Orientações essenciais ao preenchimento permanecem junto ao controle.
- Fontes dos controles respeitam suas classes; em celulares, campos usam 16 px
  para evitar zoom automático no foco.
- Controles novos de navegação e revisão têm área de toque de pelo menos 44 px.
- Tabelas extensas conservam rolagem local; não se removem funções no celular.
- Foco visível, teclado e preferência por movimento reduzido são preservados.

## Verificação desta integração — 20/09/2026

Testes de navegação cobrem ordem, destino ativo único no mobile, opções de
investimentos e rotas privadas. Testes de renderização do Check-in cobrem
recorrências, observação opcional, carregamento parcial e moedas distintas.

A estrutura compartilhada e o componente real do Check-in foram renderizados
com dados fictícios locais, sem gravação no banco, em desktop e em 320, 390 e
768 px. Foram verificados:

- conteúdo visível, sem rolagem horizontal da página;
- menu dentro da viewport, com acesso às seções e fechamento por Esc;
- campo de observação recolhido e expansão acessível;
- controles de 44 px e campos de 16 px no celular;
- ausência de overlay de erro e de erros reportados pelo navegador.

A rota temporária de validação foi removida. As páginas privadas com os dados
reais ainda exigem teste autenticado de aceitação; não se trata de uma auditoria
completa de todas as regras financeiras ou de todos os formulários.

## Próxima etapa: produto mobile

Esta entrega prepara a base responsiva, mas não cria uma aplicação nativa nem
restringe recursos. Para a próxima etapa, definir relatórios resumidos,
prioridade das tarefas no celular e quais edições avançadas ficam no desktop.
Também validar os fluxos reais em aparelhos, teclado virtual e leitores de tela.

Benchmarks continuam aguardando séries históricas: esta revisão não habilita
comparações com taxas inexistentes.
