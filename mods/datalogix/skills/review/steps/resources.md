# Etapa: resources (uma pasta por vez, só as que existirem)

Ordem: `config/`, `database/`, `routes/`, `lang/`, `stubs/`.
Nomenclatura, documentação no código e docblocks: mesmas regras de
`code.md` (nesta mesma pasta); leia só essas seções de lá.

## config/
- toda chave usada no código existe no config, e toda chave dos
  arquivos de config próprios do projeto/pacote é usada (busque
  `config(`, `Config::get`); arquivos padrão do Laravel ficam fora
- `env()` só dentro de `config/`; nunca no código (quebra com
  `config:cache`)
- padrões seguros (expirações curtas, recursos sensíveis desligados)
- comentário curto em cada opção: aqui é documentação para quem lê o
  config, então mantenha e corrija em vez de remover
- pacote: `mergeConfigFrom` no provider e tag de publicação
- aplicação: o `.env.example` é verificado na etapa `production`

## database/
- migrations: tipos e tamanhos de coluna, `nullable` e defaults
  coerentes com o código, índices para colunas usadas em `where`/`join`,
  chaves estrangeiras com `onDelete` explícito, `down()` que desfaz o
  `up()`
- edição de migrations existentes segue as regras de estágio do tipo
- pacote: nome de tabela configurável se o projeto já faz isso;
  `publishesMigrations` (Laravel 11+; antes,
  `publishes(..., 'migrations')`) ou `loadMigrationsFrom` no provider
- aplicação em produção: migrations seguras para tabelas grandes —
  coluna nova `NOT NULL` sem default, índice criado sem considerar
  bloqueio, renomear/remover coluna que o código em execução ainda usa
  (faça em duas fases), migração de dados misturada com schema
- factories: atributos batendo com as colunas, estados úteis
  (`unverified()`, `expired()`), sem aleatoriedade que quebre testes
- seeders: idempotentes, sem dados reais sensíveis; aplicação: separe
  seeders de dados obrigatórios (rodam em produção) dos de exemplo

## routes/
- nomes em todas as rotas, no padrão do projeto
- autenticação, autorização e `throttle` nas rotas sensíveis (login,
  reset de senha, 2FA, envio de código, uploads)
- sem nomes de rota duplicados (quebram `route:cache`)
- rotas mortas (controller ou ação inexistente)
- pacote: prefixo, domínio e middleware configuráveis; rotas
  registráveis ou desligáveis pela config
- aplicação: `routes/console.php` e `bootstrap/app.php` entram aqui; o
  agendamento segue as regras de `jobs.md` e o middleware e as exceções
  de CSRF, as de `http.md` (nesta mesma pasta)

## lang/
- chaves usadas no código (`__()`, `trans()`, `trans_choice()`, `@lang`)
  e ausentes nos arquivos, e chaves que ninguém usa
- todos os idiomas com as mesmas chaves e os mesmos placeholders
- pacote: namespace de tradução e tag de publicação

## stubs/
- batem com as convenções atuais do código
- placeholders consistentes e todos substituídos pelo comando que usa
- pacote: tag de publicação, se forem publicáveis

## Service provider (pacote)
Verificado aqui, mesmo estando em `src/`: em cada pasta, só a parte do
provider referente a ela, com uma tag de publicação por recurso
(`<pacote>-config`, `<pacote>-migrations` etc.), caminhos corretos e
nada publicado que não exista. A etapa `code` não trata publicação.

## Testes
Config carregada e mesclada, rotas registradas com o middleware certo,
migrations rodando no banco de teste, traduções sem chaves faltando
quando houver teste para isso.
