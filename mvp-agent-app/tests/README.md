# MVP Local Smoke Test Approach

This folder is the verification-support area for the Dockerized MVP app. It intentionally does not define application behavior; it only provides a lightweight contract that can be pointed at the local app once implementation exists.

## Scope

The smoke test checks three layers:

1. Health: the service starts and exposes a live endpoint, defaulting to `GET /health`.
2. Static UI: the browser entry page returns successfully and contains project-facing text such as `精轴智控`.
3. API: representative agent calls return useful text and respect MVP boundaries from `MVP开发交付包`, especially T01 and T07.

It is not a substitute for real T01-T08 platform/model acceptance. The authoritative acceptance artifacts remain:

- `MVP开发交付包/05_KB-04_测试用例与验收口径.md`
- `MVP开发交付包/08_测试验收记录表.md`
- `MVP开发交付包/11_T01-T08标准判定稿.md`

## Run

After the Dockerized MVP is running locally:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Invoke-MvpSmoke.ps1 -BaseUrl http://localhost:18080
```

If the implementation uses different routes, copy `tests/smoke.config.example.json` to a local smoke config and pass it with `-ConfigPath`.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Invoke-MvpSmoke.ps1 -BaseUrl http://localhost:3000 -ConfigPath .\tests\smoke.config.local.json
```

## Expected Contract

The example config assumes:

- `GET /health` returns `200`.
- `GET /` returns `200` and includes `精轴智控`.
- `POST /api/ask` accepts JSON with a `question` field and returns response text.

Adjust only the smoke config if the final app uses a different endpoint shape.
