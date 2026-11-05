# Modo: tests — testes

Revisa SÓ testes. Pode adicionar e melhorar testes; NÃO altera código
de produção. Nunca apague, pule ou enfraqueça teste existente sem
aprovação item a item.

Para confirmar se um teste pega um erro, pode alterar o código numa
cópia temporária fora do projeto (`mktemp -d`), apagada ao fim do
passo; nunca na árvore do projeto. Diga no item o que alterou e o
resultado.

Passos, um por vez:
1. Visão geral.
2. Pastas de `tests/`, uma por vez (ex.: `tests/Unit`, `tests/Feature`).
3. Testes JS/TS, se existirem.

Nos tipos JS, os passos 1 e 2 tratam só dos testes JS/TS e o passo 3
não existe. No passo 1 valem "o que não tem teste" (seção 1) e a
cobertura com `npx vitest run --coverage`, só se o provider
(`@vitest/coverage-v8` ou `-istanbul`) já estiver instalado; sem ele,
não instale nada: leia os testes e o código e mapeie os módulos sem
teste correspondente. No passo 2, as pastas que têm testes, inclusive
`*.test.*` ao lado do código, com as regras da seção 2 ajustadas pela
seção 3.

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

## Bugs revelados por testes
- viram item com a severidade da seção 6 do `SKILL.md` (uso normal:
  crítico; caso de borda: importante), cuja ação é registrar, não
  corrigir (ex.: `- [ ] Registrar o bug do total com cupom`)
- aprovado, grave-o em "Correções pendentes" do progresso, com o
  arquivo, a entrada que falha, o resultado esperado e o passo da
  revisão completa que o corrige (ex.: etapa `code`, pasta `src/Cart`)
- o teste que falha por causa do bug não entra neste modo, nem pulado:
  a verificação precisa passar 100%. Não o proponha como item à parte;
  descreva-o no registro, e ele entra com a correção
