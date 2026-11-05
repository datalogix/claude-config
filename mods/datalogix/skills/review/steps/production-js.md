# Etapa: production nas aplicações JS/TS — produção e deploy

Aplique em cada seção só o que vale para o projeto (Nuxt, Next, Vue ou
React com Vite, Node).

## Ambiente
- `.env.example` com todas as variáveis que o código lê, com valores de
  exemplo e nenhum segredo real; `.env` fora do git
- segredos nunca chegam ao navegador:
  - Nuxt: chaves privadas em `runtimeConfig` (sobrescritas por
    `NUXT_<CHAVE>` em produção); em `runtimeConfig.public` e em
    `app.config` só o que pode ser público
  - Next: só o que pode ser público em `NEXT_PUBLIC_`; essas variáveis
    são fixadas no build, então mudar o valor exige novo build
  - Vue ou React: toda `VITE_` é pública e fixada no build; `envPrefix`
    não pode ser ampliado a ponto de expor variáveis privadas
  - Node: nada vai ao navegador, mas segredos ficam fora de imagem,
    logs e respostas de erro
- procure no build (`.output/public/`, `.next/static/`, `dist/`) os
  nomes das variáveis privadas e trechos dos valores de exemplo: nada
  pode aparecer lá

## Segurança
- headers de segurança (CSP, HSTS, X-Frame-Options,
  X-Content-Type-Options): Nuxt por `routeRules` ou pelo módulo
  `nuxt-security` se já instalado; Next por `headers()` no
  `next.config` ou pelo middleware; Vue ou React pela hospedagem
  (servidor web, CDN); Node pelo proxy ou pelo plugin que o projeto já
  usa (ex.: `helmet`)
- cookies de sessão com `httpOnly`, `secure` e `sameSite`
- source maps do cliente fora de produção, a menos que o projeto os
  envie a um serviço de erros (Nuxt: `sourcemap.client`; Next:
  `productionBrowserSourceMaps`; Vite: `build.sourcemap`)
- ferramentas de desenvolvimento desligadas em produção (Nuxt
  `devtools`, páginas e rotas de teste)
- Node: CORS restrito, `trust proxy` coerente com a infraestrutura,
  limite de tamanho do body

## Renderização e cache (Nuxt e Next)
- página com dado do usuário nunca em cache compartilhado (CDN,
  `routeRules` com `swr`/`isr`, `revalidate` do Next): o cache serve
  a página de um usuário para outro
- Nuxt: `useFetch`/`useAsyncData` com chave única quando a mesma
  chamada varia por parâmetro; `$fetch` direto no `setup` busca duas
  vezes (servidor e cliente)
- Next: cache do `fetch` e das rotas como a versão em uso define
  (o padrão mudou entre versões); `revalidate` e `dynamic` explícitos
  onde o dado muda
- erros de hidratação nos testes de navegador, se houver; sem eles,
  entra na pergunta agrupada do fim

## SPA (Vue ou React)
- qualquer rota abre direto: a hospedagem devolve o `index.html` nas
  rotas do roteador, com `base` do Vite coerente com a pasta publicada
- `index.html` sem cache longo, assets com hash com cache longo: senão,
  o usuário fica preso numa versão antiga depois do deploy
- import dinâmico que falha depois de um deploy (chunk antigo removido)
  tratado, com recarga ou mensagem
- site público: conteúdo que depende de SEO precisa de pré-renderização
  ou de outro modo de renderização; aponte como item "sugestão"

## Processo (Node)
- `SIGTERM` encerra sem cortar nada: para de aceitar requisições,
  termina as em andamento e os jobs, fecha conexões
- `start` roda o código compilado, não `tsx` nem `ts-node`, salvo
  decisão registrada do projeto
- o processo reinicia sozinho se cair (gerenciador, container)
- migrations têm passo próprio no deploy, sem correr junto em várias
  instâncias
- worker e agendamento com deploy e monitoramento próprios

## Build e deploy
- rode o `build`, se houver, e leia os avisos (chunks grandes, imports
  circulares, dependências que não deveriam ir para o cliente)
- destino de deploy coerente com o config: preset do Nitro (Nuxt),
  `output: 'standalone'` ou `'export'` (Next), pasta publicada (Vue ou
  React); script `start` (ou `preview`) que roda o build
- versão do Node de produção coerente com `engines` e `.nvmrc`
- páginas de erro e 404 próprias (Nuxt: `error.vue`; Next:
  `error.tsx`, `not-found.tsx`; Vue ou React: rota 404 no roteador;
  Node: resposta de erro padrão), sem stack nem detalhe interno
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
