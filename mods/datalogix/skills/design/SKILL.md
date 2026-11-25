---
name: design
description: "Padrões de interface da datalogix para criar ou alterar telas, páginas, layouts e componentes em projetos Laravel (TALLKit, Livewire, Blade, Inertia com Vue ou React) e JS/TS: reaproveita os componentes e o tema do projeto, sugere a direção visual (cores, fontes, escala, espaçamento, estrutura) quando o projeto não tem uma, revisa briefings de design e confere o resultado no navegador. Use ao criar, mudar ou ajeitar o visual de uma tela, formulário, tabela, view, CSS ou responsividade, ou para definir ou revisar o estilo de um projeto; nesses casos, use-a antes da `frontend-design`, que ela própria aciona. Não use para mudanças só de back-end, lógica JS sem efeito visual nem para revisar o front-end do projeto inteiro (etapa `frontend` do `/datalogix:review`)."
argument-hint: "[help | <tela ou componente a criar ou alterar>]"
---

# /datalogix:design — telas e componentes

Argumentos: $ARGUMENTS
- Vazio: a tela ou o componente do pedido da conversa.
- `help`: explicar a skill sem executar nada (seção 7).
- Texto: a tela ou o componente a criar ou alterar.

Respostas às seções `## Pendências`, em todos os passos:
- Cada caixa vale como chega na resposta: marcada é sim;
  desmarcada, não faça aquilo.
- Resposta só em texto, sem a lista: nenhuma caixa conta como
  marcada, salvo as que o texto citar.

Esta skill cuida de construir a tela. A revisão de segurança,
acessibilidade e CSS de um projeto inteiro é a etapa `frontend` do
`/datalogix:review`; não a repita aqui.

## 1. Stack
Descubra antes de escrever qualquer view, sem perguntar o que os
arquivos respondem:
- `composer.json`: `datalogix/tallkit`, `livewire/livewire`,
  `filament/filament`, `inertiajs/inertia-laravel`.
- `package.json`: `vue`, `react`, `nuxt`, `next`, `tailwindcss`
  (e a versão: o Tailwind 4 configura o tema no CSS, com `@theme`;
  o 3, em `tailwind.config.js`), `alpinejs`.
- Num pacote com views para mais de um stack (ex.: Livewire e
  Inertia com Vue e React), mude todas as variantes da mesma tela,
  ou diga quais ficaram de fora.
- O `CLAUDE.md` e o `README.md` do projeto, só como contexto:
  identidade visual, componentes próprios, regras de layout.
- Os componentes que já existem: `resources/views/components/`,
  `app/View/Components/`, `app/Livewire/`, `resources/js/components/`
  (ou `Components/`), `components/` num projeto JS.

## 2. Reaproveitar antes de criar
- Com `datalogix/tallkit`: use os componentes dele (`<tk:...>`) em
  vez de HTML próprio. A documentação de cada um está em
  `vendor/datalogix/tallkit/docs/<componente>.md`, e o índice no
  `README.md` do pacote, quando presente; leia só a do componente
  que vai usar, mais `shared-props.md` e `colors.md` quando
  precisar. Não publique as views do TALLKit para mudar um detalhe:
  use as props, os slots e as classes. Se faltar um componente que
  serviria a outros projetos, diga que ele cabe no TALLKit, em vez de
  criar uma cópia local.
- Sem TALLKit: use os componentes que o projeto já tem; crie um novo
  só quando o mesmo trecho se repetir ou a tela pedir um, no padrão
  dos que existem (pasta, nome, props).
- Nunca adicione dependência (composer ou npm), biblioteca de
  componentes nem fonte externa sem perguntar; uma fonte da direção
  aprovada no passo 3 já foi perguntada.

## 3. Identidade visual
A skill não tem cores nem fontes próprias: cada projeto tem a sua
direção, que ela segue ou ajuda a definir.
- Projeto com direção (uma seção `## Design` no `CLAUDE.md`, tokens
  do Tailwind, variáveis CSS, cores do TALLKit ou telas prontas):
  siga-a. Não invente paleta, fonte nem espaçamento; cor nova só
  como token do tema, nunca um valor solto numa classe
  (`bg-[#3b82f6]`). Copie o padrão das telas vizinhas: cabeçalho,
  largura do conteúdo, posição dos botões, tom dos textos.
