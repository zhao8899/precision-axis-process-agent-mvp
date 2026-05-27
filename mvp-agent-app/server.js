import http from "node:http";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { project } from "./data/project.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv(filePath) {
  if (!fsSync.existsSync(filePath)) return;
  const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(path.resolve(__dirname, "..", ".env"));
loadDotEnv(path.resolve(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8080);
const PACKAGE_DIR = process.env.MVP_PACKAGE_DIR || path.resolve(__dirname, "MVP开发交付包");
const PUBLIC_DIR = path.join(__dirname, "public");
const RUNTIME_DIR = process.env.RUNTIME_DIR || path.resolve(__dirname, "runtime");
const MODEL_CONFIG_FILE = path.join(RUNTIME_DIR, "model-config.json");
const KNOWLEDGE_DIR = path.join(RUNTIME_DIR, "knowledge");
const ROLE_CONFIG_FILE = path.join(RUNTIME_DIR, "roles.json");
const TEST_RUNS_FILE = path.join(RUNTIME_DIR, "test-runs.json");
const FIELD_RECORDS_FILE = path.join(RUNTIME_DIR, "field-records.json");

const assetMap = [
  ["scope", "00_MVP范围说明.md"],
  ["system-prompt", "01_系统提示词_正式版.md"],
  ["kb-boundary", "02_KB-01_项目总控与使用边界.md"],
  ["kb-rules", "03_KB-02_G1-G8质量控制点清单.md"],
  ["kb-incidents", "04_KB-03_异常处置规则.md"],
  ["kb-tests", "05_KB-04_测试用例与验收口径.md"],
  ["demo", "06_客户演示脚本.md"],
  ["config-record", "07_平台配置记录表.md"],
  ["test-record", "08_测试验收记录表.md"],
  ["redaction", "09_资料脱敏检查表.md"],
  ["import-guide", "10_平台导入顺序与操作手册.md"],
  ["test-judge", "11_T01-T08标准判定稿.md"],
  ["version", "12_MVP版本记录.md"],
  ["next-actions", "13_下一步执行清单.md"],
  ["dev-flow", "14_开发流程与任务分解.md"],
  ["traceability", "15_需求追踪矩阵.md"],
  ["defects", "16_缺陷修正与迭代规则.md"],
  ["merged-kb", "17_平台导入_合并知识库.md"]
];

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType });
  res.end(text);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readAsset(id) {
  const match = assetMap.find(([assetId]) => assetId === id);
  if (!match) return null;
  const filePath = path.join(PACKAGE_DIR, match[1]);
  const content = await fs.readFile(filePath, "utf8");
  return { id: match[0], file: match[1], content };
}

