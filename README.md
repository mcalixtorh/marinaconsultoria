# Central de Rotina

Aplicativo de rotina pessoal e profissional da Marina Calixto (Consultoria Inspiração RH).
Instalável no celular como PWA (React + TypeScript + Vite). Em português do Brasil.

## O que funciona hoje (testado)

Sem nenhuma configuração, tudo isto funciona e fica salvo **no aparelho**:

- **Meu dia**: saudação, progresso do dia, 3 prioridades (salvas por dia), atrasados, hoje, tarefas sem horário, próximos, rotinas e "A organizar".
- **Agenda**: Hoje / Amanhã / Semana / Mês, com clique no dia e "Adicionar neste dia".
- **Tarefas**: criar, editar, excluir (2 passos), concluir, marcar em andamento, reagendar (hoje / amanhã / 7 dias), filtros por situação, prioridade e categoria.
- **Recorrência**: todos os dias, toda semana (com escolha de dias), todo mês, todo dia 1º, personalizado (a cada N dias/semanas/meses). Cada ocorrência é concluída separadamente.
- **Lembretes**: vários por item (1 dia, 3 h, 1 h, 30 min, 10 min, no horário).
- **Alarmes**: nome, horário, dias, repetição (toda semana ou uma vez), ativar/desativar, tela "Parar / Soneca 5 min" com som.
- **Assistente (IA)**: na tela Meu dia, escreva ou fale "cancelar a entrevista da Beatriz", "passa a reunião do Leonardo para amanhã às 15h", "o que tenho amanhã?", "anota: pedir currículo da Gabriella". Veja a seção *Assistente de IA* abaixo: **precisa de configuração e de uma chave paga da Anthropic**.
- **Alarme rápido**: escreva ou fale (microfone do teclado) "alarme 9h30 fazer café da manhã" e o alarme é criado na hora, com Desfazer. Entende "nove e meia", "da tarde", "amanhã", "todo dia", "toda segunda", "dias úteis". É um leitor de regras em português (`src/lib/quickAlarm.ts`), sem IA e sem internet; frases muito fora do comum podem não ser entendidas, e então o app avisa.
- **Rotinas** marcáveis por dia, **Anotações** com salvamento automático, **Busca** (sem diferenciar acento/maiúscula), **Painel** só com números, **Categorias** (criar; não exclui as em uso).
- **Backup**: Ajustes › Exportar/Restaurar (arquivo .json).
- **Abre sem internet** depois da primeira visita.
- **Dados iniciais** importados do Google Agenda e das suas anotações (`src/data/initial.json`): 50 itens, 5 deles sem data em "A organizar", 4 rotinas, 3 alarmes (desativados, como no arquivo) e 1 nota "Para confirmar".

## Limites reais (leia)

| Situação | O que acontece |
|---|---|
| App aberto ou em segundo plano | Lembretes e alarmes avisam na hora (notificação + som). |
| App **totalmente fechado**, sem servidor de push | **Nada toca.** Ao reabrir, os avisos perdidos aparecem em "Avisos que passaram". Isto é uma limitação do navegador: um site não consegue agendar alarmes sozinho com o app fechado. |
| App fechado, **com** push configurado | Avisa de verdade (ver "Push" abaixo). |
| iPhone | Notificações só funcionam depois de **Compartilhar › Adicionar à Tela de Início** e abrir por esse ícone (iOS 16.4+). |
| Alarme como o do relógio do celular | Um site não substitui o app de Relógio. Para acordar de manhã, mantenha também um alarme no relógio do aparelho. |
| Celular ↔ computador | Só com o Supabase configurado e a sincronização é **manual** (enviar/trazer), última cópia vence. |
| Google Agenda | Só a importação inicial foi feita. A sincronização contínua **não existe ainda** (estrutura em `src/integrations/google.ts`). |

