# Regras para aplicações Nuxt e Next

Aplicação web em Nuxt (`nuxt.config.*`) ou Next (`next.config.*`), sem
Laravel no mesmo repositório. Onde os dois diferem, as etapas trazem
uma seção para cada um; aplique só a do framework do projeto.

## Reconhecimento extra
- **Framework e versão**:
  - Nuxt: versão e estrutura (pasta `app/` do Nuxt 4 ou tudo na raiz),
    módulos em `modules` do `nuxt.config`
  - Next: versão e roteador (App Router em `app/`, Pages Router em
    `pages/`, ou os dois)
- **Renderização**: SSR, estática, SPA ou mista (Nuxt: `ssr`,
  `routeRules`; Next: `export const dynamic`/`revalidate`,
  `output: 'export'`).
- **Deploy**: destino (Nuxt: preset do Nitro; Next: `output:
  'standalone'`, Vercel, Node), e se consome uma API própria (ex.: um
  back-end Laravel em outro repositório).
- **Estágio**: procure no `CLAUDE.md` ou nas "Decisões do projeto". Se
  não estiver registrado, pergunte uma vez e registre:
  - **não lançada**: ainda não está em produção
  - **em produção**: já tem usuários e dados reais
- **Testes**: o runner de JS/TS da seção 2 do `SKILL.md`. No Nuxt,
  componentes e composables que dependem do Nuxt usam
  `@nuxt/test-utils` com o Vitest; no Next, componentes com
  `@testing-library/react`. Testes no navegador só se já houver
  Playwright ou Cypress. Não há testes PHP nem verificação PHP neste
  tipo.

## Etapas, nesta ordem
1. `git` — .gitignore, .gitattributes e .editorconfig
2. `ci` — integração contínua (workflows do próprio projeto)
3. `npm` — dependências e scripts
4. `code` — código do servidor (`steps/code-js.md`), uma pasta por
   vez:
   - Nuxt: `server/` (`api/`, `routes/`, `middleware/`, `utils/`)
   - Next: route handlers (`route.ts`), `pages/api/`, Server Actions
     (`'use server'`) e `middleware.ts`
   - código compartilhado sem interface (`utils/`, `lib/`, `types/`)
5. `frontend` — páginas, layouts, componentes, composables ou hooks,
   stores e CSS, uma pasta por vez (`steps/frontend.md`)
6. `production` — configuração de produção e deploy
   (`steps/production-js.md`)
7. `docs` — README, /docs, CLAUDE.md, skills e guidelines
8. `closing` — fechamento

## API pública
O que não pode quebrar é o que está fora do código:
- URLs das páginas (links salvos, SEO) e parâmetros de query usados em
  links compartilhados
- rotas de API consumidas por apps, terceiros ou webhooks (caminho,
  campos, tipos, códigos de status)
- nomes das variáveis de ambiente usadas no deploy
- dados guardados no navegador do usuário: chaves de cookies,
  `localStorage` e `sessionStorage`, e o formato do que está nelas
Componentes, composables, hooks e funções internas NÃO são API
pública: renomeie sem alias.

## Regras por estágio

### não lançada
- checagem de git não é obrigatória; só avise se a árvore estiver suja
- fechamento sem notas de deploy

### em produção — obrigatório
- **Checagem de git antes de CADA passo**:
  - `git status --porcelain` vazio (o passo anterior foi commitado)
  - fora da branch padrão (`main`/`master`); se estiver nela, pare e
    sugira criar uma (ex.: `review/<data>`)
  - registre no progresso o commit de início do passo
- Mudança em API pública exige aprovação e plano de compatibilidade:
  redirecionar URLs antigas (Nuxt: `routeRules` com `redirect`; Next:
  `redirects()` no `next.config`), manter o campo ou a rota antiga por
  um tempo, ou ler o formato antigo de cookies e `localStorage` além
  do novo
- Variável de ambiente renomeada ou nova: só com o deploy preparado
  (notas de deploy)
- Fechamento: notas de deploy (`steps/closing.md`)
