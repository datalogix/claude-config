---
name: review
description: Revisão de pacotes e aplicações Laravel, libs JS/TS e aplicações Nuxt/Next, um passo por vez (git, CI, dependências, código, recursos, front-end, produção, docs, instalação), com progresso fora do projeto e testes 100%. Use para revisar ou auditar um projeto inteiro, uma etapa, uma pasta ou um aspecto (docs, naming, tests, deps).
argument-hint: "[help [<argumento>] | status | report [<modo>] | reset [<modo>] | <modo> [<pasta>] | <etapa> | <pasta>]"
disable-model-invocation: true
---

# /datalogix:review — revisão do projeto

Argumentos: $ARGUMENTS
- Vazio: revisão completa; retomar de onde parou (ou começar do início).
- `help`: explicar o comando sem executar nada (seção 9).
  `help <argumento>` explica em detalhe só aquele argumento.
- `status`: mostrar perfil, andamento, perguntas pendentes e o
  próximo passo.
- `report`: analisar tudo e gerar um relatório, sem alterar nada
  (`modes/report.md`). `report <modo>` faz o mesmo só para aquele modo.
- `reset`: confirmar comigo e apagar o progresso deste projeto
  (`reset <modo>` apaga só o progresso daquele modo).
- Modos de foco, cada um revisa SÓ aquele aspecto:
  - `docs`: documentação, incluindo docblocks (`modes/docs.md`)
  - `naming`: nomenclatura (`modes/naming.md`)
  - `tests`: testes (`modes/tests.md`)
  - `deps`: revisar e atualizar composer e package.json (`modes/deps.md`)
- Uma etapa avulsa da revisão completa, pelo nome do arquivo em `steps/`
  (ex.: `git`, `ci`, `composer`, `npm`, `resources`, `frontend`,
  `install`, `pack`, `production`). Etapas de outro tipo de projeto
  são recusadas com aviso. Nos tipos JS, `code` e `production` usam
  `steps/code-js.md` e `steps/production-js.md`.
  `http` e `jobs` não são etapas: são checklists extras que a etapa
  `code` aplica nas pastas certas de uma aplicação. `docs` é sempre o
  modo; o passo 1 dele aplica `steps/docs.md`, o mesmo checklist da
  etapa `docs` da revisão completa.
- Um caminho (`src/Actions`, `resources/views`): revisão completa só
  dessa pasta. Com um modo (`naming src/Actions`), o modo só nessa pasta.

## 1. Arquivos de apoio
Ficam na pasta desta skill (`${CLAUDE_SKILL_DIR}`).
Caminhos abaixo são relativos a ela; passe-os absolutos aos subagentes.
- `types/package.md` / `types/application.md` / `types/library.md` /
  `types/web-app.md`: regras do tipo de projeto. Leia SÓ o do tipo
  detectado, uma vez por sessão.
- `steps/<etapa>.md`: checklist de cada etapa. Leia só a etapa da vez.
- `modes/<modo>.md`: instruções de cada modo. Leia só o modo pedido.
- `templates/LICENSE`: modelo de licença dos pacotes (etapa `composer`).
Não leia arquivos que o passo atual não usa. Se um arquivo citado não
existir, pare e me avise.

Precedência: regras do projeto (`CLAUDE.md`, skills e guidelines do
projeto) > arquivo do tipo > arquivo da etapa/modo > este arquivo.

## 2. Reconhecer o projeto
Se o "Perfil do projeto" no progresso não existir, ou se `composer.json`
ou `package.json` mudou desde o commit registrado nele, ou surgiram
skills ou tags novas, descubra e registre:
- **Tipo**:
  - pacote Laravel (`types/package.md`): tem `extra.laravel` no
    composer.json, ou `type: library`
  - aplicação Laravel (`types/application.md`): tem `artisan` e
    `bootstrap/app.php`
  - aplicação Nuxt/Next (`types/web-app.md`): tem `nuxt.config.*` ou
    `next.config.*` na raiz, sem `composer.json`
  - lib JS/TS (`types/library.md`): tem `package.json`, sem
    `composer.json` nem config de Nuxt/Next, com `exports`, `main` ou
    `module` e sem `private: true`
  Na dúvida (monorepo com workspaces, app Vite sem framework, nenhum
  dos quatro), pergunte. Depois leia o arquivo do tipo e faça o
  reconhecimento extra que ele pede (estágio, requisitos de testes).
  Lib JS/TS e aplicação Nuxt/Next são os **tipos JS**; pacote e
  aplicação Laravel, os **tipos Laravel**.
