# Modo: tests — testes

Revisa SÓ testes. Pode adicionar e melhorar testes; NÃO altera código
de produção. Se um teste revelar um bug, registre como item com a
severidade da seção 6 do `SKILL.md` (uso normal: crítico; caso de
borda: importante); a correção fica fora deste modo: indique o passo
da revisão completa que a aplica. Nunca apague, pule ou enfraqueça
teste existente sem aprovação item a item.

Passos, um por vez:
1. Visão geral.
2. Pastas de `tests/`, uma por vez (ex.: `tests/Unit`, `tests/Feature`).
3. Testes JS/TS, se existirem.

Nos tipos JS, os passos 1 e 2 tratam só dos testes JS/TS, com as
ideias da seção 3, e o passo 3 não existe. Cobertura com `vitest run
--coverage` só se o provider (`@vitest/coverage-v8` ou `-istanbul`)
já estiver instalado.

## 1. Visão geral
- cobertura, se houver driver (`pcov` ou `xdebug`): `--coverage` (Pest)
  ou `--coverage-text` (PHPUnit). Sem driver, não instale nada: mapeie
  classes sem teste correspondente
- o que não tem teste, ordenado por risco: segurança e autorização,
  regra de negócio, comandos, jobs, eventos
- `phpunit.xml`: suítes, `source` incluindo o código certo, ambiente de
  teste, `failOnRisky`; `failOnWarning` só sem relatório de cobertura
  no `phpunit.xml` ou com pcov/xdebug registrado no perfil (com o
  Clover e sem driver, o warning derruba o `composer test` local)
- pacote: `TestCase` do Testbench (providers, config de teste,
  migrations, banco em memória)
- aplicação: `RefreshDatabase` (ou equivalente), banco de teste separado,
  factories para todos os models; cada rota com feature test (sucesso,
  validação, sem login, sem permissão); jobs, listeners e comandos
  testados

## 2. Por pasta
- testes que não testam nada: sem asserção, asserção sempre verdadeira,
  mock que substitui o próprio código testado
- um comportamento por teste; nomes que descrevem o comportamento
- casos de borda e de erro faltando (null, vazio, inválido, sem
  permissão, expirado, limite)
- duplicação que deveria virar dataset (Pest) ou data provider (PHPUnit)
- isolamento: estado vazando, dependência de ordem, data/hora reais
  (use `travelTo`/`Carbon::setTestNow`), rede real
- fakes do Laravel onde cabem (`Event`, `Mail`, `Queue`, `Bus`, `Http`,
  `Notification`, `Storage`)
- lentidão: `sleep`, banco sem necessidade, factories gigantes
- estilo do runner em uso (Pest ou PHPUnit), sem misturar

## 3. JS/TS
Mesmas ideias com o runner em uso (Vitest, ou Jest se o projeto já
usa; regras na seção 2 do `SKILL.md`), incluindo fake timers
(`vi.useFakeTimers`/`jest.useFakeTimers`) para data/hora e mocks de
`fetch` em vez de rede real.
