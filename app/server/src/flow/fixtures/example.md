---
title: Порт инвентаря из Godot
status: active            # active | blocked | done
updated: 2026-10-15T14:25
---
## Цель
Перенести систему инвентаря на UActorComponent с сохранением поведения прототипа.

## Шаги
- [x] S1 Разобрать Inventory.gd и сигналы
- [~] S2 UInventoryComponent + сериализация
- [ ] S3 UI-виджет WBP_Inventory
- [-] S4 Drag&drop (пропущен: не нужен в прототипе)
- [!] S5 Сохранения (блокер: нет SaveGame-системы)

## Журнал
- 14:02 decision S2 #api — Используем TArray<FItemStack> вместо TMap: нужен порядок слотов
- 14:10 deviation/high S3 #scope — UI делаю на UMG вместо CommonUI, план изменён
- 14:25 step S1 — Готово, сигналы → делегаты
