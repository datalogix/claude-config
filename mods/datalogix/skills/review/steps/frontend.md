# Etapa: frontend (views, CSS, JS, TS, uma pasta por vez)

Só se existir front-end. Arquivos gerados/compilados ficam fora.
Nomenclatura, documentação no código e docblocks: mesmas regras de
`code.md` (nesta mesma pasta); leia só essas seções de lá.

## Views (Blade, componentes, Livewire)
- XSS: `{!! !!}` com dado não confiável, atributos e URLs sem escape;
  `@js`/`Js::from` em vez de concatenar dados em `<script>`
- `@csrf` em formulários, `@method` correto, ações sensíveis protegidas
  por policy no back-end e não só escondidas com `@can`
- lógica pesada ou queries na view (N+1 por relacionamento em loop)
- componentes: props com padrão, `$attributes->merge()`/`class()`,
  slots nomeados, sem HTML duplicado entre views
- acessibilidade: `label` ligado ao campo, `alt` em imagens, botões com
  texto ou `aria-label`, hierarquia de títulos, foco visível, `aria-*`
  em modais, dropdowns e alertas
- textos fixos que deveriam usar `__()` se o projeto tiver tradução
- pacote: views publicáveis com nome e namespace estáveis (renomear
  quebra quem publicou: é API pública)

## CSS
- regras e classes não usadas, duplicadas ou sobrescritas
- `!important` e seletores com especificidade excessiva
- valores fixos que deveriam ser variáveis/tokens
- Tailwind: classes montadas por concatenação (o build não detecta),
  `content`/`@source` cobrindo todas as views, uso coerente de `@apply`
- responsividade, modo escuro (se houver) e contraste

## JS/TS
- bugs: `null`/`undefined`, promessas sem `await`/`catch`, listeners e
  timers nunca removidos, condições de corrida
- segurança: `innerHTML`/`x-html` com dado não confiável, `eval`, token
  CSRF nas requisições
- TS: `any` evitável, `as` forçado, `@ts-ignore`, tipos duplicados
- código morto, duplicado ou dependência npm não usada
- Alpine/Livewire: lógica grande inline que deveria virar componente
  (`Alpine.data`), `wire:model` sem modificador adequado
- sem `package.json` mas com JS/TS próprio (a etapa `npm` não
  roda): aponte a falta de ESLint e Prettier como em `npm.md`
  (nesta mesma pasta; item "importante"), uma vez só, na primeira
  pasta com JS/TS

## Testes
- views/componentes: testes PHP renderizando (`$this->view()`,
  `$this->blade()`, `Blade::render`, `Livewire::test`), cobrindo estados
  (vazio, erro, com dados) e escape
- JS/TS: testes unitários com o runner em uso (Vitest, ou Jest se o
  projeto já usa; regras na seção 2 do `SKILL.md`)
- navegador só se já houver Playwright/Cypress/Dusk
