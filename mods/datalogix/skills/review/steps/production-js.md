# Etapa: production nas aplicações Nuxt/Next — produção e deploy

## Ambiente
- `.env.example` com todas as variáveis que o código lê, com valores de
  exemplo e nenhum segredo real; `.env` fora do git
- segredos nunca chegam ao navegador:
  - Nuxt: chaves privadas em `runtimeConfig` (sobrescritas por
    `NUXT_<CHAVE>` em produção); em `runtimeConfig.public` e em
    `app.config` só o que pode ser público
  - Next: só o que pode ser público em `NEXT_PUBLIC_`; essas variáveis
    são fixadas no build, então mudar o valor exige novo build
- procure no build (`.output/public/`, `.next/static/`) os nomes das
  variáveis privadas e trechos dos valores de exemplo: nada pode
  aparecer lá

## Segurança
- headers de segurança (CSP, HSTS, X-Frame-Options,
  X-Content-Type-Options): Nuxt por `routeRules` ou pelo módulo
  `nuxt-security` se já instalado; Next por `headers()` no
  `next.config` ou pelo middleware
- cookies de sessão com `httpOnly`, `secure` e `sameSite`
- source maps do cliente fora de produção, a menos que o projeto os
  envie a um serviço de erros (Nuxt: `sourcemap.client`; Next:
  `productionBrowserSourceMaps`)
- ferramentas de desenvolvimento desligadas em produção (Nuxt
  `devtools`, páginas e rotas de teste)

## Renderização e cache
- página com dado do usuário nunca em cache compartilhado (CDN,
  `routeRules` com `swr`/`isr`, `revalidate` do Next): o cache serve
  a página de um usuário para outro
- Nuxt: `useFetch`/`useAsyncData` com chave única quando a mesma
  chamada varia por parâmetro; `$fetch` direto no `setup` busca duas
  vezes (servidor e cliente)
- Next: cache do `fetch` e das rotas como a versão em uso define
  (o padrão mudou entre versões); `revalidate` e `dynamic` explícitos
  onde o dado muda
- erros de hidratação no console do build ou dos testes

## Build e deploy
- rode o `build` e leia os avisos (chunks grandes, imports circulares,
  dependências que não deveriam ir para o cliente)
- destino de deploy coerente com o config: preset do Nitro (Nuxt),
  `output: 'standalone'` ou `'export'` (Next); script `start` (ou
  `preview`) que roda o build
- versão do Node de produção coerente com `engines` e `.nvmrc`
- páginas de erro e 404 próprias (Nuxt: `error.vue`; Next:
  `error.tsx`, `not-found.tsx`), sem stack nem detalhe interno
- rota de health check, se o deploy usa uma
- imagens: domínios remotos liberados e só os necessários (Next
  `images.remotePatterns`; Nuxt `image.domains` se usa `@nuxt/image`)
- site público: `<title>` e meta description por página, `robots` e
  sitemap, se fizer sentido para o projeto
- passos de deploy documentados (variáveis, build, start)

## Logs e erros
- erros do servidor registrados com contexto útil, sem senhas, tokens
  ou dados pessoais
- erros do cliente enviados a um serviço de monitoramento, se o projeto
  usa um

O que não puder ser verificado pelo código (servidor, CDN,
infraestrutura) vira uma única pergunta agrupada, não suposição;
nada, se já estiver em "Decisões do projeto".
