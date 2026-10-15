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

Плагин читается прямо из папки репозитория: после `git pull` достаточно перезапустить сессию Claude.
Он добавляет хуки (события → панель) и скилл `/flow`.

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
- Папку `.flow/` решить: коммитить планы в git или добавить в `.gitignore`.

Перезапустить Claude Code в проекте — хуки подхватываются только при старте сессии.

## 5. Включить системные уведомления

В панели: **Settings → Notifications → Allow notifications**, затем **Send test**.
Там же правила: с какого уровня показывать каждый тип, «только когда вкладка скрыта»,
теги «всегда показывать» / «заглушить», звук. Вкладка панели должна быть открыта (можно в фоне).

## 6. Работать

1. Сказать агенту `/flow new <название задачи>` — он составит план в `.flow/<slug>.md`
   и начнёт выполнять; придёт уведомление «Plan created» (`#plan`).
2. Агент отмечает шаги и пишет в журнал шаги, отклонения, решения, блокеры — каждое событие
   приходит уведомлением.
3. Если агент отдаёт шаг субагенту, тот ведёт свой подплан со ссылкой на родительский шаг
   (вложенность любой глубины).
4. Где смотреть:
   - страница проекта → секция **Flows** (дерево планов);
   - клик по плану или уведомлению → сессия с фильтром по агентам плана, вкладка **Plan**;
   - колокольчик в сайдбаре — лента уведомлений.

## Если что-то не работает

- **В панели нет событий** — панель запущена (шаг 2)? Сессия Claude перезапущена после установки?
  `claude plugin list` показывает `agents-observe` как enabled? В Claude: `/observe status`.
- **План не обновляется** — агент правит `.flow/*.md` только через Edit/Write; правки через Bash
  или руками панель не видит.
- **Нет вложенного плана у субагента** — субагенты не загружают скиллы: родитель должен передать
  в промпт блок правил из `skills/flow/SKILL.md` (раздел «Delegating a step to a subagent»).
- **Нет системных уведомлений** — разрешение браузера (шаг 5) и правила в Settings → Notifications.
