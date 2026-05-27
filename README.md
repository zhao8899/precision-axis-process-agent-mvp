# Precision Axis Process Agent MVP

精轴智控工艺辅助智能体（基础版）交付仓库，用于中职机械设计与制造赛道的工艺辅助、质量控制、现场记录、材料归档和T01-T08测试验收。

## 项目定位

本项目不是自主研发AI模型，而是基于学校授权AI平台或OpenAI兼容模型服务，自主配置工艺知识库、提示词、G1-G8质量规则和测试用例，形成面向比赛训练和现场展示的工艺辅助智能体。

边界原则：

- 智能体负责提示、比对、归档辅助。
- 学生负责操作、判断、放行、处置。
- 不声称AI自动判断合格。
- 不编造实测值、企业真实订单、企业真实利润或客户信息。

## 目录结构

```text
.
├─ MVP开发交付包/              # 当前交付基线，包含系统提示词、KB、测试口径、导入手册
├─ mvp-agent-app/              # 本地Docker可部署MVP应用
│  ├─ public/                  # 前端页面、样式、交互逻辑
│  ├─ data/                    # 项目结构化数据：角色、流程、G1-G8、T01-T08
│  ├─ docs/                    # MVP功能优先级、接口模型、验收清单
│  ├─ scripts/                 # Smoke test脚本
│  └─ tests/                   # 测试说明与示例配置
├─ G1-G8结构化规则库.md
├─ MVP演示问题清单.md
├─ docker-compose.yml
└─ .env.example
```

原始 `.docx` 文件和本地运行时数据不纳入Git提交范围，避免误提交未脱敏资料、API Key、现场测试记录和浏览器本地记录。

## 本地运行

```powershell
cd mvp-agent-app
npm install
npm start
```

默认访问：

```text
http://localhost:8080
```

Docker运行：

```powershell
docker compose up --build
```

默认访问：

```text
http://localhost:18080
```

## 模型服务

支持OpenAI兼容的 Chat Completions 接口。DeepSeek示例：

```text
AI_PROVIDER_BASE_URL=https://api.deepseek.com
AI_PROVIDER_MODEL=deepseek-chat
AI_PROVIDER_API_KEY=your-api-key
```

本地 `npm start` 会读取仓库根目录 `.env` 或 `mvp-agent-app/.env`。真实密钥只能保存在 `.env` 或运行时配置中，不得提交到Git。

## 验证

```powershell
cd mvp-agent-app
npm run test:smoke -- http://localhost:18080
```

Smoke test只证明本地应用和基础API可用，不能替代真实模型T01-T08验收。

真实验收流程：

1. 在系统管理页配置真实模型服务。
2. 在T01-T08页面运行真实模型测试。
3. 保存真实回答批次。
4. 教师逐项人工判定。
5. 根据验收摘要回填测试验收记录。

## 当前能力

- 选手端：按1号、2号、3号提供提问模板、记录动作、现场话术和风险提醒。
- 比赛流程：按资料包时间窗口组织G1、G3、G4、G6、G8关键阶段，支持计时、状态、备注、提问、记录、材料跳转。
- 现场记录：G1-G8记录、异常处置、G8归档草稿、本机保存和服务端运行时备份。
- 材料生成：G3首检、异常处置、G8终检归档、应用价值摘要。
- 教师端：T01-T08本地预检、真实模型测试、人工判定、验收摘要。
- 管理员端：模型服务、资料库、角色能力配置。

## 商用边界

当前适合学校竞赛训练、实训演示和基础版试点交付。它不是生产级MES/QMS系统，也不包含机床、检测设备、ERP、QMS接口。正式商用验收必须以真实模型测试、教师人工判定、学校实测或企业确认数据为准。