- Tipos Laravel: versões de PHP e Laravel suportadas/em uso. Tipos JS:
  versão do Node (`engines`, `.nvmrc`/`.node-version`), do TypeScript
  e do framework (Nuxt, Next, Vue, React).
- **Testes PHP** (só tipos Laravel): o padrão é o Pest.
  - Pest instalado (`pestphp/pest` no composer.json e `vendor/bin/pest`
    existindo): use o Pest. Senão, PHPUnit (`vendor/bin/phpunit`), com
    os requisitos do arquivo do tipo, e aponte a migração para Pest
    como item "sugestão" (com `pestphp/pest-plugin-drift`, que converte
    os testes); nunca converta sem aprovação.
  - Sem runner: item "importante" que oferece
    `composer require --dev pestphp/pest pestphp/pest-plugin-laravel
    --with-all-dependencies` numa aplicação, ou só `pestphp/pest` num
    pacote (o Testbench já basta), e `vendor/bin/pest --init`, só se eu
    aprovar.
  - Comando: script `test` do composer.json se existir; senão
    `php artisan test` numa aplicação e o binário num pacote, como o
    CI de `datalogix/workflows`.
  - Todo teste novo no estilo do runner em uso: Pest (`it()`/`test()`,
    `expect()`) ou classes PHPUnit estendendo o `TestCase` do projeto.
    Nunca misture runners; converter só pela migração aprovada.
- **Testes JS/TS** (com JS/TS próprio; nos tipos JS, sempre): o
  padrão é o Vitest.
  - Vitest instalado: use-o. Jest instalado: use o Jest e aponte a
    migração para Vitest como item "sugestão"; nunca converta sem
    aprovação.
  - Sem runner: item "importante" que oferece instalar o Vitest pelo
    gerenciador do projeto (ex.: `npm i -D vitest`), só se eu aprovar.
  - Comando: script `test` do `package.json` se existir; senão
    `vitest run` (ou `jest`).
- **Ferramentas de qualidade**: nos tipos Laravel, Pint,
  PHPStan/Larastan, Rector (em `vendor/bin` e no composer.json, com a
  versão do Pint). Use só as que existirem; não instale.
  Pint (tipos Laravel), e ESLint + Prettier se houver JS/TS próprio,
  são obrigatórios: registre no perfil os que faltam (viram item nas
  etapas `composer` e `npm`, ou `frontend` se houver JS/TS sem
  `package.json`).
- **Pastas**: nos tipos Laravel, código (`src/` ou `app/`); recursos
  na raiz (`config/`, `database/`, `routes/`, `lang/`, `stubs/`). Nos
  tipos JS, as pastas que o arquivo do tipo lista para cada etapa.
  Em todos, front-end (Blade, Vue, JSX, CSS, JS, TS em `resources/`,
  `stubs/`, `app/`, `components/` ou outra pasta), registrando a stack
  (Livewire, Alpine, Tailwind, Vite, Inertia, TypeScript), o gerenciador
  pelo lockfile, os scripts do `package.json`, as ferramentas (Vitest/
  Jest, Playwright/Cypress, ESLint, Prettier, Stylelint, `tsc`) e o que
  é gerado e deve ser ignorado (`public/build`, `dist/`, `.min.*`,
  `.nuxt/`, `.output/`, `.next/`).
- **Skills e guidelines**:
  - `.claude/skills/*/SKILL.md`, `.claude/commands/*.md` (Claude Code)
  - `.ai/skills/*/SKILL.md`, `.ai/guidelines/*` (Laravel Boost, do projeto)
  - `resources/boost/skills/*/SKILL.md`, `resources/boost/guidelines/*`
    (Laravel Boost, distribuídas por um pacote)
  Leia só o frontmatter (`name`, `description`) e classifique:
  - **Ferramenta da revisão** (`.claude/`, `.ai/`): mapeie cada uma para
    as etapas em que se aplica, pela descrição. Se não estiver claro,
    pergunte.
  - **Produto** (`resources/boost/`): revisado na etapa de documentação.
  - Mesma skill em `.claude/skills` e `.ai/skills`: a de `.ai/` é a fonte.
  Mostre no perfil: skill · origem · etapas.
