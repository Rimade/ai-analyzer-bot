# 📘 Project Best Practices

## 1. Project Purpose
AI Analyzer Bot - это Telegram бот на NestJS, который позволяет пользователям загружать фотографии (портреты, еда, товары) для анализа с помощью AI (GPT-4 Vision). Бот поддерживает различные режимы анализа (MERCH, FOOD, CHARACTER, GENERAL), систему подписок с бесплатными попытками и Pro-статусом, а также интеграцию с PostgreSQL через Prisma ORM.

## 2. Project Structure
```
src/
├── analysis/          # Модуль анализа изображений
├── payments/          # Модуль платежей и подписок
├── prisma/           # Prisma ORM сервис и модуль
├── telegram/         # Telegram бот логика (Telegraf)
├── users/            # Управление пользователями
├── app.module.ts     # Корневой модуль приложения
└─�� main.ts           # Точка входа приложения

prisma/
├── migrations/       # Миграции базы данных
└── schema.prisma     # Схема базы данных

test/                 # E2E тесты
```

**Ключевые директории:**
- `src/` - основной код приложения с модульной архитектурой NestJS
- `prisma/` - схема БД и миграции для PostgreSQL
- `test/` - интеграционные тесты

## 3. Test Strategy
**Фреймворк:** Jest с поддержкой TypeScript через ts-jest

**Организация тестов:**
- Unit тесты: `*.spec.ts` файлы рядом с исходным кодом
- E2E тесты: в папке `test/` с суффиксом `.e2e-spec.ts`
- Конфигурация Jest в `package.json` и `test/jest-e2e.json`

**Стратегия мокирования:**
- Используйте `@nestjs/testing` для создания тестовых модулей
- Мокайте внешние зависимости (Prisma, Telegram API, OpenAI API)
- Для E2E тестов используйте `--runInBand --detectOpenHandles` для предотвращения утечек

**Команды тестирования:**
```bash
npm run test          # Unit тесты
npm run test:watch    # Unit тесты в watch режиме
npm run test:cov      # Unit тесты с покрытием
npm run test:e2e      # E2E тесты
```

## 4. Code Style
**TypeScript конфигурация:**
- Строгая типизация включена
- Используйте интерфейсы и типы из `@prisma/client`
- Обязательная типизация для всех параметров и возвращаемых значений

**Naming Conventions:**
- Файлы: `kebab-case` (например, `users.service.ts`)
- Классы: `PascalCase` (например, `UsersService`)
- Методы и переменные: `camelCase`
- Константы: `UPPER_SNAKE_CASE`
- Модули: `PascalCase` с суффиксом `Module`

**Комментирование:**
- Используйте JSDoc для публичных методов
- Комментируйте сложную бизнес-логику на русском языке
- Добавляйте TODO комментарии для будущих улучшений

**Обработка ошибок:**
- Используйте NestJS встроенные исключения (`BadRequestException`, `NotFoundException`)
- Логируйте ошибки с контекстом через `console.error`
- Graceful shutdown для Telegram бота через SIGINT/SIGTERM

## 5. Common Patterns
**Dependency Injection:**
- Все сервисы регистрируются через `@Injectable()`
- Используйте конструкторную инъекцию зависимостей
- Модули импортируют необходимые зависимости через `imports`

**Configuration Management:**
- `ConfigModule.forRoot({ isGlobal: true })` для глобального доступа к env переменным
- Валидация обязательных переменных в конструкторах сервисов
- Используйте `ConfigService` для получения значений

**Database Patterns:**
- Prisma Client через `PrismaService` как синглтон
- Используйте Prisma типы (`AnalysisType`, `SubStatus`, `PaymentStatus`)
- Транзакции для связанных операций

**Telegram Bot Patterns:**
- Один сервис `TelegramService` для всей логики бота
- Handlers регистрируются в `setupHandlers()` методе
- Graceful shutdown через process signals

## 6. Do's and Don'ts

### ✅ Do's
- Всегда используйте типизацию TypeScript
- Валидир��йте environment переменные при запуске
- Используйте Prisma транзакции для связанных операций
- Мокайте внешние API в тестах
- Логируйте важные события и ошибки
- Используйте enum'ы из Prisma схемы
- Применяйте graceful shutdown для долгоживущих процессов

### ❌ Don'ts
- Не используйте `any` тип без крайней необходимости
- Не забывайте обрабатывать ошибки в async функциях
- Не оставляйте открытые handles в тестах
- Не хардкодите конфигурационные значения
- Не используйте прямые SQL запросы вместо Prisma
- Не забывайте про rate limiting для Telegram API
- Не игнорируйте миграции базы данных

## 7. Tools & Dependencies

**Core Framework:**
- `@nestjs/core` - основной фреймворк
- `@nestjs/config` - управление конфигурацией
- `@nestjs/common` - декораторы и утилиты

**Database:**
- `@prisma/client` - ORM клиент
- `prisma` - CLI для миграций и генерации

**Telegram Integration:**
- `telegraf` - библиотека для Telegram Bot API

**Testing:**
- `jest` - тестовый фреймворк
- `@nestjs/testing` - утилиты для тестирования NestJS
- `supertest` - HTTP тестирование для E2E

**Development Tools:**
- `eslint` + `prettier` - линтинг и форматирование
- `husky` + `lint-staged` - pre-commit hooks
- `ts-jest` - TypeScript поддержка в Jest

**Setup Instructions:**
```bash
# Установка зависимостей
npm install

# Настройка базы данных
cp .env.example .env
# Отредактируйте .env файл с вашими настройками

# Генерация Prisma клиента
npm run prisma:generate

# Применение миграций
npm run prisma:migrate

# Запуск в dev режиме
npm run start:dev
```

## 8. Other Notes

**Для LLM при генерации кода:**
- Всегда используйте существующие Prisma типы и enum'ы
- Следуйте модульной архитектуре NestJS
- Не забывайте про обработку ошибок в Telegram handlers
- Используйте `ConfigService` для получения env переменных
- Мокайте внешние зависимости в тестах
- Применяйте транзакции Prisma для связанных операций
- Учитывайте лимиты Telegram API (rate limiting)

**Специальные ограничения:**
- Telegram Bot API имеет лимиты на размер файлов (20MB для фото)
- OpenAI API требует обработки rate limits и ошибок
- PostgreSQL подключение должно быть устойчивым к разрывам
- E2E тесты должны запускаться с `--runInBand` для избежания конфликтов

**Архитектурные соображения:**
- Сервисы должны быть stateless для горизонтального масштабирования
- Используйте очереди для обработки AI запросов в продакшене
- Рассмотрите кеширование результатов анализа
- Реализуйте мониторинг и health checks для продакшена