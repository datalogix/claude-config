# Checklist extra: filas, eventos e agendamento (aplicações)

Aplicado junto com `code.md` (nesta mesma pasta) em `app/Jobs`,
`app/Listeners`, `app/Events`, `app/Console`, `app/Notifications` e
`app/Mail`. O agendamento (`routes/console.php`, `bootstrap/app.php`)
recebe este checklist na etapa `resources`, pasta `routes/`.

## Jobs
- idempotentes: rodar duas vezes não duplica efeito (cobrança, e-mail)
- `tries`, `timeout`, `backoff` (e `maxExceptions`/`retryUntil` quando
  fizer sentido) definidos, com `timeout` menor que o `retry_after` da
  conexão
- `ShouldBeUnique` ou middleware `WithoutOverlapping` quando duas
  execuções simultâneas causam problema
- método `failed()` quando a falha precisa de tratamento ou aviso
- `SerializesModels` com model que pode ser apagado:
  `deleteWhenMissingModels`
- payload pequeno: IDs ou models, não coleções enormes ou arquivos
- disparo depois do commit (`afterCommit`) quando depende de dados
  recém-gravados
- fila e conexão certas para a prioridade do trabalho
- aplicação no estágio em produção: mudar construtor ou propriedades
  quebra jobs já na fila

## Listeners e eventos
- listeners lentos ou com chamadas externas implementam `ShouldQueue`
- sem lógica de negócio importante escondida em listener de evento de
  model sem teste
- eventos com dados suficientes, sem objetos pesados

## Notificações e e-mails
- enfileirados (`ShouldQueue`)
- sem dados sensíveis no conteúdo além do necessário

## Comandos e agendamento
- comandos com assinatura e descrição claras, códigos de saída
  corretos, confirmação em operações destrutivas (`--force` em produção)
- tarefas agendadas com `withoutOverlapping`, `onOneServer` (se houver
  mais de um servidor) e timezone explícito quando o horário importa
- processamento em lote (`chunkById`, `lazyById`) em vez de carregar
  tudo na memória

## Testes
`Queue::fake`/`Bus::fake` para verificar o disparo; o `handle()` do job
testado diretamente; `Event::fake`, `Notification::fake`, `Mail::fake`;
comandos testados com `artisan()` e códigos de saída.
