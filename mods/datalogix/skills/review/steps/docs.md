# Etapa: docs (README, /docs, CLAUDE.md, skills e guidelines)

Use o código atual e a lista "Mudanças para documentar" do progresso.

## README
Pacote:
- o que o pacote faz e para quem
- requisitos (PHP, Laravel) batendo com o composer.json
- instalação, publicação de config/migrations/views/assets, build do
  front-end se necessário, configuração mínima
- exemplo de uso rápido que funciona de verdade (confira contra o código)
- links para documentação detalhada, changelog, contribuição e
  licença, só os que existirem

Aplicação:
- o que a aplicação faz, em uma ou duas frases
- requisitos (PHP, Node, banco, Redis, extensões)
- setup local passo a passo: clonar, `.env`, dependências, chave,
  migrations e seeders, build, como rodar (servidor, fila, agendador)
- como rodar testes e formatação pelos scripts (`composer test`,
  `composer lint`, `composer format` e os do `package.json`)
- deploy: link ou resumo do processo (o detalhe vai para `/docs`)

Lib JS/TS:
- o que a lib faz e para quem
- requisitos: Node (batendo com o `engines`), `peerDependencies`,
  ambiente (Node, navegador)
- instalação com npm (e pnpm/yarn se o projeto mostra) ou, numa lib
  instalada por git, o comando `npx --allow-git=root github:...`;
  import de CSS ou plugin a registrar, se houver
- exemplo de uso rápido que funciona de verdade, em ESM ou, numa lib
  só com `bin`, o comando (confira contra o código; a etapa `pack` o
  executa)
- links para documentação detalhada, changelog, contribuição e
  licença, só os que existirem

Aplicação JS/TS:
- o que a aplicação faz, em uma ou duas frases
- requisitos (Node, gerenciador, API ou serviços que consome)
- setup local: clonar, `.env` a partir do `.env.example`,
  dependências, como rodar (`dev`), build e `preview`/`start`
- como rodar testes, lint e typecheck pelos scripts do `package.json`
- deploy: link ou resumo do processo (o detalhe vai para `/docs`)

Em todos: corrija ou remova trechos desatualizados.

Badge do `.github/workflows/datalogix.yml` no README (item "sugestão",
só se ela já existir): a badge nativa do GitHub mostra o `name` do
workflow, `datalogix`, e o texto entre colchetes só é o alternativo.
Sugira a do shields.io, que aceita rótulo, com `ci` nos dois lugares,
pois ela fica vermelha por qualquer job, não só pelos testes:
`[![ci](https://img.shields.io/github/actions/workflow/status/<owner>/<repo>/datalogix.yml?branch=main&label=ci)](https://github.com/<owner>/<repo>/actions/workflows/datalogix.yml)`.
Não sugira criar a badge num README sem ela.

## Documentação detalhada
- pacote: todo comando Artisan, opção de config, evento, Contract e
  ponto de extensão público documentado
- aplicação: arquitetura geral, deploy, filas e agendamento, integrações
  externas, decisões importantes; Nuxt e Next: também o modo de
  renderização e o cache de cada parte do site
- lib JS/TS: cada entrada do `exports`, com as funções, opções e
  padrões, os erros lançados e os comandos do `bin`
- se o README passar de ~300 linhas ou tiver mais de ~6 seções de
  referência, mova o detalhe para `/docs`, um arquivo por assunto, com
  `docs/README.md` como índice; o README fica com visão geral,
  instalação/setup, uso rápido e links
- se `/docs` já existir, atualize em vez de recriar e mantenha a
  estrutura, a menos que eu aprove mudar
- links relativos, sem nenhum quebrado
- idioma: seção 11 do `SKILL.md`

## CLAUDE.md
- reflete o projeto atual: domínio, stack (versões, runner de testes,
  ferramentas), comandos de teste e formatação, o que não tocar
- coerente com as "Decisões do projeto" e com o que a revisão mudou
- sem repetir o README nem as convenções que já vêm de
  `datalogix/workflows`

## Skills e guidelines
- distribuídas pelo pacote ou pela lib (`resources/boost/` ou toda
  outra pasta com `SKILL.md` que um `plugin.json`, um
  `marketplace.json` ou o `files` entrega, ex.: `mods/<nome>/skills/`;
  liste com `git ls-files '*SKILL.md'`): descrevem a API atual, com
  classes, componentes, opções e comandos que existem de verdade e
  exemplos que funcionam; nada removido ou renomeado na revisão
- skills só de prompt, numa lib em que elas são o produto: cada comando
  roda como está escrito (confira numa cópia fora do projeto), cada
  arquivo ou skill citada existe, e as regras não se contradizem
- do projeto (`.claude/skills`, `.claude/commands`, `.ai/skills`,
  `.ai/guidelines`): refletem as "Decisões do projeto"
- cada `SKILL.md` com `name` e `description` claros, dizendo quando
  usar; conteúdo enxuto, sem repetir o README
- nada que contradiga outra skill, guideline ou o `CLAUDE.md`

## Guias do Laravel Boost (só pacote Laravel)
Um pacote leva guias ao Boost de quem o instala, sem depender dele, e
o `php artisan boost:install` os carrega:
- `resources/boost/guidelines/core.blade.php`: carregado sempre, curto:
  o que o pacote faz, convenções e estrutura exigidas, e como usar os
  principais recursos, com exemplos em `@verbatim` e `<code-snippet
  name="..." lang="php">`
- `resources/boost/skills/<nome>/SKILL.md`: carregado sob demanda, com
  `name` e `description` no frontmatter, para uma tarefa com passos
  próprios (ex.: criar um recurso do pacote)

Sem `resources/boost/`: item "sugestão" que propõe os arquivos, com o
texto de cada um no relatório, tirado da API pública atual. Um pacote
pequeno, sem convenção própria, fica só com o `core.blade.php`; não
proponha skill que repita o guia. Com a pasta, confira contra o código,
como em "Skills e guidelines", e que o `.gitattributes` não a exclua.

## Formatação dos documentos
Vale para README, `/docs`, CHANGELOG, UPGRADE, CONTRIBUTING e guias, com
um item "sugestão" por arquivo, juntando os ajustes:
- títulos: um só `#`, sem pular nível, no mesmo estilo em todo o arquivo
- tabelas com as colunas alinhadas, inclusive o separador
- listas com o mesmo marcador e o mesmo recuo; texto de itens paralelos
  na mesma forma
- blocos de código com a linguagem na cerca, e linha em branco em volta
  de títulos, listas, tabelas e blocos
- badges juntas, logo abaixo do título, sem espaço a mais entre elas
- largura de linha igual à do resto do arquivo, sem uma linha muito mais
  longa que as vizinhas; links relativos que existem

Com o Prettier cobrindo Markdown, ele resolve o que alcança: rode-o e
aponte só o resto. Com `*.md` no `.prettierignore`, ajuste à mão, sem
reformatar o arquivo inteiro. Cuidado em skills e guias, onde a quebra
de uma lista pode mudar o sentido.

## Ao aplicar
Marque como "documentado" na lista "Mudanças para documentar" o que
foi coberto; não apague: o fechamento usa a lista.
