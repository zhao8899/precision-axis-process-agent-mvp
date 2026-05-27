# Repository Guidelines

## Project Structure & Module Organization

This repository is a documentation and MVP delivery package for the “精轴智控工艺辅助智能体（基础版）” project.

- Root `00_` to `08_` `.docx` files are the original source materials and requirement records.
- `MVP开发交付包/` contains the implementation-ready MVP assets: scope, system prompt, knowledge-base files, test records, demo script, platform setup guide, and version tracking.
- `G1-G8结构化规则库.md` and `MVP演示问题清单.md` are working reference tables. Treat `MVP开发交付包/` as the current delivery baseline.

## Build, Test, and Development Commands

There is no build system or application runtime in this repository.

Useful inspection commands:

```powershell
Get-ChildItem -Name
Get-Content .\MVP开发交付包\README.md -Encoding UTF8
Select-String -Path .\MVP开发交付包\*.md -Pattern "T01|T08|自主开发AI|自动判断合格" -Encoding UTF8
```

Use these to verify document coverage before handoff. Real validation happens in the authorized AI platform using `08_测试验收记录表.md`.

## Writing Style & Naming Conventions

Use concise, formal Chinese for project-facing content. Keep wording aligned with the source documents. Do not add capabilities outside the `00_` to `08_` materials.

Naming patterns:

- Source documents: numbered prefix, e.g. `01_基础版智能体需求说明书.docx`.
- MVP assets: numbered prefix inside `MVP开发交付包/`, e.g. `03_KB-02_G1-G8质量控制点清单.md`.
- Keep Markdown tables simple and platform-import friendly.

## Testing Guidelines

Testing is scenario-based, not unit-test based.

- Use `05_KB-04_测试用例与验收口径.md` for T01-T08 definitions.
- Use `11_T01-T08标准判定稿.md` to judge real model answers.
- Record real platform responses in `08_测试验收记录表.md`.
- Never replace model testing with prewritten answers.

## Commit & Pull Request Guidelines

This directory is not currently a Git repository, so no project history conventions are available. If Git is initialized later, use clear, scoped commit messages such as:

```text
docs: add MVP platform setup guide
docs: update G1-G8 quality control rules
```

Pull requests should include a short summary, affected files, source-document basis, and whether T01-T08 or platform configuration records need updates.

## Security & Configuration Tips

Do not commit unredacted school names, enterprise names, drawing numbers, customer data, order prices, contracts, student personal information, or unauthorized software screenshots.

Preserve these boundaries in every edit: no “自主开发AI”, no “AI自动判断合格”, no fabricated measured values, and no enterprise order/profit claims without confirmation.
