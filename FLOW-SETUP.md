# Подключение Agents Observe + Flow к проекту

Панель показывает агентов Claude Code, их планы (`.flow/*.md`) и присылает уведомления:
план создан, шаг выполнен, отклонение от плана, самостоятельное решение, блокер, нужен ввод.

Требования: Node.js 20+, Git, Claude Code 2.1+. Docker не нужен.

## 1. Получить код и зависимости (один раз)

```powershell
git clone https://github.com/dikiyPetr/agents-observe.git
cd agents-observe
git switch feat/flow-notifications
cd app/server; npm install; cd ../client; npm install; cd ../..
```

## 2. Запустить панель

Из корня `agents-observe`, в отдельном терминале — держать открытым, пока работаешь:

```powershell
$env:AGENTS_OBSERVE_RUNTIME='dev'; $env:AGENTS_OBSERVE_SHUTDOWN_DELAY_MS='0'; node start.mjs --skip-install
```

bash: `AGENTS_OBSERVE_RUNTIME=dev AGENTS_OBSERVE_SHUTDOWN_DELAY_MS=0 node start.mjs --skip-install`

Панель: http://localhost:5174 (API: http://localhost:4981/api/health).

## 3. Установить плагин в Claude Code (один раз)

```powershell
claude plugin marketplace add <путь-к>/agents-observe
claude plugin install agents-observe@agents-observe --scope user
```

Claude Code копирует плагин в свой кэш (`~/.claude/plugins/cache/…`) по версии из `plugin.json`.
Пока версия не поменялась, `plugin update` копию не обновит, поэтому после `git pull`
переустановите плагин и перезапустите сессию Claude:

```powershell
claude plugin uninstall agents-observe@agents-observe
claude plugin install agents-observe@agents-observe --scope user
```

Плагин добавляет хуки (события → панель, правила flow) и скилл `/flow`.

## 4. Настроить проект

В корне проекта создать `.claude/settings.local.json`:

```json
{
  "env": {
    "AGENTS_OBSERVE_RUNTIME": "dev",
    "AGENTS_OBSERVE_PROJECT_SLUG": "my-game"
  }
}
```

- `AGENTS_OBSERVE_RUNTIME` — чтобы при выключенной панели хук не пытался запускать Docker.
- `AGENTS_OBSERVE_PROJECT_SLUG` — имя проекта в панели (необязательно, по умолчанию — имя папки).
  В монорепо задайте один slug для всех пакетов: flow лежат в `.flow/` у корня git.
- Папка `.flow/` — обычные файлы рабочего дерева. Коммитить их или добавить в `.gitignore` —
  решение проекта; агент сам их не прячет и не коммитит отдельно.
- Отключить flow в проекте: `"AGENTS_OBSERVE_FLOW": "off"` в том же `env`.

Перезапустить Claude Code в проекте — хуки подхватываются только при старте сессии.

## 5. Включить системные уведомления

В панели: **Settings → Notifications → Allow notifications**, затем **Send test**.
Там же правила: с какого уровня показывать каждый тип, «только когда вкладка скрыта»,
теги «всегда показывать» / «заглушить», звук. Вкладка панели должна быть открыта (можно в фоне).

## 6. Работать

Ничего специально вызывать не нужно — работайте как обычно: plan mode, свой скилл планирования,
правила из CLAUDE.md. Хуки плагина подсказывают агенту, когда вести flow, и показывают формат уже
после того, как план составлен, поэтому на само планирование они не влияют.

1. **Многошаговая задача.** Агент заводит `.flow/<slug>.md`:
   - есть письменный план (документ плана, plan mode, нумерованный план в чате) — flow его
     зеркалит, `source:` указывает на документ, сам документ не меняется;
   - плана нет — flow ведётся как журнал сделанного: шаги дописываются по мере выполнения.
   Вопросы, объяснения и правки в один шаг flow не создают.
2. **План ждёт одобрения** (ваш процесс требует APPROVED) — flow в статусе `review`, приходит
   уведомление «Plan awaiting approval». После одобрения статус `active`.
3. Шаги, отклонения от плана, самостоятельные решения и блокеры приходят уведомлениями.
4. Субагенты не трогают `.flow/`; только если агент отдаёт им многошаговую часть работы, они
   ведут свой подплан со ссылкой на родительский шаг.
5. Ручные команды: `/flow status` — прогресс текущего flow, `/flow done` — закрыть его.
6. Где смотреть:
   - страница проекта → секция **Flows** (дерево планов);
   - клик по плану или уведомлению → сессия с фильтром по агентам плана, вкладка **Plan**
     (рядом с путём flow — путь к документу плана);
   - колокольчик в сайдбаре — лента уведомлений.

## Если что-то не работает

- **В панели нет событий** — панель запущена (шаг 2)? Сессия Claude перезапущена после установки?
  `claude plugin list` показывает `agents-observe` как enabled? В Claude: `/observe status`.
- **План не обновляется** — агент правит `.flow/*.md` только через Edit/Write; правки через Bash
  или руками панель не видит.
- **Flow не появляется** — `claude plugin list` показывает актуальную версию? Не задан ли
  `AGENTS_OBSERVE_FLOW=off`? Задача точно многошаговая? Flow не пишется в plan mode — он
  появляется после одобрения плана.
- **Нет системных уведомлений** — разрешение браузера (шаг 5) и правила в Settings → Notifications.