- Projeto sem direção, ou pedido de um visual novo: antes de
  escrever código, sugira uma direção a partir do assunto, do
  público e do objetivo do produto, nunca de um padrão genérico:
  - cores em HEX: fundo, texto, texto de apoio e uma cor de
    destaque, dizendo onde ela entra, com o contraste de cada par
    calculado (mínimo 4.5:1 para texto);
  - um par de fontes (títulos e texto) e a escala tipográfica, com
    tamanhos e pesos;
  - espaçamento entre seções no desktop e no celular;
  - a estrutura da tela em blocos e como ela fica no celular;
  - interação: hover, foco e o único momento de movimento, se
    houver.
  Para a direção estética, siga também a skill `frontend-design`,
  se estiver disponível.
- Briefing de design trazido pelo usuário: mantenha as escolhas
  dele; aponte e corrija só o que cair em clichê, falhar no
  contraste ou faltar (celular, acessibilidade, estados), dizendo o
  motivo de cada troca. Quando ele der opções (ex.: duas cores de
  destaque), escolha uma e diga qual.
- Evite o que denuncia design gerado por IA: off-white creme com
  serifa de alto contraste, Playfair Display com Inter, degradê roxo
  ou neon, bento grid e hover com escala em todo card, uma palavra
  do título destacada em outra cor ou itálico, rótulos em caixa
  alta, numeração 01/02/03 sem sequência real, animação de entrada
  em cada seção.
- Mostre a direção e termine com uma seção `## Pendências`, com
  `- [ ] (recomendo) Implementar a tela com esta direção` e
  `- [ ] (recomendo) Gravar a direção numa seção Design do CLAUDE.md`,
  para valer nas próximas telas. Só implemente depois da resposta,
  e só grave no `CLAUDE.md` se marcado; é a única escrita da skill
  nele.

## 4. Padrões de tela
- Formulários: `label` ligado a cada campo, erro de validação ao lado
  do campo e um resumo no topo em formulários longos, botão de envio
  desabilitado e com indicação durante o envio, valores mantidos
  depois de um erro, campos obrigatórios indicados.
- Listas e tabelas: filtros e busca acima, paginação, ordenação onde
  fizer sentido, estado vazio com texto e, quando houver, a ação de
  criar; em tela pequena, rolagem horizontal ou layout em cartões.
- Estados: carregando, vazio e erro em toda tela que busca dados.
- Retorno das ações: toast ou alerta depois de salvar ou excluir;
  confirmação antes de uma ação destrutiva.
- Textos em pt-BR, salvo outro idioma no projeto; com tradução
  (`lang/`, `__()`), nenhum texto fixo na view.
- Responsividade a partir do celular: nada cortado ou sobreposto a
  375px de largura; alvos de toque de pelo menos 44px.
- Acessibilidade: contraste suficiente, foco visível, botões de ícone
  com `aria-label`, títulos em ordem, `alt` nas imagens.
- Modo escuro só se o projeto já tiver; nesse caso, toda cor nova
  com a variante escura.

## 5. Conferir no navegador
Depois de implementar:
- Com as ferramentas do Chrome DevTools (MCP `chrome-devtools`)
  disponíveis: a URL vem do `APP_URL` do `.env` (leia só essa
  linha, nunca o arquivo inteiro) ou do servidor de desenvolvimento
  do projeto; se ele não estiver rodando, diga como iniciar e não o
  inicie. Abra a tela, tire screenshot a 1280px e a 375px de largura
  e leia o console. Tela atrás de login sem sessão aberta no
  navegador: diga e não preencha credenciais.
- Corrija o que estiver claramente quebrado (sobreposição, overflow,
  erro no console causado pela mudança) e confira de novo, no máximo
  duas rodadas; o resto vai para as pendências.
- Sem essas ferramentas: liste o que conferir à mão (as duas larguras,
  o console, os estados do passo 4).

## 6. Fim
Mostre os arquivos alterados e o resultado da conferência (com os
screenshots, se houver). Rode o formatador do projeto nos arquivos
alterados e os testes da área, se existirem. Não faça commit; para
o commit, sugira `/datalogix:commit`.

Termine com uma seção `## Pendências`, sem ela quando não houver
nada a propor:
- uma `- [ ] <ajuste>` por problema visto e não corrigido,
  desmarcada, com o arquivo indentado logo abaixo;
- sem as ferramentas do Chrome DevTools, `- [ ] Conferir a tela no
  navegador a 1280px e a 375px de largura`, para o usuário fazer;
- um componente que caberia no TALLKit, `- [ ] (avalie) Abrir uma
  issue no TALLKit para o componente que faltou`.

## 7. Help
Com `help`, explique em poucas linhas, sem executar nada: o que a
skill faz, que ela também carrega sozinha ao criar ou alterar uma
tela, e o fluxo (stack, reaproveitar componentes, identidade
visual seguida ou sugerida, padrões de tela, conferência no
navegador, sem commit).
