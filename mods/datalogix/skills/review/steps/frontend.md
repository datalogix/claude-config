# Etapa: frontend (views, CSS, JS, TS, uma pasta por vez)

Só se existir front-end. Arquivos gerados/compilados ficam fora.
Nomenclatura, documentação no código e docblocks: mesmas regras de
`code.md` ou, nos tipos JS, de `code-js.md` (nesta mesma pasta); leia
só essas seções de lá.

Nos tipos Laravel, as seções "Views", "CSS", "JS/TS" e "Testes". Nos
tipos JS, "CSS", "JS/TS", a seção do framework ("Vue", mais "Nuxt"
num projeto Nuxt; "React", mais "Next" num projeto Next) e "Testes";
numa lib, sem "JS/TS", que `code-js.md` cobre, e com "Lib de
componentes".

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

## Vue
- reatividade perdida: desestruturar um `reactive`, ou `props` antes do
  Vue 3.5, sem `toRefs`; `ref` substituído em vez de alterado
- `v-html` com dado não confiável; `v-for` sem `key` ou com o índice
  como `key` em lista que muda; `v-if` e `v-for` no mesmo elemento
- props e emits tipados (`defineProps<...>()`, `defineEmits<...>()`),
  `v-model` com `defineModel` onde o projeto já usa
- `computed` com efeito colateral; `watch` que deveria ser `computed`
- composables: nome com `use`, sem efeito fora de `setup`
- Pinia: `storeToRefs` ao desestruturar estado; lógica de tela fora da
  store
- `vue-router`: páginas com import dinâmico; rota 404 própria; título
  por página

## Nuxt
- SSR: `window`, `document` e `localStorage` só no cliente
  (`onMounted`, `<ClientOnly>`, `import.meta.client`); estado global
  com `useState` ou store (Pinia), nunca em variável de módulo, que é
  compartilhada entre usuários no servidor; dado buscado com
  `useFetch`/`useAsyncData` (não `$fetch` direto no `setup`, que busca
  duas vezes)
- auto-import sem nomes iguais entre `composables/`, `utils/` e módulos
- páginas: `definePageMeta` (middleware, layout), `useSeoMeta` ou
  `useHead` com título por página

## React
- regras dos hooks; dependências de `useEffect`/`useMemo`/
  `useCallback` completas; `useEffect` para estado derivado (calcule no
  render) ou para buscar dado que o servidor poderia buscar
- `dangerouslySetInnerHTML` com dado não confiável; `key` estável em
  listas (não o índice em lista que muda)
- estado mudado diretamente em vez de por uma cópia; estado guardado
  acima do necessário, que renderiza a árvore inteira
- limpeza no retorno do `useEffect` (listeners, timers, requisições)
- `react-router`: páginas com `lazy`; rota 404 própria; `ErrorBoundary`
  em volta do que pode falhar; título por página

## Next
- App Router: `'use client'` no componente mais baixo possível, não na
  página inteira; Server Component não passa segredo nem objeto grande
  como prop para Client Component; `loading.tsx`, `error.tsx` e
  `not-found.tsx` onde há dado assíncrono
- formulários com Server Actions: validação e autorização no servidor
  (etapa `code`), estado de envio e erro na interface
- `next/link`, `next/image` e `next/font` em vez de `<a>`, `<img>` e
  fontes externas; `metadata`/`generateMetadata` por página

## Lib de componentes
- renomear ou remover prop, evento ou slot é quebra de API pública
  (arquivo do tipo)
- importar um componente funciona em SSR: `window` e `document` só em
  `onMounted`, `useEffect` ou atrás de uma checagem
- atributos, `class` e `ref` chegam ao elemento certo (Vue:
  `inheritAttrs`, `defineExpose`; React: `ref` e `...props`)
- CSS sem seletor global que afete a aplicação de quem instala, em
  arquivo que dá para importar à parte
- componente importável sozinho, sem depender de plugin, roteador ou
  store de quem instala sem dizer isso na documentação
- acessibilidade de teclado e `aria-*`, que quem instala não consegue
  corrigir por fora

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