- **Arquivos de comunidade da organização**: com remoto no GitHub,
  veja se `<owner>/.github` existe e é público (`gh api
  repos/<owner>/.github --jq .private`) e liste, na raiz dele, em
  `.github/` e em `docs/` (`gh api repos/<owner>/.github/contents/
  <pasta>`), os que o GitHub usa como padrão nos repositórios da
  organização: `FUNDING.yml`, `CODE_OF_CONDUCT.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `GOVERNANCE.md`,
  `ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE.md` e
  `DISCUSSION_TEMPLATE/`. Registre no perfil. Nunca sugira criar no
  projeto um que a organização já fornece: a cópia substituiria o
  padrão e divergiria dele. `LICENSE` não é herdado. Sem `gh`, sem
  remoto no GitHub, ou com o repositório inexistente ou privado,
  registre "nenhum".
- **Notas de versão**: `CHANGELOG.md`, `UPGRADE.md` e, com remoto no
  GitHub, as releases com texto (`gh release list` e `gh release view
  <tag> --json body`). Registre no perfil: "CHANGELOG", "GitHub
  Releases", os dois ou "nenhuma".
- Leia `CLAUDE.md`, `CONTRIBUTING.md` e `.editorconfig` se existirem.
- **Sem `CLAUDE.md` na raiz** (o Claude não foi iniciado no projeto):
  PARE e pergunte se quero rodar `/init` antes de seguir; ele dá
  contexto à revisão e aos workflows de `datalogix/workflows`. Se eu
  disser para seguir sem ele, registre em "Decisões do projeto" e não
  pergunte de novo.

Mostre o perfil em poucas linhas, incluindo tipo e estágio.

## 3. Progresso (fora do projeto)
- Arquivo: `~/.claude/reviews/<id>/progress.md`, onde `<id>` é:
  - pacote: o `name` do composer.json com `/` trocado por `-`
  - lib JS/TS: o `name` do package.json sem `@` e com `/` trocado por
    `-` (ex.: `@datalogix/ui` → `datalogix-ui`)
  - aplicação (Laravel ou Nuxt/Next), ou `name` ausente ou genérico
    (`laravel/laravel`, `nuxt-app`, `my-app`): o nome
    da pasta raiz + os 6 primeiros caracteres do hash do caminho
    absoluto (`pwd | sha1sum | cut -c1-6`), ex.: `loja-3fa91c`
  Grave o caminho absoluto do projeto no topo do progresso; se ele não
  bater com o projeto atual, pare e me avise (dois projetos com o
  mesmo id).
- Nunca crie arquivos de controle dentro do projeto.
- Estrutura:
  1. **Perfil do projeto** (com o commit em que foi gerado)
  2. **Decisões do projeto**: padrões e respostas que valem para os
     próximos passos; respeite-as sempre e não pergunte de novo
  3. **Mudanças para documentar**: o que alterou comportamento,
     configuração ou API pública
  4. **Etapas**: por etapa/pasta/parte, data, commit, o que foi
     analisado, itens aplicados, recusados e pulados (pelo número),
     "Decisões tomadas" sem perguntar, testes e os commits feitos
     pelo fluxo de commit (hash e título)
  5. **Perguntas pendentes**, com o passo e os itens que dependem delas
  6. **Modos de foco**: uma seção por modo, com progresso próprio; um
     modo nunca marca etapa da revisão completa como feita
- Salve ao fim de CADA passo, para eu poder parar e retomar com
  `/datalogix:review`.
- Se algo verificado mudou desde o commit registrado
  (`git diff --name-only <commit> -- <caminho>`), reanalise só o que mudou.

## 4. Linha de base e plano
`help` e `status` não rodam nada disto: só leem os arquivos e o progresso.

- **Verificação PHP**: suíte PHP e ferramentas PHP existentes (Pint em
  modo `--test`, com `--blade` se houver views Blade e o Pint for 1.30+,
  a menos que o `pint.json` já ative `Pint/laravel_blade`). Roda em todo
  passo.
- **Verificação front-end** (só se houver front-end): dependências pelo
  lockfile se faltar `node_modules` (ex.: `npm ci`), e os scripts
  existentes de testes JS/TS, `typecheck`/`tsc --noEmit`, lint (ESLint,
  Stylelint, Prettier em modo check) e `build`. Roda na linha de base,
  no fechamento e em todo passo que alterou views, CSS, JS/TS, assets,
  `package.json`, lockfile ou configs de build (Vite, Tailwind, PostCSS).
- **Verificação completa** = as duas. Nos tipos JS não há verificação
  PHP: a verificação front-end roda em todo passo e é a verificação
  completa.
- Na primeira chamada da sessão, rode a verificação completa como linha
  de base. Se algo falhar antes de qualquer mudança, pare e me mostre.
- **Passo de formatação**: se na linha de base só falharem os checks de
  formatação (`pint --test`, `prettier --check`), proponha um passo
  próprio antes das etapas: rodar `pint` (com `--blade` nas mesmas
  condições da verificação PHP; nos tipos JS, não) e `prettier
  --write` direto, nunca o script `format` (que também roda `eslint
  --fix`); nenhuma outra mudança. Depois, rodar a verificação completa,
  sugerir um commit só de formatação, com `- [ ] Fazer o commit de
  formatação` (pelo fluxo de commit da seção 5), e que eu inclua o
  hash dele no `.git-blame-ignore-revs` num commit seguinte, e PARAR
  até "próxima". Registre no progresso; vale também quando eu
  instalar o formatador depois.
- Mostre o plano: as etapas na ordem definida pelo arquivo do tipo, com
  as pastas de cada etapa por pasta (código PHP: Contracts primeiro,
  depois as que dependem delas, Providers por último; código JS/TS:
  tipos e utilitários primeiro, depois quem os importa; arquivos
  soltos na raiz contam como um grupo), com quantidade de arquivos e
  linhas, e as pastas grandes já divididas em partes (seção 8).
- Etapas que não se aplicam (sem `package.json`, sem front-end, sem
  recursos) são puladas com uma linha de aviso, sem pausa.

## 5. Ciclo de cada passo
Um passo é uma etapa, uma pasta ou uma parte de pasta.
0. Antes de começar, a checagem de git do arquivo do tipo, se o estágio
   exigir. Se falhar, pare e me diga o que resolver.
1. Faça a ANÁLISE num subagente (ferramenta Task/Agent), para não lotar
   a conversa. Passe a ele: os caminhos do arquivo da etapa/modo e do
   arquivo do tipo (para ler), os `SKILL.md` mapeados para a etapa, a
   lista de arquivos do passo (e, se for parte, os nomes dos arquivos
   das outras partes da pasta), o perfil, as "Decisões do projeto", as
   seções 6 (formato) e 7 (perguntas: decidir antes de perguntar) deste
   arquivo, e a regra de idioma (seção 11) com o que o `CLAUDE.md`
   disser sobre idioma. Ele devolve só o relatório.
   Antes de mostrar, confira o relatório: descarte itens que repetem
   uma "Decisão do projeto", que já foram recusados antes, ou cujo
   trecho citado não existe no arquivo; transforme em item as perguntas
   de sim/não óbvio.
2. Mostre o relatório, com as perguntas no fim (seção 7), e PARE até eu
   dizer o que aplicar ("aplica 1, 3", "todas", "nenhuma", "todas menos
   sugestões", "todas menos 4") e responder as perguntas, na mesma
   mensagem. "pula" adia o passo inteiro sem aplicar nada (fica
   pendente no progresso) e segue para o próximo. Registre
   em "Decisões do projeto" as respostas que valem adiante.
3. Aplique só o aprovado, um item de cada vez, adicionando testes quando
   mudar comportamento ou cobrir algo sem teste. Ao renomear, atualize
   todas as referências (código, testes, config, views, docs, skills) e
   busque pelo nome antigo antes de concluir. Se surgir dúvida num item:
   se a resposta óbvia é "sim", decida e registre em "Decisões tomadas";
   se for uma escolha real, pule-o e pergunte no resumo (seção 7).
4. Rode a verificação PHP e, se o passo alterou front-end, a verificação
   front-end (seção 4); nos tipos JS, a verificação completa. Tudo
   precisa passar 100%.
   - Se falhar, corrija e rode de novo.
   - Nunca apague, pule ou enfraqueça teste existente. Se achar que o
     teste está errado, me pergunte.
   - Se uma melhoria não passar após 2 tentativas, reverta só ela,
     registre o motivo e siga.
5. Registre em "Mudanças para documentar" o que o passo alterou de
   comportamento, configuração ou API pública. Salve o progresso,
   mostre um resumo curto (arquivos alterados, testes
   adicionados, "Decisões tomadas", itens pulados e perguntas
   pendentes), sugira os commits e PARE até eu dizer "próxima"
   (aplicando antes os itens liberados por respostas que eu der).
   - Um commit por funcionalidade ou correção, com os testes, a
     documentação e o lockfile da mudança que acompanham;
     refatoração e formatação à parte. Cada um com a mensagem e os
     arquivos, na ordem em que devem ser feitos (o que outro usa vem
     antes).
   - Se um arquivo tiver mudanças de mais de um commit, diga quais
     trechos vão em cada.
   - Pergunte quais fazer: um `- [ ] <título do commit>` por commit
     sugerido, todos desmarcados, com os arquivos recuados abaixo;
     com mais de um, também `- [ ] Fazer tudo em um commit só`; e
     `- [ ] Seguir para a próxima etapa depois dos commits`. Sem o
     formato da seção 7, aceite em texto (ex.: "commita 1 e 2 e
     segue").
   - Se o arquivo do tipo exigir a checagem de git antes de cada
     passo, avise que todos os commits sugeridos precisam ser
     feitos antes de "próxima": com algo sem commit, o próximo passo
     para.
   - Com commits marcados, faça-os pelo fluxo de commit (abaixo). Com
     "Seguir" marcado, só depois que todos os marcados forem feitos
     vale como "próxima"; se algum for cancelado ou falhar, PARE.
   - Fluxo de commit: leia `${CLAUDE_SKILL_DIR}/../commit/SKILL.md`
     e siga-o a partir do passo 2, como se os commits marcados
     fossem os grupos marcados no passo 1 dele (ou, com "Fazer tudo
     em um commit só", um grupo só, com os arquivos de todos), com o
     idioma da seção 11.
   - Antes, faça só as checagens de estado do passo 1 dele: sem
     repositório git ou com merge, rebase, cherry-pick ou revert em
     andamento, pare; anote se é o primeiro commit e se a branch
     atual é a padrão, para os avisos da prévia. Se houver algo em
     stage, não siga: diga e deixe para eu rodar
     `/datalogix:commit`.
   - Só entram arquivos dos commits sugeridos. A prévia, a
     confirmação e os avisos são os dele; nenhum commit é feito sem
     a minha confirmação.
   - Depois, registre no progresso da etapa o hash e o título de cada
     commit feito (`git log -<n> --format='%h %s'`).
6. Depois da última etapa, faça o fechamento (`steps/closing.md`),
   com a verificação completa, e liste os passos pulados com "pula".
7. Etapa avulsa e modo não têm fechamento: no resumo do fim da etapa,
   ou do último passo do modo, pergunte se rodo o `/code-review`
   sobre as mudanças e siga a seção 2 de `steps/closing.md` (o
   `/security-review` também, nas mesmas condições). Não vale para
   `report`.

## 6. Formato do relatório
Só reporte o que confirmou lendo o código: cite o trecho e a linha
exatos; sem suposições ("pode ser que", "talvez em algum lugar").

Severidade:
- **crítico**: bug que acontece em uso normal, falha de segurança, perda
  ou vazamento de dados, quebra de instalação ou de deploy
- **importante**: bug em caso de borda, risco real de manutenção,
  teste faltando em comportamento importante, inconsistência que
  confunde quem usa
- **sugestão**: melhoria de legibilidade, estilo ou organização; nada
  quebra se não for feita

Numere cada item:
- **#N — Severidade**: crítico / importante / sugestão
- **Local**: `caminho/arquivo:linha`
- **Problema**: o que e por quê, citando o trecho relevante
- **Sugestão**: como melhorar (snippet curto se ajudar)
- **Impacto**: quebra API pública? (sim/não, pela definição do arquivo
  do tipo) · esforço (baixo/médio/alto)

Ordene por severidade. Agrupe renomeações e ajustes de comentários
puramente cosméticos num item por arquivo. No fim: "Recomendações
gerais" (o que envolve mais de um passo) e, por último, "Perguntas".

## 7. Perguntas
Junte as dúvidas no fim de cada passo; não interrompa a análise e não
acumule para o fim da revisão inteira.

### Antes de perguntar: decida
NÃO pergunte quando a resposta é sim/não e o "sim" é a opção óbvia
(corrigir um bug, adicionar teste faltando, remover código morto,
ajustar nome para o glossário já decidido, seguir uma convenção que o
projeto já usa). Nesses casos:
- na análise: vira um item normal do relatório, com a sua recomendação;
  minha aprovação dos itens ("todas", "aplica 1, 3") já é a resposta
- na aplicação: decida e siga; liste no resumo do passo em
  "Decisões tomadas", em uma linha cada, para eu poder desfazer
Na dúvida entre perguntar e decidir algo reversível, decida e registre.

### Quando perguntar
Só quando há uma escolha real entre opções razoáveis que depende de
mim (design, API pública, comportamento visível, nome de conceito novo),
ou quando o "sim" não é óbvio e errar custa caro.

Toda pergunta com opções mostra um exemplo curto de cada uma (código,
assinatura, config ou uso, 1 a 5 linhas) e marca a recomendada:

    ## Perguntas
    P1. Como expor o tempo de expiração do código 2FA? (src/TwoFactor/Code.php:42)
        a) config (recomendada)
           config('guardian.two_factor.expires_in', 300)
        b) argumento do método
           $code->verify($input, expiresIn: 300)
        c) constante na classe
           Code::EXPIRES_IN = 300

    Itens que dependem das respostas: #3 (P1), #5 e #6 (P2)

- Pergunta sem opções (ex.: "este comportamento é intencional?") traz o
  trecho de código relevante e o que você faria em cada resposta.
- Posso responder só com a letra ("P1 a"); sem resposta, nunca assuma.
- Itens marcados "depende de Pn" só são aplicados após a resposta.
- Sem resposta ao "próxima": os itens dependentes não são aplicados e
  a pergunta fica pendente no progresso (mostre no `status` e no
  fechamento).

Se a sessão definir um formato próprio para o que depende de mim (ex.:
o mod `topics`, com `## Pendências`), use-o no lugar de "Perguntas" e
das respostas acima:
- cada item do relatório fica num tópico `## <título curto>` e vira
  uma caixa que diz a ação sozinha, sem remeter ao número (ex.:
  `- [ ] Corrigir o total do pedido com cupom`), com
  `ver: <título do tópico>` recuado logo abaixo;
