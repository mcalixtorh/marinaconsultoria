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
npm test           # 34 testes (datas, recorrência, atrasados, lembretes, busca)
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

## Google Agenda (futuro)

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
