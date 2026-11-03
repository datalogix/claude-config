# Etapa: closing (fechamento)

Depois da última etapa da revisão completa.

## 1. Notas de versão (conforme o tipo e o estágio)
Pacote ou lib pré-v1, ou aplicação não lançada: pule este item.

Onde ficam as notas (de versão e de deploy) segue o que o perfil
registrou em "Notas de versão":
- "CHANGELOG" (ou os dois): atualize a seção "Unreleased" do
  `CHANGELOG.md`.
- "GitHub Releases", sem `CHANGELOG.md`: não crie o arquivo. Escreva
  as notas na conversa, no formato das últimas releases (os mesmos
  títulos de seção), para eu colar na release.
- "nenhuma": pergunte qual dos dois usar e registre em "Decisões do
  projeto". Só então crie o `CHANGELOG.md`, se eu escolher ele.

Pacote ou lib JS/TS v1+:
- notas com Added, Changed, Deprecated, Removed, Fixed e Security (no
  `CHANGELOG.md`, formato Keep a Changelog), a partir de "Mudanças para
  documentar" do progresso (o que não tem a marca "nas notas",
  inclusive o já documentado)
- `UPGRADE.md` com passo a passo se houver quebra de API
- sugestão da próxima versão em semver a partir da última tag: major se
  houver quebra de API, minor se houver funcionalidade nova, patch se só
  houver correções; sem tag, diga só o tipo da mudança (major, minor
  ou patch)

Aplicação (Laravel ou Nuxt/Next) em produção — notas de deploy, da
mesma lista:
- migrations novas e se alguma é lenta ou exige ordem/duas fases
- chaves novas de `.env` e de config (no Next, as `NEXT_PUBLIC_`
  exigem novo build)
- comandos a rodar (caches, `queue:restart`, seeders obrigatórios)
- URLs que mudaram e os redirecionamentos criados
- mudanças em API pública, jobs ou webhooks e o plano de compatibilidade

Mostre as notas na conversa e grave-as no progresso; no projeto, só no
`CHANGELOG.md` existente ou escolhido em "nenhuma" e no `UPGRADE.md`,
se houver quebra de API.

Marque como "nas notas" o que entrou nelas: o próximo fechamento não
repete esses itens. A lista só é apagada pelo `reset`. O que o
relatório extra da seção 2 aplicar entra na lista e atualiza as notas
antes do resumo final.

O que for gravado no projeto vai num commit sugerido como no item 5
da seção 5 do `SKILL.md`, feito pelo fluxo de commit antes da seção 2
deste arquivo.

Não crie tag nem release; eu faço.
Em `report`: só descreva o que entraria nas notas, sem criar arquivos,
e pule a seção 2.

## 2. Revisão independente
Quem fez as mudanças não deve ser o único a revisá-las. As skills
abaixo revisam com subagentes de contexto limpo, que não veem esta
conversa, então podem rodar nesta sessão. Pergunte quais rodar e
PARE até a resposta:
- `- [ ] Rodar o /code-review sobre as mudanças da revisão`, sobre a
  branch da revisão ou, na branch padrão, o intervalo a partir do pai
  do primeiro commit do que foi revisado (em etapa avulsa, caminho ou
  modo, o primeiro daquela etapa, caminho ou modo); se ele não aceitar
  um intervalo, diga e oriente-me. Sem nenhuma mudança, pule esta
  seção;
- `- [x] Rodar o /security-review sobre as mudanças da revisão`, só
  se as mudanças da revisão tocam áreas sensíveis: autenticação,
  autorização (policies, gates, middleware), validação de entrada,
  queries cruas, uploads, sessão, cookies, CORS, headers de
  segurança, criptografia, segredos ou dependências. Escrita marcada,
  como sugestão: só vale se eu marcar. Abaixo dela, recuado, os
  arquivos sensíveis que mudaram. Sem nenhum, não a mostre.
  Ela revisa só os commits que `origin/HEAD` ainda não tem (`git diff
  origin/HEAD...`), inclusive na branch padrão, e não vê o que está
  sem commit. Confira com `git log --oneline origin/HEAD..`: sem
  saída, ou sem esse ref, não a mostre; diga que ela não teria o que
  analisar e sugira rodá-la antes do push ou, se o projeto não commita
  direto na branch padrão, fazer as próximas revisões numa branch
  própria (ex.: `review/<assunto>`, sem data). Se parte dos commits
  da revisão já foi enviada, avise quais ficam de fora.

Rode as marcadas nesta ordem, pela ferramenta de skills (Skill), sem
nível (`max` e `ultra` só se eu pedir). Sem a ferramenta, ou se uma
skill não estiver disponível, diga e oriente-me a rodá-la.

Os achados das duas viram um único relatório extra, no ciclo normal
(aprovo o que aplicar). Mostre todos, sem descartar nem rebaixar
nenhum: quem fez as mudanças não filtra a revisão delas. Se discordar
de um achado, diga por quê no próprio item e deixe a decisão comigo.
Um achado que repete um item já recusado numa etapa ou uma "Decisão do
projeto" continua no relatório, com a marca "já recusado em <etapa>"
ou "já decidido" e o motivo registrado no progresso.

Para mudanças grandes antes do merge, mencione o `/code-review ultra`
(roda na nuvem e é cobrado): só eu posso rodá-lo.

## 3. Resumo final
Etapas feitas, passos pulados ("pula"), itens aplicados e recusados,
"Decisões tomadas", testes adicionados, quebras de API e perguntas que
ficaram pendentes.