- os títulos dos tópicos são únicos na resposta, ignorando
  maiúsculas, acentos e crases, como o `ver:` os compara: dois
  achados parecidos levam o que os distingue no título (ex.:
  "Teste ausente em PedidoService" e "Teste ausente em
  CupomService"), senão o `ver:` do segundo abre o primeiro;
- cada pergunta vira uma linha só com o texto da pergunta (sem
  quebrar: só essa linha volta com a resposta), logo seguida das
  alternativas como `- ( ) <opção>`, uma por alternativa, a
  recomendada primeiro e terminando em "(recomendado)"; o exemplo
  de cada opção vai recuado logo abaixo dela (bloco de código
  recuado), nunca entre a pergunta e as opções;
- pergunta sem opções (ex.: "este comportamento é intencional?")
  vira alternativas que dizem o que você fará em cada resposta
  (ex.: `- ( ) Sim, manter e documentar` e
  `- ( ) Não, corrigir`), com o trecho de código recuado abaixo
  da primeira;
- item que depende de uma pergunta diz isso num detalhe recuado
  logo abaixo da caixa, com o texto da pergunta (ex.: `depende de:
  Como expor o tempo de expiração do código 2FA?`), e só é
  aplicado depois que essa pergunta for respondida;
- minha resposta chega como a lista marcada.

Pergunte NA HORA e espere apenas quando não der para seguir: linha de
base falhando, `CLAUDE.md` ausente, requisito de testes ausente
(arquivo do tipo), skill sem etapa clara, teste existente que parece
errado, checagem de git falhando, ou ação irreversível ou não
aprovada (apagar arquivos, editar migration, mudar versão mínima,
quebrar API pública).

## 8. Divisão de pastas grandes
Vale para todo passo por pasta, inclusive nos modos.
- Divida quando a pasta passar de **15 arquivos** OU **1.500 linhas**
  (`wc -l`, sem gerados); o `CLAUDE.md` do projeto pode definir outros
  limites. Se não der para ficar abaixo sem separar arquivos que
  dependem um do outro, prefira a parte um pouco maior.
- Como: 1) por subpasta (arquivos soltos formam uma parte; aplique de
  novo se a subpasta ainda for grande); 2) por afinidade (classe com
  Contract, DTOs, enums, exceções e eventos; componente com view;
  migration com factory), pelos `use`, type hints e nomes; 3) nunca em
  ordem alfabética.