## Rodar no computador

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 99 testes (datas, recorrência, atrasados, lembretes, busca, alarme rápido, assistente, Google Agenda)
npm run build
```

O service worker (abrir offline) só é registrado no build (`npm run preview`), não no `dev`.

## Publicar (Vercel) — o app no celular

1. Suba este repositório no GitHub.
2. Em vercel.com › Add New › Project, escolha o repositório. Framework: **Vite**. Deploy.
3. Abra o endereço no celular:
   - **Android (Chrome)**: menu ⋮ › *Instalar app*.
   - **iPhone (Safari)**: Compartilhar › *Adicionar à Tela de Início*.

Cada aparelho guarda seus próprios dados até você configurar o Supabase. Use o backup para levar os dados de um para outro.

## Sincronização + push (opcional): Supabase

1. Crie um projeto em supabase.com e rode `supabase/schema.sql` no SQL Editor.
2. Em Authentication › URL Configuration, coloque o endereço do app da Vercel.
3. Gere as chaves de push: `npx web-push generate-vapid-keys`.
4. Variáveis na Vercel (veja `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`. Refaça o deploy.
5. Publique a função de avisos (com a CLI do Supabase):
   ```bash
   supabase functions deploy send-reminders --no-verify-jwt
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:voce@email.com
   ```
6. Ative as extensões `pg_cron` e `pg_net` e rode o bloco `cron.schedule` que está comentado no fim de `supabase/schema.sql`.
7. No app: Ajustes › entrar com e-mail › *Enviar este aparelho para a nuvem* › *Ativar push neste aparelho*.

> **Status:** o código de sincronização e push está escrito e passa na checagem de tipos, mas **não foi testado contra um projeto Supabase real** (não havia credenciais). Teste com cuidado e exporte um backup antes.

## Assistente de IA (Claude)

Comandos em português viram mudanças no app. Como funciona:

1. O app manda o seu pedido e um **resumo** da agenda (títulos, datas, horários, ids; sem as descrições longas) para uma função do servidor (`api/assistant.ts`).
2. A função pergunta à Claude, que **só propõe ações** (criar, alterar, concluir, cancelar, alarme, anotação).
3. O app **valida** cada ação contra os seus dados (`src/assistant/actions.ts`). Ids inventados e datas inválidas são recusados.
4. **Apagar/cancelar sempre pede confirmação.** O resto é aplicado na hora, com **Desfazer** enquanto nada mais mudar.

**Para ativar** (Vercel › Settings › Environment Variables, depois redeploy):

| Variável | O que é |
|---|---|
| `ANTHROPIC_API_KEY` | chave da API em console.anthropic.com (precisa de crédito/cobrança lá). **Digite você mesma na Vercel; não cole em conversas.** |
| `ASSISTANT_PASSCODE` | uma senha que você inventa. Sem ela a função recusa tudo, para ninguém usar a sua chave. O app pede essa senha na primeira vez em cada aparelho. |
| `ASSISTANT_MODEL` | opcional. Padrão `claude-opus-5-5`. `claude-haiku-4-5` é bem mais barato, mas erra mais com nomes parecidos. |

**Custo:** é cobrado por uso, pela Anthropic. Estimativa grosseira com o modelo padrão: algo como 1 a 3 centavos de dólar por comando, dependendo do tamanho da agenda. Defina um limite de gasto no console da Anthropic.

**Limites e cuidados**
- O assistente só mexe **no app**. Cancelar uma entrevista aqui **não** cancela no Google Agenda e **não avisa a candidata**. O app mostra um aviso quando o item veio do Google Agenda.
- **Privacidade:** nomes de candidatas e clientes, títulos, datas e horários vão para a Anthropic a cada comando. Veja os termos da Anthropic e se isso cabe na sua política de privacidade (LGPD).
- A IA pode errar o item ou a data. Por isso a confirmação ao apagar, o resumo do que foi feito e o Desfazer.
- Não funciona no `npm run dev` (a função `/api` só existe publicada na Vercel).
- **Status do teste:** a lógica de validação e a função foram testadas contra um servidor **falso** que imita a API. **Não houve teste com a Claude de verdade** (sem chave). Se a API recusar algum parâmetro, o app mostra "Erro da IA (código)" e o motivo aparece em Vercel › Logs.

## Google Agenda (leitura pelo endereço secreto)

O app **lê** o seu Google Agenda ao abrir e a cada 10 minutos (e em Ajustes › *Atualizar agora*).

- **Só leitura, do Google para o app.** O que você cria ou muda no app **não** vai para o Google.
- **Atraso do Google:** o Google atualiza esse link devagar. Um evento novo pode levar **de minutos a várias horas** para aparecer. Isso não dá para acelerar por esse caminho (só com a conexão oficial/OAuth).
- **Quem manda em quê:** o Google manda no título, data, horário, descrição e link; o app guarda concluído, categoria, prioridade, lembretes e pessoa. Se você mudar a data de um evento do Google só no app, a próxima leitura devolve a data do Google.
- **Eventos que se repetem** viram um item por ocorrência (14 dias para trás e 120 para frente). Exceções e datas excluídas são respeitadas.
- **Sem duplicar:** os eventos da carga inicial são reconhecidos por título + data + horário.
- **Apagou no app, não volta:** o que você cancela/apaga no app é lembrado e não é recriado. Evento apagado no Google some do app (só os futuros). Uma leitura vazia nunca apaga nada.
- **Segurança:** o endereço secreto fica **só no servidor** (`ICAL_URL` na Vercel); o navegador nunca o vê. A função só aceita endereços de `calendar.google.com` e exige a mesma senha do assistente (`ASSISTANT_PASSCODE`).

**Para ativar** (Vercel › Environment Variables, todos os ambientes, e depois redeploy):

| Variável | O que é |
|---|---|
| `ICAL_URL` | Google Agenda (no computador) › Configurações › seu calendário › *Integrar agenda* › **Endereço secreto no formato iCal** |
| `ASSISTANT_PASSCODE` | a mesma senha do assistente (o app pede uma vez em cada aparelho: Ajustes › Google Agenda) |

Se o link vazar, use *Redefinir endereço secreto* no Google e atualize `ICAL_URL`.

> **Status do teste:** a leitura foi testada com calendários de exemplo (fusos, repetições com exceção, cancelados, dia inteiro) e com um Google simulado no navegador. **Não foi testada contra o seu calendário real.**

## Google Agenda em dois sentidos (futuro, OAuth)

Requer um projeto no Google Cloud com a Calendar API e um ID de cliente OAuth. O contrato a implementar está em `src/integrations/google.ts` (importar eventos, exportar itens). As telas não precisam mudar.

## Regras de negócio

- **Atrasado** = não concluído e (data anterior a hoje, ou hoje com horário já passado e tipo *Tarefa*). Lembretes e itens sem data nunca ficam atrasados. "Atrasado" é calculado, nunca gravado.
- Recorrentes mostram só a ocorrência atrasada mais recente (olha até 60 dias para trás).
- Sem data = "A organizar". Nenhuma data é presumida.
- Lembretes disparados com o app fechado viram "Avisos que passaram" (até 3 dias).

## Estrutura

```
src/lib/         lógica pura e testada (datas, recorrência, tarefas, lembretes, busca)
src/store.tsx    estado e gravação local
src/notify.tsx   verificação de lembretes/alarmes, som, notificações
src/screens/     telas
src/integrations/ Supabase/push (opcional) e Google (estrutura)
supabase/        schema.sql e função send-reminders
public/sw.js     service worker (offline, notificações, push)
```
