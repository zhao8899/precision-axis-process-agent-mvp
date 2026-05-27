# Multi-Agent MVP Development Plan

## Goal

Build a local Docker-deployable MVP console for the “精轴智控工艺辅助智能体（基础版）” project. The console is a real development artifact for organizing, validating, and demonstrating the MVP assets in `MVP开发交付包/`.

It does not replace the school-authorized AI platform. It provides a local control surface for:

- Viewing MVP scope, prompts, KB files, and rules.
- Running T01-T08 validation checks.
- Testing a source-grounded local response engine.
- Optionally connecting to an OpenAI-compatible model endpoint for development testing.
- Preparing the platform configuration and customer demo.

## Priority Order

1. **P0: Source-grounded project data**
   - Encode G1-G8, T01-T08, constraints, and demo flow from the delivery package.
   - Keep source references visible in the UI.

2. **P1: Local MVP console**
   - Build a browser UI for project overview, KB assets, rules, tests, and validation chat.
   - Make all outputs traceable to the MVP package.

3. **P2: API and validation endpoints**
   - `/health`
   - `/api/project`
   - `/api/assets`
   - `/api/assets/:id`
   - `/api/ask`
   - `/api/tests/run`

4. **P3: Docker deployment**
   - Provide Dockerfile and docker-compose.
   - Confirm the app starts locally and health check passes.

5. **P4: Smoke testing**
   - Add scripted checks for health, project data, test execution, and UI delivery.

## Multi-Agent Work Split

- Main agent: app scaffold, server, UI, Docker, integration, final validation.
- Worker A: product/requirements support docs under `mvp-agent-app/docs/`.
- Worker B: smoke-test support under `mvp-agent-app/tests/` or `mvp-agent-app/scripts/`.

## Acceptance Criteria

- `docker compose up --build` starts the app.
- `GET /health` returns `ok`.
- UI opens at `http://localhost:8080`.
- G1-G8 and T01-T08 are visible in the UI.
- `/api/tests/run` returns all expected test IDs.
- Local responses explicitly report `mode: local_rule_engine` unless an external provider is configured.
- Documentation states that final validation still requires the school-authorized AI platform.