- Nome: `src/Actions (2/3): TwoFactor — 9 arquivos, 1.120 linhas`, com
  a lista de arquivos.
- Cada parte é um passo completo. Se arquivos mudarem depois do plano,
  recalcule as partes pendentes e me mostre. Na última parte, inclua em
  "Recomendações gerais" o que só aparece olhando a pasta inteira.

## 9. Help
Com `help`, NÃO leia o projeto nem rode nada, e não crie progresso.
Leia este arquivo e os da pasta da skill necessários e responda em
português, de forma curta:
- `help`: o que o comando faz; tabela de argumentos (argumento · o que
  faz · exemplo); as etapas de cada tipo (pacote e aplicação Laravel,
  lib JS/TS, aplicação Nuxt/Next), uma linha cada; os modos; o ciclo
  de um passo (relatório → aprovo e respondo → aplica → verificação
  100% → commits que eu marcar, com prévia → "próxima"); onde fica
  o progresso e como retomar, ver status e recomeçar; as regras da seção
  10 e a regra de idioma da seção 11; o que muda por estágio em cada
  tipo, em duas linhas; e as respostas aceitas nas pausas (incluindo
  "pula" e responder perguntas só com a letra).
- `help <argumento>`: os passos que executa, o que verifica, o que pode
  e o que nunca altera, e um exemplo.
