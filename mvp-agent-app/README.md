# 精轴智控工艺辅助智能体

本应用是“精轴智控工艺辅助智能体（基础版）”的本地部署版本，用于选手训练、现场作业辅助、质量记录和规则校核。

学生使用界面不出现“本地开发控制台”“MVP-V1.0”等开发字样。技术版本和部署说明仅保留在文档中。

## Competition Mode

The default first screen is now `选手服务`, designed from the contestant perspective:

- Gives each contestant role-specific question templates, record actions, speaking lines, and risk reminders.
- Keeps the quality evidence board as a secondary view.
- Keeps model configuration and rule-checking chat away from the main contestant workflow.

Use this mode for选手训练 and现场作业 support. Use `工艺问答` and `资料库` for rule checking and project-material access.

## Field Records

The `现场记录` tab provides a lightweight rehearsal record workspace:

- G1-G8 status, measured/evidence fields, and notes.
- Exception handling records.
- G8 archive draft fields.
- Save to browser `localStorage`, export JSON, reset, and print.

Records stay on the local browser and are not uploaded to the server.

## Material Generation

The `材料生成` tab converts current field records into reusable archive drafts:

- G3首件检验记录
- 异常处置记录
- G8终检归档摘要
- 应用价值摘要

Missing measured data remains marked as `待补充`; the app does not fabricate values.

## Competition Workflow

The `比赛流程` tab supports actual work sequencing:

- Start/pause/reset local competition timer.
- View the five source-defined time windows from the MVP package.
- Filter tasks by 1号、2号、3号 responsibilities.
- Mark each stage as pending, doing, done, or blocked.
- Export an evidence pack after completeness checks.

## Local Run

```powershell
cd mvp-agent-app
npm start
```

Open `http://localhost:8080`.

## Docker Run

From repository root:

```powershell
docker compose up --build
```

Open `http://localhost:8080`.

## Smoke Test

```powershell
cd mvp-agent-app
node .\scripts\smoke-test.js http://localhost:8080
```

PowerShell version:

```powershell
cd mvp-agent-app
.\scripts\Invoke-MvpSmoke.ps1 -BaseUrl http://localhost:8080
```

## Optional External Provider

The app can call an OpenAI-compatible chat-completions endpoint for development testing when these environment variables are configured:

```text
AI_PROVIDER_BASE_URL
AI_PROVIDER_API_KEY
AI_PROVIDER_MODEL
```

DeepSeek example:

```text
AI_PROVIDER_BASE_URL=https://api.deepseek.com
AI_PROVIDER_MODEL=deepseek-chat
AI_PROVIDER_API_KEY=your-deepseek-api-key
```

Local `npm start` now reads `.env` from the repository root or `mvp-agent-app/.env`. Docker Compose still reads `.env` from the repository root. DeepSeek URLs are normalized automatically, so `https://api.deepseek.com` and `https://api.deepseek.com/v1` both work.

Without these variables, `/api/ask` uses `local_rule_engine` and clearly labels the response as local development validation.

Docker Compose reads `.env` from the repository root. Copy `.env.example` to `.env`, fill in the provider values, then restart:

```powershell
Copy-Item ..\.env.example ..\.env
# Edit ..\.env and set AI_PROVIDER_API_KEY
docker compose down
docker compose up --build -d
```

Provider status can be checked at:

```text
GET /api/provider/status
```

In the application, open `系统管理` to view model service status, replacement steps, and the system capability list. API keys are never shown in the UI.

## Commercial Pilot Readiness

The app now separates three user flows:

- `选手端`: role-based service for 1号、2号、3号 contestants.
- `教师端`: T01-T08 test batches, real answer records, manual judgement, and acceptance summary.
- `管理员端`: model service, knowledge base, and role capability configuration.

T01-T08 has two modes:

- `本地预检`: uses the local rule engine for development checks only.
- `真实模型测试`: requires configured model service and saves the actual model responses as a test batch.

Manual judgement is required before any batch can be used as acceptance evidence. The app must not mark a project as accepted only because local smoke tests or local prechecks pass.

Field records are saved in browser `localStorage` and also posted to the server runtime directory for local handoff backup. This remains a local MVP record workflow, not a production audit system.
