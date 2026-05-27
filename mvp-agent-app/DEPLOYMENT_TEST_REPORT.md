# Deployment Test Report

Date: 2026-05-26

## Environment

- Host: Windows / PowerShell
- Docker CLI: 29.4.0
- Docker Compose: v5.1.1
- Service: `mvp-agent-console`
- Container: `jingzhouzhikong-mvp-agent-console`
- Published URL: `http://localhost:18080`

## Notes

The default host port `8080` was already allocated, so `docker-compose.yml` was updated to support a configurable host port:

```yaml
ports:
  - "${MVP_CONSOLE_PORT:-8080}:8080"
```

The deployment was started with:

```powershell
$env:MVP_CONSOLE_PORT='18080'
docker compose up --build -d
```

The container healthcheck was updated to use `127.0.0.1` instead of `localhost` to avoid container-local resolution issues.

## Verification Results

| Check | Result |
|---|---|
| Docker image build | Passed |
| Container start | Passed |
| Container health | Passed (`healthy`) |
| `GET /health` | Passed |
| `GET /` static UI | Passed |
| Competition-mode first screen text | Passed |
| `POST /api/ask` T01-style smoke | Passed |
| `POST /api/ask` T07 safety smoke | Passed |
| `GET /api/project` rules count | Passed (`8`) |
| `GET /api/project` tests count | Passed (`8`) |
| `GET /api/assets` asset count | Passed (`18`) |
| `POST /api/tests/run` | Passed (`8`, `local_rule_engine`) |
| Competition mode redesign rebuild | Passed |
| First-screen competition text check | Passed (`质量证据展示板`) |
| Field records workspace smoke | Passed |
| `GET /api/field/template` | Passed (`8` quality records) |
| T01-T08 use case test | Passed (`8/8`) |

Smoke command:

```powershell
cd mvp-agent-app
node .\scripts\smoke-test.js http://localhost:18080
```

## Browser Verification Boundary

An in-browser Playwright check was attempted, but the local Node REPL environment did not have the `playwright` package available. HTTP-level UI and API checks passed. Manual browser verification should open:

```text
http://localhost:18080
```

## Current Status

MVP local Docker deployment is running and validated at `http://localhost:18080`.

Competition mode is now the default first screen and is intended for现场展示 rehearsal. Development-only surfaces such as model provider status and validation chat remain available in separate tabs.

The `现场记录` tab supports G1-G8 record status, incident notes, G8 archive drafts, JSON export, reset, save, and print. Records are saved in browser localStorage and mirrored to the local server runtime directory for handoff backup; runtime records are not committed to Git.

The app still labels default answers as `local_rule_engine`. Final intelligent-agent acceptance must be performed on the school-authorized AI platform or by configuring an OpenAI-compatible provider through:

```text
AI_PROVIDER_BASE_URL
AI_PROVIDER_API_KEY
AI_PROVIDER_MODEL
```