Resuma só o que está escrito nos arquivos; não invente comportamento.

## 10. Regras
- SEMPRE um passo por vez; nunca dois no mesmo relatório e nunca avance
  sem "próxima" (exceção: `report`, que não altera nada).
- Não altere API pública (definição no arquivo do tipo) sem aprovação.
- Não instale ferramentas nem dependências novas sem aprovação.
- Todo código que você escrever segue "Documentação no código" de
  `steps/code.md`: só comentários realmente necessários.
- Docblocks só são revisados no modo `docs`; fora dele, não toque.
- Commit só pelo fluxo de commit (seção 5), dos que eu marcar e
  depois da minha confirmação na prévia; nunca push, tag nem release.
- Seja direto: sem elogios nem descrição do que o código já faz.

## 11. Idioma
- Conversa, relatórios, perguntas, resumos e help: português.
- Tudo que for escrito no projeto: inglês — código, nomes, comentários,
  docblocks, testes, mensagens de exceção e de log, README, /docs,
  CHANGELOG, UPGRADE, skills e guidelines.
- Mensagens de commit sugeridas: tipo do Conventional Commits em
  inglês e descrição no idioma da linha `- Issues and pull requests:
  <idioma>` do `CLAUDE.md` do projeto, como no `/datalogix:commit`;
  sem essa linha, em português.
- Textos para o usuário final ficam nos arquivos de tradução (`lang/`)
  se o projeto usa tradução; nesse caso, nunca fixos no código.
- Se o projeto tiver código ou documentação em outro idioma, aponte como
  item no relatório; não traduza sem aprovação.
- Passe esta regra a todo subagente.
- O `CLAUDE.md` (global ou do projeto) pode definir outra regra e tem
  prioridade.