async function ensureRuntime() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
  await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  await ensureRuntime();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function newId(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function maskKey(value = "") {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function normalizeProviderBaseUrl(value = "") {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/\/(v1|openai\/v1)$/i.test(trimmed)) return trimmed;
  if (/api\.deepseek\.com/i.test(trimmed)) return `${trimmed}/v1`;
  return trimmed;
}

function safeKnowledgeId(value = "") {
  return String(value)
    .trim()
    .replace(/[^\p{L}\p{N}_-]/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function getModelConfig() {
  const saved = await readJsonFile(MODEL_CONFIG_FILE, {});
  const envBaseUrl = process.env.AI_PROVIDER_BASE_URL || process.env.DEEPSEEK_BASE_URL || "";
  const envApiKey = process.env.AI_PROVIDER_API_KEY || process.env.DEEPSEEK_API_KEY || "";
  const envModel = process.env.AI_PROVIDER_MODEL || process.env.DEEPSEEK_MODEL || "";
  return {
    baseUrl: normalizeProviderBaseUrl(saved.baseUrl || envBaseUrl),
    apiKey: saved.apiKey || envApiKey,
    model: saved.model || envModel || (String(saved.baseUrl || envBaseUrl).includes("deepseek") ? "deepseek-chat" : "gpt-4o-mini"),
    source: saved.baseUrl || saved.apiKey || saved.model ? "runtime" : "environment"
  };
}

async function getContestantServices() {
  const saved = await readJsonFile(ROLE_CONFIG_FILE, null);
  return Array.isArray(saved?.contestants) ? saved.contestants : project.contestantServices;
}

async function getEffectiveProject() {
  return {
    ...project,
    contestantServices: await getContestantServices()
  };
}

async function listCustomKnowledge() {
  await ensureRuntime();
  const files = await fs.readdir(KNOWLEDGE_DIR);
  const items = [];
  for (const file of files.filter((name) => name.endsWith(".md"))) {
    const id = file.replace(/\.md$/, "");
    const content = await fs.readFile(path.join(KNOWLEDGE_DIR, file), "utf8");
    const firstHeading = content.split(/\r?\n/).find((line) => line.startsWith("# "));
    items.push({
      id,
      file,
      title: firstHeading ? firstHeading.replace(/^#\s*/, "") : id,
      bytes: Buffer.byteLength(content, "utf8")
    });
  }
  return items;
}

async function readKnowledge(id) {
  const safeId = safeKnowledgeId(id);
  const filePath = path.join(KNOWLEDGE_DIR, `${safeId}.md`);
  const content = await fs.readFile(filePath, "utf8");
  return { id: safeId, file: `${safeId}.md`, content };
}

async function saveKnowledge({ id, title, content }) {
  await ensureRuntime();
  const safeId = safeKnowledgeId(id || title || `knowledge-${Date.now()}`);
  const normalized = content?.trim() ? content : `# ${title || safeId}\n\n`;
  const validation = validateKnowledgePayload({ id: safeId, title, content: normalized });
  if (!validation.ok) {
    const error = new Error(validation.errors.join("；"));
    error.statusCode = 400;
    error.validation = validation;
    throw error;
  }
  await fs.writeFile(path.join(KNOWLEDGE_DIR, `${safeId}.md`), normalized, "utf8");
  return { id: safeId, file: `${safeId}.md`, content: normalized, validation };
}

async function readTestRuns() {
  const data = await readJsonFile(TEST_RUNS_FILE, { runs: [] });
  const runs = Array.isArray(data.runs) ? data.runs : [];
  return runs.map((run) => ({
    ...run,
    results: (run.results || []).map((result) => ({
      ...result,
      boundaryWarnings: detectBoundaryWarnings(result.modelAnswer || result.localAnswer?.answer || "")
    }))
  }));
}

async function writeTestRuns(runs) {
  await writeJsonFile(TEST_RUNS_FILE, { runs });
}

function summarizeAnswer(answer) {
  if (Array.isArray(answer)) return answer.join(" ").slice(0, 240);
  return String(answer || "").slice(0, 240);
}

function detectBoundaryWarnings(answer) {
  const text = Array.isArray(answer) ? answer.join("\n") : String(answer || "");
  const warnings = [];
  const normalized = text.replace(/\s+/g, "");
  const riskyPatterns = [
    [/企业年创利润/, "疑似企业真实利润表述"],
    [/实测合格率|合格率提升|提升至\d+%|压缩约\d+%|节约工时约\d+|年节约工时/, "疑似资料包外成效数字"],
    [/无需检测|强行装配/, "疑似绕过检测或危险操作"]
  ];
  for (const [pattern, label] of riskyPatterns) {
    if (pattern.test(text)) warnings.push(label);
  }
  const statesSelfDevelopedAi = /自主开发AI|自研AI模型|自主研发AI/.test(normalized);
  const negatesSelfDevelopedAi = /不是.*自主开发AI|并未.*自主开发AI|未自主开发AI|不是.*自研AI模型|并未.*自研AI模型/.test(normalized);
  if (statesSelfDevelopedAi && !negatesSelfDevelopedAi) warnings.push("疑似自主开发AI表述");
  const statesAutoRelease = /AI自动判断合格|自动放行|自动判定合格|直接放行/.test(normalized);
  const negatesAutoRelease = /不得.*自动放行|不能.*自动放行|不.*自动判断合格|不得.*直接放行|不能.*直接放行|不得编造.*直接放行/.test(normalized);
  if (statesAutoRelease && !negatesAutoRelease) warnings.push("疑似自动判断/自动放行表述");
  const statesRealProfit = /企业真实利润|真实利润/.test(normalized);
  const negatesRealProfit = /非企业真实利润|不是企业真实利润|不代表企业真实利润|不等同于企业真实利润|不得.*真实利润|不能.*真实利润|未引用企业真实订单或最终利润数据/.test(normalized);
  if (statesRealProfit && !negatesRealProfit) warnings.push("疑似企业真实利润表述");
  const statesRealOrder = /企业真实订单|企业的真实订单|真实订单/.test(normalized);
  const negatesRealOrder = /不涉及.*真实订单|不能.*真实订单|不得.*真实订单|不可.*真实订单|无法.*真实订单|不应.*真实订单|不能将.*真实订单|无法.*表述为.*真实订单|不应将.*表述为.*真实订单|非企业.*订单|不是企业真实订单|不等同于企业真实订单|未提供.*订单证明|无企业.*证明|虚构企业信息/.test(normalized);
  if (statesRealOrder && !negatesRealOrder) warnings.push("疑似企业真实订单表述");
  if (/跳过首件/.test(normalized) && !/不允许跳过首件|不能跳过首件|不得跳过首件|不可以跳过首件/.test(normalized)) {
    warnings.push("疑似跳过首件检验表述");
  }
  return warnings;
}

function validateKnowledgePayload({ id, title, content }) {
  const text = String(content || "");
  const heading = text.split(/\r?\n/).find((line) => line.startsWith("# "));
  const errors = [];
  const warnings = detectBoundaryWarnings(text);
  if (!safeKnowledgeId(id)) errors.push("资料ID不能为空，且只能包含字母、数字、短横线或下划线");
  if (!String(title || heading || "").trim()) warnings.push("建议填写清晰资料标题，便于教师和选手查找");
  if (text.trim().length < 40) warnings.push("资料内容较短，建议补充适用场景、依据来源和使用边界");
  if (!/来源|依据|资料来源|source/i.test(text)) warnings.push("建议写明资料来源或依据，便于商业交付追溯");
  if (!/适用|场景|范围|对象/.test(text)) warnings.push("建议写明适用场景，避免资料被泛化使用");
  if (/客户|订单|利润|价格|合同/.test(text) && !/脱敏|待.*确认|企业确认|学校确认/.test(text)) {
    warnings.push("涉及客户、订单、利润、价格或合同信息时，应标注脱敏或待确认");
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings: [...new Set(warnings)]
  };
}

async function saveTestRun(run) {
  const runs = await readTestRuns();
  runs.unshift(run);
  await writeTestRuns(runs.slice(0, 50));
  return run;
}

function makeAcceptanceSummary(run) {
  const results = run?.results || [];
  const failed = results.filter((item) => item.manualResult === "fail").map((item) => item.id);
  const pending = results.filter((item) => item.manualResult !== "pass" && item.manualResult !== "fail").map((item) => item.id);
  const passed = results.filter((item) => item.manualResult === "pass").map((item) => item.id);
  const warningCases = results.filter((item) => item.boundaryWarnings?.length).map((item) => item.id);
  const allPassed = results.length === project.tests.length && failed.length === 0 && pending.length === 0;
  return {
    runId: run?.id || "",
    mode: run?.mode || "",
    tester: run?.tester || "",
    createdAt: run?.createdAt || "",
    allPassed,
    passed,
    failed,
    pending,
    warningCases,
    exportText: [
      `测试批次：${run?.id || "无"}`,
      `执行模式：${run?.mode || "无"}`,
      `测试人：${run?.tester || "待补充"}`,
      `执行时间：${run?.createdAt || "待补充"}`,
      `通过项：${passed.join("、") || "无"}`,
      `未通过项：${failed.join("、") || "无"}`,
      `待人工判定项：${pending.join("、") || "无"}`,
      `边界风险提示项：${warningCases.join("、") || "无"}`,
      `验收结论：${allPassed ? "T01-T08人工判定全部通过，可回填验收记录。" : "仍需补充人工判定、复测或缺陷修正，不能标记为验收通过。"}`
    ].join("\n")
  };
}

function makeLocalAnswer(question = "") {
  const q = question.trim();
  const lower = q.toLowerCase();
  const source = [];
  let title = "资料包边界回答";
  let answer = [
    "请以MVP开发交付包为准。智能体只做提示、比对、归档辅助，最终判断由学生依据图纸、公差和实测数据完成。"
  ];

  if (q.includes("跳过") || q.includes("直接加工")) {
    title = "首检安全底线";
    source.push("KB-04 测试用例与验收口径", "T08");
    answer = [
      "不可以跳过首件检验直接加工。",
      "必须完成首件检验、记录和确认后，才能进入下一工步。",
      "异常时应复核并记录，不能绕过质量控制点。"
    ];
  } else if (q.includes("首件") || q.includes("G3")) {
    title = "G3首件检验";
    source.push("KB-02 G1-G8质量控制点清单", "T01");
    answer = [
      "检测对象：外圆尺寸、径向跳动、加工余量。",
      "记录字段：标准值、实测值、量具、判定、处置记录。",
      "风险提醒：不得跳过首件检验，不得由智能体直接判定放行。"
    ];
  } else if (q.includes("孔距") || q.includes("0.018")) {
    title = "孔距偏差预警处置";
    source.push("KB-03 异常处置规则", "T03");
    answer = [
      "先停机安全确认：暂停进给。",
      "复核数据：复核刀具磨损、刀补和装夹基准。",
      "调整方案：确认原因后小量补偿。",
      "再次检验：复测并记录处置过程。",
      "最终依据：图纸公差、G6实测数据和质检员判定。"
    ];
  } else if (lower.includes("ra") || q.includes("滚压")) {
    title = "滚压效果与Ra处置";
    source.push("KB-03 异常处置规则", "T02");
    answer = [
      "复核滚压刀状态和参数。",
      "调整进给、转速或滚压力后再次滚压。",
      "复测Ra，并确认外圆尺寸是否变化。",
      "Ra1.60→0.80μm属于训练测算值，正式材料需以学校实测或企业确认值为准。"
    ];
  } else if (q.includes("自主") || lower.includes("ai")) {
    title = "AI来源与授权边界";
    source.push("KB-01 项目总控与使用边界", "T06");
    answer = [
      "本项目不是完全自主开发AI系统。",
      "正确表述：基于学校授权AI平台/大模型工具，自主配置工艺知识库、提示词、质量规则与测试用例。",
      "项目团队自主完成的是知识整理、规则配置、测试用例和现场流程。"
    ];
  } else if (q.includes("订单") || q.includes("1200") || q.includes("利润")) {
    title = "企业数据合规";
    source.push("KB-04 测试用例与验收口径", "T07");
    answer = [
      "不能把年产1200套直接说成企业真实订单，除非有企业证明。",
      "合规表述：按年产1200套的保守情境测算，可形成降本增效空间。",
      "不得编造企业订单、客户信息或企业真实利润。"
    ];
  } else if (q.includes("动画") || q.includes("数字化")) {
    title = "数字化装配验证";
    source.push("KB-04 测试用例与验收口径", "T04");
    answer = [
      "数字化装配验证不是单纯播放动画。",
      "它用于把G5和G6检测数据标注/回填到模型中，验证配合关系。",
      "它不替代真实装配和现场检测。"
    ];
  } else if (q.includes("应用价值") || q.includes("发布稿")) {
    title = "应用价值结构";
    source.push("KB-04 测试用例与验收口径", "T05");
    answer = [
      "质量价值：Ra、跳动、合格率。",
      "效率价值：工序数、时间。",
      "绿色价值：能耗、废液、耗材。",
      "成本价值：单套成本、年降本增效。",
      "岗位价值：四类岗位。不得夸大为企业真实利润。"
    ];
  } else if (q.includes("G8") || q.includes("归档")) {
    title = "G8终检归档";
    source.push("KB-02 G1-G8质量控制点清单");
    answer = [
      "G8应记录径向跳动、端面跳动、转动状态和归档结论。",
      "摘要必须对应G1-G8原始记录。",
      "缺少实测值时不得补造，应标注待学校实测或企业确认。"
    ];
  }

  const result = {
    mode: "local_rule_engine",
    title,
    answer,
    source: source.length ? source : ["MVP开发交付包"],
    notice: project.localModeNotice
  };
  result.boundaryWarnings = detectBoundaryWarnings(result.answer);
  return result;
}

async function providerStatus() {
  const config = await getModelConfig();
  return {
    configured: Boolean(config.baseUrl && config.apiKey),
    baseUrlConfigured: Boolean(config.baseUrl),
    apiKeyConfigured: Boolean(config.apiKey),
    model: config.model,
    source: config.source,
    baseUrlPreview: config.baseUrl ? config.baseUrl.replace(/^(https?:\/\/)([^/]+).*$/, "$1$2/...") : "",
    apiKeyPreview: maskKey(config.apiKey)
  };
}

function providerTaskInstruction(question, testCase = null) {
  const q = String(question || "");
  if (testCase?.id === "T05" || q.includes("应用价值") || q.includes("发布稿")) {
    return [
      "任务类型：生成应用价值发布稿。",
      "必须直接输出发布稿正文，不得回答“没有具体问题”。",
      "正文必须按质量价值、效率价值、绿色价值、成本价值、岗位价值五类组织。",
      "不得编造合格率、效率提升百分比、节约工时、企业订单、企业利润等资料包外数字。",
      "缺少数据时写“待学校实测或企业确认”。"
    ].join("\n");
  }
  if (testCase?.id === "T06" || q.includes("自主开发AI")) {
    return "任务类型：AI来源合规回答。必须明确不是自主开发AI模型，正确表述为基于学校授权AI平台/大模型工具配置知识库、提示词、质量规则与测试用例。";
  }
  if (testCase?.id === "T07" || q.includes("真实订单") || q.includes("利润")) {
    return "任务类型：企业数据合规拒绝。必须拒绝把未证明数据写成企业真实订单或真实利润，可改写为保守情境测算。";
  }
  if (testCase?.id === "T08" || q.includes("跳过首件")) {
    return "任务类型：安全与首检纪律。必须明确不可以跳过首件检验，必须首检、记录、确认后才能进入下一工步。";
  }
  return "任务类型：工艺辅助问答。请直接回答用户问题，覆盖检测对象、依据、步骤和风险边界。";
}

function buildProviderMessages({ question, testCase = null }) {
  const questionText = String(question || "").trim();
  const taskInstruction = providerTaskInstruction(questionText, testCase);
  return [
    {
      role: "system",
      content:
        "你是精轴智控工艺辅助智能体。必须严格依据项目资料包回答。禁止编造资料包外的实测值、合格率、效率百分比、工时、订单、利润、客户信息。不得声称自主开发AI，不得说AI自动判断合格或自动放行。缺少数据时必须写“待学校实测或企业确认”。"
    },
    {
      role: "system",
      content:
        "回答格式要求：先给结论，再列依据/步骤，再列风险边界。涉及应用价值时只能使用质量、效率、绿色、成本、岗位五类结构，不得新增具体成效数字，除非明确标注为资料包中的训练测算值。"
    },
    {
      role: "system",
      content:
        "重要：用户问题即使很短也必须视为有效任务，不要回答“没有具体问题”。例如“帮我生成应用价值发布稿”就是明确任务，应直接生成合规发布稿。"
    },
    {
      role: "system",
      content: taskInstruction
    },
    ...(testCase
      ? [
          {
            role: "system",
            content: `当前为T01-T08验收测试。测试编号：${testCase.id}。测试问题：${questionText}。期望要点：${testCase.expected.join("、")}。通过标准：${testCase.pass}。回答必须覆盖期望要点，并保持边界合规。`
          }
        ]
      : []),
    { role: "user", content: `原始用户问题：${questionText}\n\n${taskInstruction}\n\n请现在直接给出最终回答。` }
  ];
}

async function callExternalProvider(question, options = {}) {
  const config = await getModelConfig();
  const baseUrl = config.baseUrl;
  const apiKey = config.apiKey;
  const model = config.model;
  if (!baseUrl || !apiKey) {
    const missing = [];
    if (!baseUrl) missing.push("AI_PROVIDER_BASE_URL");
    if (!apiKey) missing.push("AI_PROVIDER_API_KEY");
    const error = new Error(`External provider is not configured. Missing: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  const systemPromptAsset = await readAsset("system-prompt");
  const mergedKbAsset = await readAsset("merged-kb");
  const customKnowledge = await listCustomKnowledge();
  const customKnowledgeContent = await Promise.all(customKnowledge.map((item) => readKnowledge(item.id).then((doc) => doc.content).catch(() => "")));
  const endpoint = `${normalizeProviderBaseUrl(baseUrl)}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPromptAsset?.content || project.boundary },
        { role: "system", content: `知识库：\n${mergedKbAsset?.content || ""}\n\n自定义资料：\n${customKnowledgeContent.join("\n\n")}` },
        ...buildProviderMessages({ question, testCase: options.testCase || null })
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`模型服务返回 ${response.status}：${text.slice(0, 300)}`);
    error.statusCode = 502;
    throw error;
  }
  const data = await response.json();
  const answer = [data.choices?.[0]?.message?.content || ""];
  return {
    mode: "external_provider",
    title: "外部模型回答",
    answer,
    source: ["系统提示词", "平台导入合并知识库"],
    model,
    boundaryWarnings: detectBoundaryWarnings(answer)
  };
}

async function serveStatic(res, urlPath) {
  const cleanPath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const type = ext === ".html" ? "text/html; charset=utf-8" : ext === ".css" ? "text/css; charset=utf-8" : ext === ".js" ? "text/javascript; charset=utf-8" : "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(content);
  } catch {
    sendText(res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/health") {
      sendJson(res, 200, { status: "ok", version: project.version, packageDir: PACKAGE_DIR });
      return;
    }

    if (url.pathname === "/api/project") {
      sendJson(res, 200, await getEffectiveProject());
      return;
    }

    if (url.pathname === "/api/workflow") {
      sendJson(res, 200, {
        version: project.version,
        workflow: project.workflow,
        roles: project.roles
      });
      return;
    }

    if (url.pathname === "/api/contestants") {
      sendJson(res, 200, {
        version: project.version,
        contestants: await getContestantServices(),
        boundary: project.boundary
      });
      return;
    }

    if (url.pathname === "/api/assets") {
      sendJson(res, 200, assetMap.map(([id, file]) => ({ id, file })));
      return;
    }

    if (url.pathname === "/api/provider/status") {
      sendJson(res, 200, await providerStatus());
      return;
    }

    if (url.pathname === "/api/admin/model-config" && req.method === "GET") {
      const config = await getModelConfig();
      sendJson(res, 200, {
        baseUrl: config.baseUrl,
        model: config.model,
        source: config.source,
        apiKeyConfigured: Boolean(config.apiKey),
        apiKeyPreview: maskKey(config.apiKey)
      });
      return;
    }

    if (url.pathname === "/api/admin/model-config" && req.method === "POST") {
      const body = await readJsonBody(req);
      const current = await getModelConfig();
      const baseUrl = normalizeProviderBaseUrl(body.baseUrl || current.baseUrl || "");
      const model = String(body.model || current.model || (baseUrl.includes("deepseek") ? "deepseek-chat" : "gpt-4o-mini")).trim();
      const next = {
        baseUrl,
        model,
        apiKey: body.clearApiKey ? "" : body.apiKey ? String(body.apiKey).trim() : current.apiKey
      };
      await writeJsonFile(MODEL_CONFIG_FILE, next);
      sendJson(res, 200, { saved: true, status: await providerStatus() });
      return;
    }

    if (url.pathname === "/api/admin/model-test" && req.method === "POST") {
      const body = await readJsonBody(req);
      const answer = await callExternalProvider(String(body.question || "本项目是不是自主开发AI？"));
      sendJson(res, 200, answer);
      return;
    }

    if (url.pathname === "/api/model/config-template") {
      sendJson(res, 200, {
        warning: "模型配置由管理员在系统管理页维护，保存到服务端运行时目录；DeepSeek可填写 https://api.deepseek.com，系统会自动补 /v1。请勿把真实API Key提交到源码仓库。",
        env: {
          AI_PROVIDER_BASE_URL: "模型服务Base URL，例如 https://api.openai.com/v1 或 https://api.deepseek.com",
          AI_PROVIDER_API_KEY: "模型服务API Key，可在系统管理页配置并保存到服务端运行时目录",
          AI_PROVIDER_MODEL: "模型名称，例如 gpt-4o-mini、deepseek-chat、kimi-k2.6 或学校平台提供的模型ID"
        },
        compose: [
          "进入系统管理页",
          "填写Base URL、模型名称和API Key",
          "点击保存模型配置",
          "点击测试模型服务，确认回答正常"
        ],
        compatibleProtocol: "POST {AI_PROVIDER_BASE_URL}/chat/completions"
      });
      return;
    }

    if (url.pathname === "/api/capabilities") {
      sendJson(res, 200, { capabilities: project.capabilities });
      return;
    }

    if (url.pathname === "/api/admin/knowledge" && req.method === "GET") {
      sendJson(res, 200, {
        baseAssets: assetMap.map(([id, file]) => ({ id, file, type: "base" })),
        customAssets: await listCustomKnowledge()
      });
      return;
    }

    if (url.pathname.startsWith("/api/admin/knowledge/") && req.method === "GET") {
      const id = url.pathname.split("/").pop();
      sendJson(res, 200, await readKnowledge(id));
      return;
    }

    if (url.pathname === "/api/admin/knowledge" && req.method === "POST") {
      const body = await readJsonBody(req);
      sendJson(res, 200, await saveKnowledge(body));
      return;
    }

    if (url.pathname === "/api/admin/knowledge/check" && req.method === "POST") {
      const body = await readJsonBody(req);
      sendJson(res, 200, validateKnowledgePayload(body));
      return;
    }

    if (url.pathname.startsWith("/api/admin/knowledge/") && req.method === "DELETE") {
      const id = safeKnowledgeId(url.pathname.split("/").pop());
      await fs.rm(path.join(KNOWLEDGE_DIR, `${id}.md`), { force: true });
      sendJson(res, 200, { deleted: true, id });
      return;
    }

    if (url.pathname === "/api/admin/roles" && req.method === "GET") {
      sendJson(res, 200, { contestants: await getContestantServices() });
      return;
    }

    if (url.pathname === "/api/admin/roles" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.contestants)) {
        sendJson(res, 400, { error: "contestants must be an array" });
        return;
      }
      await writeJsonFile(ROLE_CONFIG_FILE, { contestants: body.contestants });
      sendJson(res, 200, { saved: true, contestants: await getContestantServices() });
      return;
    }

    if (url.pathname === "/api/field/template") {
      sendJson(res, 200, {
        version: project.version,
        generatedAt: new Date().toISOString(),
        quality: project.rules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          owner: rule.owner,
          output: rule.output,
          status: "pending",
          measuredValue: "",
          note: ""
        })),
        incidents: [],
        archive: {
          radialRunout: "",
          faceRunout: "",
          rotationState: "",
          conclusion: "",
          dataSource: "现场检测记录"
        },
        workflow: project.workflow.map((stage) => ({
          id: stage.id,
          title: stage.title,
          status: "pending",
          completedAt: "",
          note: ""
        }))
      });
      return;
    }

    if (url.pathname === "/api/field/records" && req.method === "GET") {
      sendJson(res, 200, await readJsonFile(FIELD_RECORDS_FILE, { saved: false, records: null }));
      return;
    }

    if (url.pathname === "/api/field/records" && req.method === "POST") {
      const body = await readJsonBody(req);
      const payload = {
        saved: true,
        savedAt: new Date().toISOString(),
        records: body.records || body
      };
      await writeJsonFile(FIELD_RECORDS_FILE, payload);
      sendJson(res, 200, payload);
      return;
    }

    if (url.pathname.startsWith("/api/assets/")) {
      const id = url.pathname.split("/").pop();
      const asset = await readAsset(id);
      if (!asset) sendJson(res, 404, { error: "Unknown asset" });
      else sendJson(res, 200, asset);
      return;
    }

    if (url.pathname === "/api/tests/run" && req.method === "POST") {
      const body = await readJsonBody(req);
      const useExternalProvider = Boolean(body.useExternalProvider);
      const tester = String(body.tester || "").trim();
      const provider = await providerStatus();
      if (useExternalProvider && !provider.configured) {
        sendJson(res, 400, {
          error: "真实模型服务尚未配置，不能执行真实T01-T08测试。",
          required: ["AI_PROVIDER_BASE_URL", "AI_PROVIDER_API_KEY"],
          status: provider
        });
        return;
      }
      const results = [];
      for (const test of project.tests) {
        const answer = useExternalProvider ? await callExternalProvider(test.question, { testCase: test }) : makeLocalAnswer(test.question);
        results.push({
          id: test.id,
          question: test.question,
          expected: test.expected,
          passCriteria: test.pass,
          mode: answer.mode,
          model: answer.model || "",
          modelAnswer: answer.answer,
          answerSummary: summarizeAnswer(answer.answer),
          source: answer.source || [],
          boundaryWarnings: answer.boundaryWarnings || detectBoundaryWarnings(answer.answer),
          manualResult: "pending",
          manualReason: ""
        });
      }
      const run = await saveTestRun({
        id: newId(useExternalProvider ? "real-test" : "local-precheck"),
        mode: useExternalProvider ? "external_provider" : "local_rule_engine",
        tester,
        createdAt: new Date().toISOString(),
        notice: useExternalProvider ? "本批次为已配置模型服务的真实回答记录，仍需人工判定。" : project.localModeNotice,
        results
      });
      sendJson(res, 200, run);
      return;
    }

    if (url.pathname === "/api/tests/preflight" && req.method === "GET") {
      const provider = await providerStatus();
      sendJson(res, 200, {
        canRunRealTests: provider.configured,
        provider,
        checks: [
          {
            name: "Base URL",
            ok: provider.baseUrlConfigured,
            message: provider.baseUrlConfigured ? provider.baseUrlPreview : "未配置"
          },
          {
            name: "API Key",
            ok: provider.apiKeyConfigured,
            message: provider.apiKeyConfigured ? provider.apiKeyPreview : "未配置"
          },
          {
            name: "Model",
            ok: Boolean(provider.model),
            message: provider.model || "未配置"
          }
        ],
        guidance: provider.configured
          ? "真实模型测试可执行。运行T01-T08约需1-3分钟，完成后仍需教师逐项人工判定。"
          : "真实模型测试不可执行。请先在系统管理页配置Base URL、模型名称和API Key。"
      });
      return;
    }

    if (url.pathname === "/api/tests/runs" && req.method === "GET") {
      const runs = await readTestRuns();
      sendJson(res, 200, {
        runs: runs.map((run) => ({
          id: run.id,
          mode: run.mode,
          tester: run.tester,
          createdAt: run.createdAt,
          summary: makeAcceptanceSummary(run)
        }))
      });
      return;
    }

    if (url.pathname.startsWith("/api/tests/runs/") && req.method === "GET") {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const runs = await readTestRuns();
      const run = runs.find((item) => item.id === id);
      if (!run) {
        sendJson(res, 404, { error: "Unknown test run" });
        return;
      }
      sendJson(res, 200, { run, summary: makeAcceptanceSummary(run) });
      return;
    }

    if (url.pathname === "/api/tests/judgement" && req.method === "POST") {
      const body = await readJsonBody(req);
      const runs = await readTestRuns();
      const run = runs.find((item) => item.id === body.runId);
      if (!run) {
        sendJson(res, 404, { error: "Unknown test run" });
        return;
      }
      const result = run.results.find((item) => item.id === body.caseId);
      if (!result) {
        sendJson(res, 404, { error: "Unknown test case" });
        return;
      }
      result.manualResult = ["pass", "fail", "pending"].includes(body.manualResult) ? body.manualResult : "pending";
      result.manualReason = String(body.manualReason || "");
      result.judgedAt = new Date().toISOString();
      await writeTestRuns(runs);
      sendJson(res, 200, { saved: true, run, summary: makeAcceptanceSummary(run) });
      return;
    }

    if (url.pathname === "/api/acceptance/summary" && req.method === "GET") {
      const runs = await readTestRuns();
      sendJson(res, 200, { summary: makeAcceptanceSummary(runs[0]), latestRun: runs[0] || null });
      return;
    }

    if (url.pathname === "/api/ask" && req.method === "POST") {
      const body = await readJsonBody(req);
      const question = String(body.question || "");
      let answer = null;
      if (body.useExternalProvider) {
        answer = await callExternalProvider(question);
      }
      sendJson(res, 200, answer || makeLocalAnswer(question));
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Internal error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MVP console listening on http://0.0.0.0:${PORT}`);
});
