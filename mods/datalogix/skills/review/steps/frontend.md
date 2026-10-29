# Etapa: frontend (views, CSS, JS, TS, uma pasta por vez)

Só se existir front-end. Arquivos gerados/compilados ficam fora.
Nomenclatura, documentação no código e docblocks: mesmas regras de
`code.md` (nesta mesma pasta); leia só essas seções de lá.

Nos tipos Laravel, as seções "Views", "CSS", "JS/TS" e "Testes". Nos
tipos JS, "CSS", "JS/TS", a seção do framework ("Vue e Nuxt" ou
"React e Next") e "Testes".

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

## Vue e Nuxt
- reatividade perdida: desestruturar `props` ou um `reactive` sem
  `toRefs` (antes do Vue 3.5), `ref` substituído em vez de alterado
- `v-html` com dado não confiável; `v-for` sem `key` ou com o índice
  como `key` em lista que muda; `v-if` e `v-for` no mesmo elemento
- props e emits tipados (`defineProps<...>()`, `defineEmits<...>()`),
  `v-model` com `defineModel` onde o projeto já usa
- `computed` com efeito colateral; `watch` que deveria ser `computed`
- SSR (Nuxt): `window`, `document` e `localStorage` só no cliente
  (`onMounted`, `<ClientOnly>`, `import.meta.client`); estado global
  com `useState` ou store (Pinia), nunca em variável de módulo, que é
  compartilhada entre usuários no servidor; dado buscado com
  `useFetch`/`useAsyncData` (não `$fetch` direto no `setup`, que busca
  duas vezes)
- composables: nome com `use`, sem efeito fora de `setup`; auto-import
  do Nuxt sem nomes iguais entre `composables/`, `utils/` e módulos
- páginas: `definePageMeta` (middleware, layout), `useSeoMeta` ou
  `useHead` com título por página

## React e Next
- regras dos hooks; dependências de `useEffect`/`useMemo`/
  `useCallback` completas; `useEffect` para estado derivado (calcule no
  render) ou para buscar dado que o servidor poderia buscar
- `dangerouslySetInnerHTML` com dado não confiável; `key` estável em
  listas (não o índice em lista que muda)
- App Router: `'use client'` no componente mais baixo possível, não na
  página inteira; Server Component não passa segredo nem objeto grande
  como prop para Client Component; `loading.tsx`, `error.tsx` e
  `not-found.tsx` onde há dado assíncrono
- formulários com Server Actions: validação e autorização no servidor
  (etapa `code`), estado de envio e erro na interface
- `next/link`, `next/image` e `next/font` em vez de `<a>`, `<img>` e
  fontes externas; `metadata`/`generateMetadata` por página

## Testes
- views/componentes: testes PHP renderizando (`$this->view()`,
  `$this->blade()`, `Blade::render`, `Livewire::test`), cobrindo estados
  (vazio, erro, com dados) e escape
- JS/TS: testes unitários com o runner em uso (Vitest, ou Jest se o
  projeto já usa; regras na seção 2 do `SKILL.md`)
- componentes Vue/React: testes com `@vue/test-utils` (ou
  `@nuxt/test-utils` quando dependem do Nuxt) e
  `@testing-library/react`, cobrindo estados (carregando, vazio, erro,
  com dados)
- navegador só se já houver Playwright/Cypress/Dusk
