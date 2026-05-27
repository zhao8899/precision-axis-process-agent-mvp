const state = {
  project: null,
  assets: [],
  records: null,
  currentMaterial: "g3",
  currentTestRunId: "",
  selectedKnowledge: null,
  knowledgeFilter: "all",
  knowledgeSearch: ""
};

const $ = (selector) => document.querySelector(selector);

const knowledgeTemplates = {
  incident: {
    title: "孔距偏差处置补充",
    scenario: "G6孔距偏差接近阈值时的复核与处置",
    source: "教师确认/企业脱敏资料",
    owner: "1号质检员",
    body: ["## 处置步骤", "1. 暂停继续加工或装配。", "2. 复核装夹基准、刀补、量具和检测方法。", "3. 记录实测值、复测结果和处置依据。", "4. 由质检员依据图纸公差和实测数据判定。"]
  },
  inspection: {
    title: "首件检验补充记录口径",
    scenario: "G3首件检验和过程检验记录",
    source: "比赛训练记录/教师确认",
    owner: "1号质检员",
    body: ["## 记录要求", "1. 写明检测项目、实测值、量具和检测人。", "2. 缺少实测数据时标注待补充。", "3. 不用口头判断替代检测记录。"]
  },
  demo: {
    title: "现场演示话术补充",
    scenario: "客户或评委提问时的边界说明",
    source: "演示脚本/教师确认",
    owner: "指导教师",
    body: ["## 话术要点", "1. 先说明智能体是辅助提示和资料组织工具。", "2. 强调最终判断由学生依据图纸、公差和实测数据完成。", "3. 不声称自动放行或替代质检。"]
  },
  business: {
    title: "应用价值说明补充",
    scenario: "商业展示或验收汇报",
    source: "项目资料包/学校确认",
    owner: "项目负责人",
    body: ["## 价值说明", "1. 从质量、效率、绿色、成本和岗位能力五类说明价值。", "2. 未经学校或企业确认的数据标注为待确认。", "3. 不把训练测算写成企业真实订单或真实利润。"]
  },
  blank: {
    title: "新资料标题",
    scenario: "",
    source: "",
    owner: "",
    body: ["## 内容", "请输入资料内容。", "", "## 使用边界", "不得编造资料包外实测值、订单、利润或自动放行结论。"]
  }
};

async function api(path, options) {
  const response = await fetch(path, options);
  const text = await response.text();
  let data = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!response.ok) {
    const detail = data.error || data.message || `${response.status} ${response.statusText}`;
    const error = new Error(detail);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function setView(id) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".nav").forEach((button) => button.classList.toggle("active", button.dataset.view === id));
  if (id === "workflow") renderWorkflow();
  if (id === "records") renderRecords();
  renderStatusDashboard();
}

function defaultRecords() {
  return {
    version: state.project.version,
    updatedAt: new Date().toISOString(),
    timer: {
      startedAt: null,
      elapsedMs: 0,
      running: false
    },
    quality: state.project.rules.map((rule) => ({
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
    workflow: state.project.workflow.map((stage) => ({
      id: stage.id,
      title: stage.title,
      status: "pending",
      completedAt: "",
      note: ""
    }))
  };
}

function loadRecords() {
  const raw = localStorage.getItem("jingzhouzhikong.fieldRecords");
  state.records = raw ? JSON.parse(raw) : defaultRecords();
}

function saveRecords() {
  state.records.updatedAt = new Date().toISOString();
  localStorage.setItem("jingzhouzhikong.fieldRecords", JSON.stringify(state.records, null, 2));
  $("#recordSaveState").textContent = `已保存 ${new Date(state.records.updatedAt).toLocaleTimeString()}`;
  persistRecordsToServer();
  renderStatusDashboard();
}

async function persistRecordsToServer() {
  try {
    await api("/api/field/records", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ records: state.records })
    });
  } catch (error) {
    console.warn("field records server sync failed", error);
  }
}

function elapsedMs() {
  const timer = state.records.timer || { elapsedMs: 0, running: false };
  return timer.elapsedMs + (timer.running && timer.startedAt ? Date.now() - timer.startedAt : 0);
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function activeStageId() {
  const minute = elapsedMs() / 60000;
  const active = state.project.workflow.find((stage) => minute >= stage.minuteStart && minute <= stage.minuteEnd);
  return active?.id || null;
}

function workflowRecordMap() {
  return new Map((state.records.workflow || []).map((item) => [item.id, item]));
}

function nextWorkflowStage(workflowRecords = workflowRecordMap()) {
  const activeId = activeStageId();
  return (
    state.project.workflow.find((stage) => stage.id === activeId) ||
    state.project.workflow.find((stage) => (workflowRecords.get(stage.id)?.status || "pending") !== "done") ||
    state.project.workflow[state.project.workflow.length - 1]
  );
}

function stageRules(stage) {
  return (stage.ruleIds || []).map((id) => state.project.rules.find((rule) => rule.id === id)).filter(Boolean);
}

function stageQuestion(stage) {
  const rules = stageRules(stage);
  if (stage.id === "S5") return "根据当前G1-G8检测数据生成G8终检归档摘要和应用价值摘要。";
  if (stage.id === "S4") return "孔距偏差0.018mm接近0.020mm阈值如何处置？";
  if (stage.id === "S3") return "滚压后Ra未达到目标怎么办？";
  if (stage.id === "S2") return "G3首件检验应检查哪些项目？";
  return `请按${rules.map((rule) => rule.id).join("、") || stage.title}列出当前阶段应核对项目、记录字段和风险边界。`;
}

function renderWorkflowSummary(workflowRecords = workflowRecordMap()) {
  if (!$("#workflowSummary")) return;
  const stages = state.project.workflow;
  const done = stages.filter((stage) => workflowRecords.get(stage.id)?.status === "done").length;
  const blocked = stages.filter((stage) => workflowRecords.get(stage.id)?.status === "blocked");
  const doing = stages.filter((stage) => workflowRecords.get(stage.id)?.status === "doing");
  const next = nextWorkflowStage(workflowRecords);
  $("#workflowSummary").innerHTML = `
    <article>
      <span>当前/下一阶段</span>
      <strong>${next.id} ${next.title}</strong>
      <small>${next.time} · ${next.owner} · ${next.requiredOutput}</small>
    </article>
    <article>
      <span>阶段完成</span>
      <strong>${done}/${stages.length}</strong>
      <small>以阶段状态“已完成”为准</small>
    </article>
    <article class="${doing.length ? "" : "muted-card"}">
      <span>进行中</span>
      <strong>${doing.map((stage) => stage.id).join("、") || "无"}</strong>
      <small>建议一次只保持一个阶段进行中</small>
    </article>
    <article class="${blocked.length ? "risk" : ""}">
      <span>暂停复核</span>
      <strong>${blocked.map((stage) => stage.id).join("、") || "无"}</strong>
      <small>${blocked.length ? "暂停项需先处理并记录处置依据" : "无暂停项，继续按G点留痕"}</small>
    </article>
  `;
}

function getFieldStatus() {
  if (!state.records) loadRecords();
  const quality = state.records.quality || [];
  const workflow = state.records.workflow || [];
  const doneQuality = quality.filter((item) => item.status === "done" && item.measuredValue.trim()).length;
  const blockedRules = quality.filter((item) => item.status === "blocked" || item.status === "warning");
  const blockedStages = workflow.filter((item) => item.status === "blocked");
  const nextStage = nextWorkflowStage(new Map(workflow.map((item) => [item.id, item])));
  return {
    doneQuality,
    totalQuality: quality.length,
    blockedRules,
    blockedStages,
    nextStage,
    archiveReady: Boolean(
      state.records.archive.radialRunout.trim() &&
        state.records.archive.faceRunout.trim() &&
        state.records.archive.rotationState.trim() &&
        state.records.archive.conclusion.trim()
    )
  };
}

function renderStatusDashboard() {
  if (!state.project || !state.records) return;
  const status = getFieldStatus();
  const stageLabel = status.nextStage ? `${status.nextStage.id} ${status.nextStage.title}` : "待开始";
  if ($("#topStage")) $("#topStage").textContent = stageLabel;
  if ($("#topProgress")) $("#topProgress").textContent = `${status.doneQuality}/${status.totalQuality}`;
  if (!$("#missionDashboard")) return;
  const riskText =
    status.blockedRules.length || status.blockedStages.length
      ? `需复核：${status.blockedRules.map((item) => item.id).join("、") || "无质量点"}；暂停阶段：${status.blockedStages.map((item) => item.id).join("、") || "无"}`
      : "暂无暂停项，继续按G1-G8留痕。";
  $("#missionDashboard").innerHTML = `
    <article>
      <span>当前作业窗口</span>
      <strong>${stageLabel}</strong>
      <small>${status.nextStage?.time || "按比赛计时推进"} · ${status.nextStage?.owner || "全员"}</small>
    </article>
    <article>
      <span>质量证据</span>
      <strong>${status.doneQuality}/${status.totalQuality}</strong>
      <small>已完成且有实测/证据编号的G点</small>
    </article>
    <article>
      <span>归档状态</span>
      <strong>${status.archiveReady ? "可复核" : "待补齐"}</strong>
      <small>径向、端面、转动状态、结论四项</small>
    </article>
    <article class="${status.blockedRules.length || status.blockedStages.length ? "risk" : ""}">
      <span>风险提示</span>
      <strong>${status.blockedRules.length || status.blockedStages.length ? "暂停复核" : "边界正常"}</strong>
      <small>${riskText}</small>
    </article>
  `;
}

function renderWorkflow() {
  if (!state.records) loadRecords();
  $("#timerDisplay").textContent = formatElapsed(elapsedMs());
  const filter = $("#roleFilter")?.value || "all";
  const activeId = activeStageId();
  const workflowRecords = workflowRecordMap();
  const next = nextWorkflowStage(workflowRecords);
  renderWorkflowSummary(workflowRecords);
  $("#workflowBoard").innerHTML = state.project.workflow
    .filter((stage) => filter === "all" || stage.owner.includes(filter))
    .map((stage) => {
      const record = workflowRecords.get(stage.id) || { status: "pending", note: "" };
      const isActive = stage.id === activeId;
      const isNext = !isActive && stage.id === next.id;
      const rules = stageRules(stage);
      const previousStages = state.project.workflow.slice(0, state.project.workflow.findIndex((item) => item.id === stage.id));
      const gateOpen = previousStages.every((item) => workflowRecords.get(item.id)?.status === "done");
      const gateText = stage.id === "S1" || gateOpen ? "前置阶段已满足" : `前置未完成：${previousStages.filter((item) => workflowRecords.get(item.id)?.status !== "done").map((item) => item.id).join("、")}`;
      return `<article class="workflow-card${isActive ? " active-stage" : ""}${isNext ? " next-stage" : ""}">
        <div class="workflow-time">
          <strong>${stage.time}</strong>
          <span>${isActive ? "当前窗口" : isNext ? "下一任务" : record.status === "done" ? "已完成" : "计划任务"}</span>
        </div>
        <div>
          <h3>${stage.title}</h3>
          <p>${stage.action}</p>
          <small>责任：${stage.owner} · 输出：${stage.requiredOutput}</small>
          <div class="stage-rule-list">
            ${rules
              .map(
                (rule) => `<section>
                  <b>${rule.id} ${rule.name}</b>
                  <span>${rule.reminder}</span>
                  <small>依据：${rule.basis}；处置：${rule.action}</small>
                </section>`
              )
              .join("")}
          </div>
          <div class="stage-gate ${gateOpen || stage.id === "S1" ? "" : "warn-text"}">${gateText}</div>
        </div>
        <div class="workflow-controls">
          <select data-stage-status="${stage.id}">
            <option value="pending"${record.status === "pending" ? " selected" : ""}>待执行</option>
            <option value="doing"${record.status === "doing" ? " selected" : ""}>进行中</option>
            <option value="done"${record.status === "done" ? " selected" : ""}>已完成</option>
            <option value="blocked"${record.status === "blocked" ? " selected" : ""}>暂停复核</option>
          </select>
          <input data-stage-note="${stage.id}" value="${escapeHtml(record.note || "")}" placeholder="阶段备注">
          <div class="workflow-actions">
            <button data-stage-question="${stage.id}">提问</button>
            <button data-stage-record="${stage.id}">记录</button>
            <button data-stage-material="${stage.id}">材料</button>
          </div>
        </div>
      </article>`;
    })
    .join("");
}

function renderOverview() {
  const project = state.project;
  $("#subtitle").textContent = "中职机械设计与制造赛道辅助工具";
  $("#positioning").textContent = project.positioning;
  $("#boundary").textContent = project.boundary;
  $("#localNotice").textContent = project.localModeNotice;

  $("#roles").innerHTML = project.roles
    .map((role) => `<article class="card"><h3>${role.role}</h3><p><strong>可用：</strong>${role.usage}</p><p><strong>重点：</strong>${role.focus}</p></article>`)
    .join("");

  $("#forbidden").innerHTML = project.forbidden.map((item) => `<li>${item}</li>`).join("");
}

function renderCompetition() {
  const stages = [
    ["02:00-05:00", "G1图纸与工艺确认", "1号", "G1确认清单"],
    ["08:00-12:00", "G3首件检验", "1号+2号", "G3首检记录"],
    ["20:00-27:00", "G4滚压效果说明", "1号+2号", "G4效果摘要"],
    ["32:00-36:00", "孔系偏差预警", "1号+3号", "异常处置记录"],
    ["48:00-53:00", "G8终检归档", "1号", "归档/价值摘要"]
  ];

  $("#stageStrip").innerHTML = stages
    .map(([time, title, owner, output]) => `<article><strong>${time}</strong><span>${title}</span><small>${owner} · ${output}</small></article>`)
    .join("");

  $("#qualityBoard").innerHTML = state.project.rules
    .map((rule) => `<article class="quality-row"><div class="rule-id">${rule.id}</div><div><h3>${rule.name}</h3><p>${rule.reminder}</p><small>依据：${rule.basis}</small></div><div class="rule-output">${rule.output}</div></article>`)
    .join("");

  const scripts = [
    "系统给出的是辅助提示，最终判断依据是图纸公差和实测数据。",
    "每个质量控制点都形成检测记录、签字和证据归档，未放行不能进入下一步。",
    "这里不是播放动画，而是把G5和G6的检测数据标注到模型中，用于确认配合关系。",
    "本项目的价值由质量、效率、绿色和成本四组数据支撑，而不是口头判断。"
  ];
  $("#scriptList").innerHTML = scripts.map((line) => `<li>${line}</li>`).join("");

  $("#fieldIncidents").innerHTML = state.project.incidents
    .map((incident) => `<article><h3>${incident.scenario}</h3><p>${incident.steps.join(" -> ")}</p><small>判断依据：${incident.basis}</small></article>`)
    .join("");
}

function renderContestants(selectedId = state.project.contestantServices[0].id) {
  const services = state.project.contestantServices;
  const selected = services.find((item) => item.id === selectedId) || services[0];
  $("#contestantTabs").innerHTML = services
    .map((item) => `<button class="contestant-tab${item.id === selected.id ? " active" : ""}" data-contestant="${item.id}">${item.title}</button>`)
    .join("");

  const relatedRules = selected.rules
    .map((id) => state.project.rules.find((rule) => rule.id === id))
    .filter(Boolean);

  $("#contestantService").innerHTML = `
    <section class="field-panel contestant-main">
      <div class="section-head">
        <div>
          <p class="eyebrow">${selected.id}</p>
          <h2>${selected.title}</h2>
          <p>${selected.mission}</p>
        </div>
        <span class="badge">${selected.focus}</span>
      </div>
      <div class="contestant-grid">
        <article>
          <h3>建议提问</h3>
          <div class="quick-question-list">
            ${selected.quickQuestions.map((question) => `<button data-fill-question="${escapeHtml(question)}">${question}</button>`).join("")}
          </div>
        </article>
        <article>
          <h3>记录动作</h3>
          <ul>${selected.recordActions.map((item) => `<li>${item}</li>`).join("")}</ul>
        </article>
        <article>
          <h3>现场话术</h3>
          <ul>${selected.speakingLines.map((item) => `<li>${item}</li>`).join("")}</ul>
        </article>
        <article>
          <h3>风险提醒</h3>
          <ul>${selected.riskReminders.map((item) => `<li>${item}</li>`).join("")}</ul>
        </article>
      </div>
    </section>
    <section class="field-panel">
      <h2>相关质量控制点</h2>
      <div class="quality-board">
        ${relatedRules
          .map((rule) => `<article class="quality-row"><div class="rule-id">${rule.id}</div><div><h3>${rule.name}</h3><p>${rule.reminder}</p><small>依据：${rule.basis}</small></div><div class="rule-output">${rule.output}</div></article>`)
          .join("")}
      </div>
    </section>
  `;
}

function renderRecords() {
  if (!state.records) loadRecords();
  $("#recordTable").innerHTML = `<thead><tr><th>点位</th><th>名称</th><th>状态</th><th>实测/证据</th><th>备注</th><th>输出物</th></tr></thead><tbody>${
    state.records.quality
      .map((item, index) => `<tr>
        <td>${item.id}</td>
        <td>${item.name}<br><small>${item.owner}</small></td>
        <td>
          <select data-record-status="${index}">
            <option value="pending"${item.status === "pending" ? " selected" : ""}>待确认</option>
            <option value="done"${item.status === "done" ? " selected" : ""}>已记录</option>
            <option value="warning"${item.status === "warning" ? " selected" : ""}>预警</option>
            <option value="blocked"${item.status === "blocked" ? " selected" : ""}>暂停</option>
          </select>
        </td>
        <td><input data-record-value="${index}" value="${escapeHtml(item.measuredValue)}" placeholder="填写实测值或证据编号"></td>
        <td><input data-record-note="${index}" value="${escapeHtml(item.note)}" placeholder="备注"></td>
        <td>${item.output}</td>
      </tr>`)
      .join("")
  }</tbody>`;

  $("#incidentRecords").innerHTML =
    state.records.incidents.length === 0
      ? `<p class="muted">暂无异常记录。出现孔距预警、Ra未达标、跳动偏大或装配卡滞时新增记录。</p>`
      : state.records.incidents
          .map((incident, index) => `<article class="incident-record">
            <label>异常情境<input data-incident-scenario="${index}" value="${escapeHtml(incident.scenario)}"></label>
            <label>处置记录<textarea data-incident-action="${index}" rows="4">${escapeHtml(incident.action)}</textarea></label>
            <label>最终依据<input data-incident-basis="${index}" value="${escapeHtml(incident.basis)}"></label>
            <button data-delete-incident="${index}">删除</button>
          </article>`)
          .join("");

  $("#archiveRadial").value = state.records.archive.radialRunout;
  $("#archiveFace").value = state.records.archive.faceRunout;
  $("#archiveRotation").value = state.records.archive.rotationState;
  $("#archiveConclusion").value = state.records.archive.conclusion;
}

function validateRecords() {
  if (!state.records) loadRecords();
  const missingQuality = state.records.quality.filter((item) => item.status !== "done" || !item.measuredValue.trim());
  const archiveMissing = [];
  if (!state.records.archive.radialRunout.trim()) archiveMissing.push("径向跳动");
  if (!state.records.archive.faceRunout.trim()) archiveMissing.push("端面跳动");
  if (!state.records.archive.rotationState.trim()) archiveMissing.push("转动状态");
  if (!state.records.archive.conclusion.trim()) archiveMissing.push("归档结论");
  const blockedStages = (state.records.workflow || []).filter((item) => item.status === "blocked");
  const summary = {
    ok: missingQuality.length === 0 && archiveMissing.length === 0 && blockedStages.length === 0,
    missingQuality,
    archiveMissing,
    blockedStages
  };
  $("#validationSummary").innerHTML = `<h2>完整性检查</h2>
    <p class="${summary.ok ? "ok-text" : "warn-text"}">${summary.ok ? "记录完整，可进入归档复核。" : "仍有记录缺口，不能作为完整归档材料。"}</p>
    <ul>
      <li>G1-G8未完成或缺少实测/证据：${missingQuality.map((item) => item.id).join("、") || "无"}</li>
      <li>G8归档缺失字段：${archiveMissing.join("、") || "无"}</li>
      <li>暂停复核阶段：${blockedStages.map((item) => item.id).join("、") || "无"}</li>
    </ul>`;
  return summary;
}

function valueOrTodo(value, label = "待补充") {
  return value && String(value).trim() ? String(value).trim() : label;
}

function qualityRecord(id) {
  return state.records.quality.find((item) => item.id === id) || {};
}

function generateMaterials() {
  if (!state.records) loadRecords();
  const g3 = qualityRecord("G3");
  const g4 = qualityRecord("G4");
  const g8 = qualityRecord("G8");
  const generatedAt = new Date().toLocaleString();
  const incidents = state.records.incidents.length
    ? state.records.incidents
        .map((item, index) => `| ${index + 1} | ${valueOrTodo(item.scenario)} | ${valueOrTodo(item.action)} | ${valueOrTodo(item.basis)} |`)
        .join("\n")
    : "| 1 | 待补充 | 待补充 | 待补充 |";

  return {
    g3: {
      title: "G3首件检验记录",
      content: `# G3首件检验记录\n\n生成时间：${generatedAt}\n\n| 项目 | 内容 |\n|---|---|\n| 检测对象 | 外圆尺寸、径向跳动、加工余量 |\n| 标准/依据 | 首检记录表、千分尺、百分表、图纸公差 |\n| 实测/证据 | ${valueOrTodo(g3.measuredValue)} |\n| 记录状态 | ${valueOrTodo(g3.status)} |\n| 备注 | ${valueOrTodo(g3.note)} |\n| 处置要求 | 不合格时调整刀补，重新试切并复测 |\n\n注意：首件检验通过后才能进入下一工步，最终判断依据为实测数据。`
    },
    incident: {
      title: "异常处置记录",
      content: `# 异常处置记录\n\n生成时间：${generatedAt}\n\n| 序号 | 异常情境 | 处置过程 | 最终依据 |\n|---|---|---|---|\n${incidents}\n\n处置原则：先停机安全确认，再复核数据、判断原因、调整方案、再次检验。不得强行装配或绕过复测。`
    },
    g8: {
      title: "G8终检归档摘要",
      content: `# G8终检归档摘要\n\n生成时间：${generatedAt}\n\n| 项目 | 内容 |\n|---|---|\n| 径向跳动 | ${valueOrTodo(state.records.archive.radialRunout)} |\n| 端面跳动 | ${valueOrTodo(state.records.archive.faceRunout)} |\n| 转动状态 | ${valueOrTodo(state.records.archive.rotationState)} |\n| 归档结论 | ${valueOrTodo(state.records.archive.conclusion)} |\n| G8记录状态 | ${valueOrTodo(g8.status)} |\n| G8证据/备注 | ${valueOrTodo(g8.measuredValue || g8.note)} |\n| 数据来源 | ${valueOrTodo(state.records.archive.dataSource, "现场检测记录")} |\n\n注意：本摘要必须对应G1-G8原始记录。缺少实测值时不得补造，应标注待补充。`
    },
    value: {
      title: "应用价值摘要",
      content: `# 应用价值摘要\n\n生成时间：${generatedAt}\n\n| 价值类别 | 表达口径 | 当前依据 |\n|---|---|---|\n| 质量价值 | Ra、跳动、合格率 | ${valueOrTodo(g4.measuredValue || g8.measuredValue)} |\n| 效率价值 | 工序数、时间 | 待补充训练或现场记录 |\n| 绿色价值 | 能耗、废液、耗材 | 待补充测算表或确认数据 |\n| 成本价值 | 单套成本、年降本增效 | 使用“降本增效空间”，不得说企业真实利润 |\n| 岗位价值 | 四类岗位 | 依据项目岗位分工说明 |\n\n推荐表述：本项目的价值由质量、效率、绿色和成本四组数据支撑，而不是口头判断。测算数据必须标注口径，不得冒充企业真实订单或利润。`
    }
  };
}

function renderMaterials(type = state.currentMaterial) {
  state.currentMaterial = type;
  const materials = generateMaterials();
  const selected = materials[type] || materials.g3;
  $("#materialTitle").textContent = selected.title;
  $("#materialContent").textContent = selected.content;
  document.querySelectorAll(".material-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.material === type));
}

function exportCurrentMaterial() {
  const materials = generateMaterials();
  const selected = materials[state.currentMaterial] || materials.g3;
  const blob = new Blob([selected.content], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${selected.title}-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function copyCurrentMaterial() {
  const materials = generateMaterials();
  const selected = materials[state.currentMaterial] || materials.g3;
  await navigator.clipboard.writeText(selected.content);
  $("#materialTitle").textContent = `${selected.title}（已复制）`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function knowledgeSlug(value = "") {
  return String(value)
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildKnowledgeContent() {
  const title = $("#knowledgeTitle").value.trim() || "新资料标题";
  const scenario = $("#knowledgeScenario").value.trim() || "待补充";
  const source = $("#knowledgeSource").value.trim() || "待确认";
  const owner = $("#knowledgeOwner").value.trim() || "待指定";
  const content = $("#knowledgeContent").value.trim();
  const body = content.replace(/^# .*(\r?\n)+/, "").trim();
  return [
    `# ${title}`,
    "",
    "## 资料元数据",
    `- 适用场景：${scenario}`,
    `- 资料来源：${source}`,
    `- 责任人：${owner}`,
    `- 更新日期：${new Date().toISOString().slice(0, 10)}`,
    "",
    body || "## 内容\n待补充。"
  ].join("\n");
}

function syncRecordInputs(target) {
  if (!target.closest("#records") && !target.closest("#workflow")) return;
  if (!state.records) loadRecords();
  const statusIndex = target.dataset.recordStatus;
  const valueIndex = target.dataset.recordValue;
  const noteIndex = target.dataset.recordNote;
  if (statusIndex !== undefined) state.records.quality[Number(statusIndex)].status = target.value;
  if (valueIndex !== undefined) state.records.quality[Number(valueIndex)].measuredValue = target.value;
  if (noteIndex !== undefined) state.records.quality[Number(noteIndex)].note = target.value;

  const scenarioIndex = target.dataset.incidentScenario;
  const actionIndex = target.dataset.incidentAction;
  const basisIndex = target.dataset.incidentBasis;
  if (scenarioIndex !== undefined) state.records.incidents[Number(scenarioIndex)].scenario = target.value;
  if (actionIndex !== undefined) state.records.incidents[Number(actionIndex)].action = target.value;
  if (basisIndex !== undefined) state.records.incidents[Number(basisIndex)].basis = target.value;

  const stageStatus = target.dataset.stageStatus;
  const stageNote = target.dataset.stageNote;
  if (stageStatus !== undefined) {
    const stage = state.records.workflow.find((item) => item.id === stageStatus);
    if (stage) {
      stage.status = target.value;
      stage.completedAt = target.value === "done" ? new Date().toISOString() : stage.completedAt;
    }
  }
  if (stageNote !== undefined) {
    const stage = state.records.workflow.find((item) => item.id === stageNote);
    if (stage) stage.note = target.value;
  }

  if (target.closest("#records")) {
    state.records.archive.radialRunout = $("#archiveRadial")?.value || "";
    state.records.archive.faceRunout = $("#archiveFace")?.value || "";
    state.records.archive.rotationState = $("#archiveRotation")?.value || "";
    state.records.archive.conclusion = $("#archiveConclusion")?.value || "";
    $("#recordSaveState").textContent = "未保存";
  }
  renderStatusDashboard();
}

function exportRecords() {
  saveRecords();
  const blob = new Blob([JSON.stringify(state.records, null, 2)], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `jingzhouzhikong-field-records-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportEvidencePack() {
  const validation = validateRecords();
  saveRecords();
  const pack = {
    project: {
      name: state.project.name,
      version: state.project.version,
      boundary: state.project.boundary
    },
    exportedAt: new Date().toISOString(),
    validation,
    records: state.records
  };
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `jingzhouzhikong-evidence-pack-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderRules() {
  const headers = ["编号", "名称", "提醒内容", "依据", "处置", "输出物", "人员"];
  const rows = state.project.rules
    .map((rule) => `<tr><td>${rule.id}</td><td>${rule.name}</td><td>${rule.reminder}</td><td>${rule.basis}</td><td>${rule.action}</td><td>${rule.output}</td><td>${rule.owner}</td></tr>`)
    .join("");
  $("#rulesTable").innerHTML = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody>`;

  $("#incidents").innerHTML = state.project.incidents
    .map((incident) => `<article class="card"><h3>${incident.scenario}</h3><p>${incident.steps.join(" -> ")}</p><p><strong>最终依据：</strong>${incident.basis}</p></article>`)
    .join("");
}

function renderTests(results = null, runId = state.currentTestRunId) {
  const tests = results || state.project.tests.map((test) => ({ ...test, passCriteria: test.pass, manualResult: "pending", manualReason: "" }));
  $("#testResults").innerHTML = tests
    .map((test) => {
      const answerText = test.modelAnswer ? (Array.isArray(test.modelAnswer) ? test.modelAnswer.join("\n") : test.modelAnswer) : "";
      const answer = answerText ? `<pre>${escapeHtml(answerText)}</pre>` : "";
      const warnings = test.boundaryWarnings?.length
        ? `<p class="notice"><strong>风险提示：</strong>${test.boundaryWarnings.join("、")}</p>`
        : "";
      return `<article class="test-card">
        <div class="section-head">
          <div>
            <h3>${test.id}</h3>
            <p>${test.question}</p>
          </div>
          <span class="badge ${test.manualResult === "fail" ? "warn" : ""}">${test.manualResult === "pass" ? "已通过" : test.manualResult === "fail" ? "未通过" : "待判定"}</span>
        </div>
        <p><strong>期望：</strong>${(test.expected || []).join("、")}</p>
        <p><strong>通过：</strong>${test.passCriteria || test.pass}</p>
        ${warnings}
        ${answer}
        <div class="judge-row">
          <select data-judge-result="${test.id}" ${runId ? "" : "disabled"}>
            <option value="pending"${test.manualResult === "pending" ? " selected" : ""}>待判定</option>
            <option value="pass"${test.manualResult === "pass" ? " selected" : ""}>通过</option>
            <option value="fail"${test.manualResult === "fail" ? " selected" : ""}>不通过</option>
          </select>
          <input data-judge-reason="${test.id}" value="${escapeHtml(test.manualReason || "")}" placeholder="人工判定说明" ${runId ? "" : "disabled"}>
          <button data-save-judgement="${test.id}" ${runId ? "" : "disabled"}>保存判定</button>
        </div>
      </article>`;
    })
    .join("");
}

function renderAcceptanceSummary(summary = null) {
  if (!$("#acceptanceSummary")) return;
  $("#acceptanceSummary").textContent = summary?.exportText || "暂无测试批次。";
}

async function loadTestRuns() {
  const data = await api("/api/tests/runs");
  const runs = data.runs || [];
  $("#testRunList").innerHTML = runs.length
    ? runs
        .map(
          (run) => `<button data-load-test-run="${run.id}">
            <strong>${run.id}</strong>
            <span>${run.mode} · ${run.tester || "未填测试人"}</span>
            <small>${new Date(run.createdAt).toLocaleString()} · 待判定 ${run.summary.pending.length}</small>
          </button>`
        )
        .join("")
    : '<p class="muted">暂无测试批次。先运行本地预检或真实模型测试。</p>';
  if (runs[0]?.summary) renderAcceptanceSummary(runs[0].summary);
}

async function loadAcceptanceSummary() {
  const data = await api("/api/acceptance/summary");
  renderAcceptanceSummary(data.summary);
  if (data.latestRun) {
    state.currentTestRunId = data.latestRun.id;
    $("#currentRunMode").textContent = data.latestRun.mode;
    renderTests(data.latestRun.results, data.latestRun.id);
  }
}

async function renderAdmin() {
  const provider = await api("/api/provider/status");
  const savedConfig = await api("/api/admin/model-config");
  const template = await api("/api/model/config-template");
  const capabilities = await api("/api/capabilities");
  const roles = await api("/api/admin/roles");

  $("#adminProviderStatus").innerHTML = `
    <div><dt>模型服务</dt><dd>${provider.configured ? "已配置" : "未配置"}</dd></div>
    <div><dt>Base URL</dt><dd>${provider.baseUrlConfigured ? provider.baseUrlPreview : "未配置"}</dd></div>
    <div><dt>API Key</dt><dd>${provider.apiKeyConfigured ? `已配置（${provider.apiKeyPreview}）` : "未配置"}</dd></div>
    <div><dt>模型</dt><dd>${provider.model}</dd></div>
    <div><dt>协议</dt><dd>${template.compatibleProtocol}</dd></div>
  `;

  $("#adminBaseUrl").value = savedConfig.baseUrl || "";
  $("#adminModel").value = savedConfig.model || "";
  $("#modelConfigWarning").textContent = provider.configured
    ? `模型服务已配置：${provider.model}，${provider.baseUrlPreview}`
    : template.warning;
  $("#rolesJson").value = JSON.stringify(roles.contestants, null, 2);
  $("#capabilityList").innerHTML = capabilities.capabilities
    .map((group) => `<article class="capability-card"><h3>${group.group}</h3><ul>${group.items.map((item) => `<li>${item}</li>`).join("")}</ul></article>`)
    .join("");
}

async function renderKnowledgeManager() {
  const data = await api("/api/admin/knowledge");
  state.assets = data.baseAssets || [];
  const customAssets = data.customAssets || [];
  const search = state.knowledgeSearch.trim().toLowerCase();
  const matchesSearch = (...values) => !search || values.some((value) => String(value || "").toLowerCase().includes(search));
  const visibleBaseAssets = state.assets.filter((item) => state.knowledgeFilter !== "custom" && matchesSearch(item.id, item.file, knowledgeAssetLabel(item)));
  const visibleCustomAssets = customAssets.filter((item) => state.knowledgeFilter !== "base" && matchesSearch(item.id, item.file, item.title));
  $("#baseAssetCount").textContent = data.baseAssets.length;
  $("#customAssetCount").textContent = customAssets.length;
  $("#knowledgeFilterSummary").textContent = `当前显示 ${visibleBaseAssets.length + visibleCustomAssets.length} 份资料；基础 ${visibleBaseAssets.length}，自定义 ${visibleCustomAssets.length}。`;
  $("#baseKnowledgeSection").hidden = state.knowledgeFilter === "custom";
  $("#customKnowledgeSection").hidden = state.knowledgeFilter === "base";

  $("#baseKnowledgeList").innerHTML = visibleBaseAssets.length
    ? visibleBaseAssets.map((item) => renderKnowledgeListButton(item, "base")).join("")
    : '<p class="muted">没有匹配的基础资料。</p>';

  $("#customKnowledgeList").innerHTML = visibleCustomAssets.length
    ? visibleCustomAssets.map((item) => renderKnowledgeListButton(item, "custom")).join("")
    : customAssets.length
      ? '<p class="muted">没有匹配的自定义资料。</p>'
      : '<p class="muted">暂无自定义资料。点击“新建资料”添加比赛补充资料。</p>';

  if (!state.selectedKnowledge && visibleBaseAssets.length) {
    await previewBaseKnowledge(visibleBaseAssets[0].id);
  } else {
    updateKnowledgeSelection();
  }
}

function knowledgeAssetLabel(item) {
  const id = item.id || "";
  if (id === "system-prompt") return "系统提示词";
  if (id.startsWith("kb-")) return "知识库";
  if (["scope", "version", "next-actions", "dev-flow", "traceability", "defects"].includes(id)) return "项目管理";
  if (["test-record", "test-judge", "kb-tests"].includes(id)) return "测试验收";
  if (["demo", "import-guide", "config-record", "redaction"].includes(id)) return "导入演示";
  return "基础资料";
}

function renderKnowledgeListButton(item, type) {
  const isBase = type === "base";
  const isActive = state.selectedKnowledge?.type === type && state.selectedKnowledge.id === item.id;
  const title = isBase ? item.file : item.title;
  const meta = isBase ? knowledgeAssetLabel(item) : `${item.id} · ${item.bytes} bytes`;
  const dataAttr = isBase ? `data-preview-base-asset="${item.id}"` : `data-load-knowledge="${item.id}"`;
  return `<button class="knowledge-doc${isActive ? " active" : ""}" ${dataAttr}>
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(meta)}</span>
  </button>`;
}

async function saveModelConfig() {
  try {
    const result = await api("/api/admin/model-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        baseUrl: $("#adminBaseUrl").value,
        model: $("#adminModel").value,
        apiKey: $("#adminApiKey").value
      })
    });
    $("#adminApiKey").value = "";
    $("#modelConfigWarning").textContent = result.status?.configured ? "模型配置已保存，可执行真实模型测试。" : "模型配置已保存，但Base URL或API Key仍不完整。";
    await renderAdmin();
    await refreshProviderNotice();
  } catch (error) {
    $("#modelConfigWarning").textContent = `保存失败：${error.message}`;
  }
}

async function clearModelKey() {
  await api("/api/admin/model-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      baseUrl: $("#adminBaseUrl").value,
      model: $("#adminModel").value,
      clearApiKey: true
    })
  });
  $("#adminApiKey").value = "";
  $("#modelConfigWarning").textContent = "模型密钥已清除。";
  await renderAdmin();
}

async function testModelConfig() {
  try {
    const result = await api("/api/admin/model-test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "本项目是不是自主开发AI？" })
    });
    $("#modelConfigWarning").textContent = `模型测试成功：${(result.answer || []).join(" ").slice(0, 80)}`;
  } catch (error) {
    $("#modelConfigWarning").textContent = `模型测试失败：${error.message}`;
  }
}

async function refreshProviderNotice() {
  const preflight = await api("/api/tests/preflight");
  const provider = preflight.provider;
  if ($("#providerStatus")) {
    $("#providerStatus").textContent = provider.configured
      ? `智能体模型服务已连接：${provider.model}（${provider.baseUrlPreview}）`
      : "当前为规则校核模式；真实模型测试前请在系统管理页配置Base URL、模型名称和API Key。";
  }
  if ($("#realTestStatus")) {
    $("#realTestStatus").textContent = preflight.guidance;
  }
  if ($("#testPreflight")) {
    $("#testPreflight").innerHTML = preflight.checks
      .map((check) => `<span class="${check.ok ? "ok" : "bad"}"><strong>${check.name}</strong>${check.message}</span>`)
      .join("");
  }
  if ($("#runRealTests")) $("#runRealTests").disabled = !preflight.canRunRealTests;
  return provider;
}

async function saveKnowledge() {
  try {
    const content = buildKnowledgeContent();
    const result = await api("/api/admin/knowledge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: $("#knowledgeId").value || knowledgeSlug($("#knowledgeTitle").value),
        title: $("#knowledgeTitle").value,
        content
      })
    });
    $("#knowledgeId").value = result.id;
    $("#knowledgeSaveState").textContent = result.validation?.warnings?.length
      ? `资料已保存：${result.file}；仍有${result.validation.warnings.length}项建议待完善。`
      : `资料已保存：${result.file}`;
    renderKnowledgeChecklist(result.validation);
    await renderKnowledgeManager();
    await loadKnowledge(result.id);
    closeKnowledgeModal();
  } catch (error) {
    $("#knowledgeSaveState").textContent = `保存失败：${error.message}`;
  }
}

async function loadKnowledge(id) {
  const item = await api(`/api/admin/knowledge/${id}`);
  state.selectedKnowledge = { type: "custom", id, title: item.file, content: item.content };
  $("#knowledgeId").value = item.id;
  $("#knowledgeTitle").value = item.content.split(/\r?\n/).find((line) => line.startsWith("# "))?.replace(/^#\s*/, "") || item.id;
  $("#knowledgeScenario").value = item.content.match(/适用场景：(.+)/)?.[1] || "";
  $("#knowledgeSource").value = item.content.match(/资料来源：(.+)/)?.[1] || "";
  $("#knowledgeOwner").value = item.content.match(/责任人：(.+)/)?.[1] || "";
  $("#knowledgeContent").value = item.content;
  setKnowledgePreview({
    title: item.file,
    typeLabel: "自定义资料",
    meta: `${item.id} · 可编辑 · 已进入智能体问答上下文`,
    content: item.content
  });
  $("#knowledgeSaveState").textContent = `正在编辑：${item.file}`;
  updateKnowledgeSelection();
  await checkKnowledge(false);
}

async function previewBaseKnowledge(id) {
  const asset = await api(`/api/assets/${id}`);
  state.selectedKnowledge = { type: "base", id, title: asset.file, content: asset.content };
  setKnowledgePreview({
    title: asset.file,
    typeLabel: knowledgeAssetLabel(asset),
    meta: "项目基础资料 · 只读 · 来源于MVP开发交付包",
    content: asset.content
  });
  $("#knowledgeSaveState").textContent = "基础资料来自项目资料包，只读不可编辑。";
  updateKnowledgeSelection();
}

function setKnowledgePreview({ title, typeLabel, meta, content }) {
  $("#knowledgePreviewType").textContent = typeLabel;
  $("#knowledgePreviewTitle").textContent = title;
  $("#knowledgePreviewMeta").textContent = meta;
  $("#knowledgePreviewContent").textContent = content;
  $("#knowledgePreviewState").textContent = "";
  $("#copyKnowledgePreview").disabled = !content;
  $("#editSelectedKnowledge").disabled = state.selectedKnowledge?.type !== "custom";
}

function updateKnowledgeSelection() {
  document.querySelectorAll("[data-preview-base-asset]").forEach((button) => {
    button.classList.toggle("active", state.selectedKnowledge?.type === "base" && state.selectedKnowledge.id === button.dataset.previewBaseAsset);
  });
  document.querySelectorAll("[data-load-knowledge]").forEach((button) => {
    button.classList.toggle("active", state.selectedKnowledge?.type === "custom" && state.selectedKnowledge.id === button.dataset.loadKnowledge);
  });
}

function newKnowledge() {
  const template = knowledgeTemplates[$("#knowledgeTemplate").value] || knowledgeTemplates.incident;
  openKnowledgeModal("新建资料");
  $("#knowledgeTitle").value = template.title;
  $("#knowledgeId").value = knowledgeSlug(template.title);
  $("#knowledgeScenario").value = template.scenario;
  $("#knowledgeSource").value = template.source;
  $("#knowledgeOwner").value = template.owner;
  $("#knowledgeContent").value = [`# ${template.title}`, "", ...template.body, "", "## 使用边界", "不得编造资料包外实测值、订单、利润或自动放行结论。"].join("\n");
  $("#knowledgeSaveState").textContent = "已套用资料模板，检查通过后保存。";
  updateKnowledgeSelection();
  checkKnowledge(false);
}

async function copyKnowledgePreview() {
  const content = $("#knowledgePreviewContent").textContent || "";
  if (!content.trim()) return;
  try {
    await navigator.clipboard.writeText(content);
    $("#knowledgePreviewState").textContent = "当前预览内容已复制。";
  } catch {
    $("#knowledgePreviewState").textContent = "浏览器未允许直接复制，请选中预览内容后复制。";
  }
}

function editSelectedKnowledge() {
  if (state.selectedKnowledge?.type !== "custom") return;
  openKnowledgeModal("编辑自定义资料");
  $("#knowledgeTitle").focus();
}

function openKnowledgeModal(title = "自定义资料") {
  $("#knowledgeModalTitle").textContent = title;
  $("#knowledgeModal").classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeKnowledgeModal() {
  $("#knowledgeModal").classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function renderKnowledgeChecklist(validation = null) {
  if (!$("#knowledgeChecklist")) return;
  if (!validation) {
    $("#knowledgeChecklist").innerHTML = '<span class="muted">资料检查结果会显示在这里。</span>';
    return;
  }
  const errors = validation.errors || [];
  const warnings = validation.warnings || [];
  $("#knowledgeChecklist").innerHTML = `
    <div class="${errors.length ? "bad" : "ok"}"><strong>${errors.length ? "需修正" : "基础校验通过"}</strong>${errors.join("；") || "资料ID和内容格式可保存"}</div>
    <div class="${warnings.length ? "warn" : "ok"}"><strong>${warnings.length ? "完善建议" : "边界正常"}</strong>${warnings.join("；") || "未发现明显商业交付风险"}</div>
  `;
}

async function checkKnowledge(showStatus = true) {
  try {
    const validation = await api("/api/admin/knowledge/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: $("#knowledgeId").value || knowledgeSlug($("#knowledgeTitle").value),
        title: $("#knowledgeTitle").value,
        content: buildKnowledgeContent()
      })
    });
    renderKnowledgeChecklist(validation);
    if (showStatus) $("#knowledgeSaveState").textContent = validation.ok ? "资料检查完成，可保存。" : "资料检查发现必改项。";
    return validation;
  } catch (error) {
    $("#knowledgeSaveState").textContent = `检查失败：${error.message}`;
    return null;
  }
}

async function deleteKnowledge() {
  const id = $("#knowledgeId").value.trim();
  if (!id) {
    $("#knowledgeSaveState").textContent = "请先选择要删除的自定义资料。";
    return;
  }
  if (!confirm(`确定删除自定义资料 ${id}？`)) return;
  await api(`/api/admin/knowledge/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (state.selectedKnowledge?.type === "custom" && state.selectedKnowledge.id === id) {
    state.selectedKnowledge = null;
  }
  closeKnowledgeModal();
  await renderKnowledgeManager();
}

async function saveRoles() {
  const contestants = JSON.parse($("#rolesJson").value);
  await api("/api/admin/roles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contestants })
  });
  state.project = await api("/api/project");
  renderContestants();
  await renderAdmin();
}

async function runTests(useExternalProvider = false) {
  $("#currentRunMode").textContent = useExternalProvider ? "真实测试执行中..." : "本地预检执行中...";
  if (useExternalProvider) {
    const provider = await refreshProviderNotice();
    if (!provider.configured) {
      $("#currentRunMode").textContent = "执行失败";
      $("#acceptanceSummary").textContent = "真实模型测试未就绪：请先进入系统管理，填写 DeepSeek Base URL、模型名称和 API Key，并点击“测试模型服务”。";
      return;
    }
    $("#acceptanceSummary").textContent = "正在调用真实模型执行T01-T08。通常需要1-3分钟，请不要刷新页面；完成后将生成测试批次并等待教师人工判定。";
    $("#runRealTests").disabled = true;
    $("#runTests").disabled = true;
  }
  try {
    const result = await api("/api/tests/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        useExternalProvider,
        tester: $("#testerName").value
      })
    });
    state.currentTestRunId = result.id;
    $("#currentRunMode").textContent = result.mode;
    renderTests(result.results, result.id);
    renderAcceptanceSummary({
      exportText: `${result.id}\n${result.notice}\n当前8项均待教师人工判定。`
    });
    await loadTestRuns();
  } catch (error) {
    $("#currentRunMode").textContent = "执行失败";
    const detail = error.data?.required ? `${error.message}\n缺少配置：${error.data.required.join("、")}` : error.message;
    $("#acceptanceSummary").textContent = detail;
  } finally {
    $("#runTests").disabled = false;
    await refreshProviderNotice();
  }
}

async function loadTestRun(id) {
  const data = await api(`/api/tests/runs/${encodeURIComponent(id)}`);
  state.currentTestRunId = data.run.id;
  $("#currentRunMode").textContent = data.run.mode;
  renderTests(data.run.results, data.run.id);
  renderAcceptanceSummary(data.summary);
}

async function saveJudgement(caseId) {
  const resultSelect = document.querySelector(`[data-judge-result="${caseId}"]`);
  const reasonInput = document.querySelector(`[data-judge-reason="${caseId}"]`);
  const saved = await api("/api/tests/judgement", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      runId: state.currentTestRunId,
      caseId,
      manualResult: resultSelect.value,
      manualReason: reasonInput.value
    })
  });
  renderTests(saved.run.results, saved.run.id);
  renderAcceptanceSummary(saved.summary);
  await loadTestRuns();
}

async function askQuestion() {
  let result;
  try {
    result = await api("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: $("#question").value,
        useExternalProvider: $("#useExternal").checked
      })
    });
  } catch (error) {
    $("#answerTitle").textContent = "请求失败";
    $("#answerMode").textContent = "服务配置提示";
    $("#answerList").innerHTML = `<li>当前模型服务尚未完成配置，请联系管理员。</li><li>${error.message}</li>`;
    $("#answerSource").textContent = "";
    return;
  }
  $("#answerTitle").textContent = result.title || "回答结果";
  $("#answerMode").textContent = `mode: ${result.mode}${result.model ? ` (${result.model})` : ""}`;
  $("#answerList").innerHTML = (result.answer || []).map((line) => `<li>${line}</li>`).join("");
  $("#answerSource").textContent = `依据：${(result.source || []).join("、")}`;
}

async function boot() {
  try {
    const health = await api("/health");
    $("#health").textContent = health.status;
    state.project = await api("/api/project");
    loadRecords();
    renderStatusDashboard();
    renderContestants();
    renderCompetition();
    renderWorkflow();
    renderOverview();
    renderRules();
    renderTests();
    renderRecords();
    renderMaterials();
    await renderKnowledgeManager();
    await loadTestRuns();
    await loadAcceptanceSummary();
    await renderAdmin();
    await refreshProviderNotice();
  } catch (error) {
    $("#health").textContent = "error";
    console.error(error);
  }
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest(".nav");
  if (nav) setView(nav.dataset.view);

  const jump = event.target.closest("[data-jump]");
  if (jump) setView(jump.dataset.jump);

  const deleteIncident = event.target.closest("[data-delete-incident]");
  if (deleteIncident) {
    state.records.incidents.splice(Number(deleteIncident.dataset.deleteIncident), 1);
    renderRecords();
  }

  const contestant = event.target.closest("[data-contestant]");
  if (contestant) renderContestants(contestant.dataset.contestant);

  const fillQuestion = event.target.closest("[data-fill-question]");
  if (fillQuestion) {
    $("#question").value = fillQuestion.dataset.fillQuestion;
    setView("ask");
  }

  const materialTab = event.target.closest("[data-material]");
  if (materialTab) renderMaterials(materialTab.dataset.material);

  const knowledgeFilter = event.target.closest("[data-knowledge-filter]");
  if (knowledgeFilter) {
    state.knowledgeFilter = knowledgeFilter.dataset.knowledgeFilter;
    document.querySelectorAll("[data-knowledge-filter]").forEach((button) => button.classList.toggle("active", button === knowledgeFilter));
    renderKnowledgeManager();
  }

  const knowledgeButton = event.target.closest("[data-load-knowledge]");
  if (knowledgeButton) loadKnowledge(knowledgeButton.dataset.loadKnowledge);

  const previewBaseAsset = event.target.closest("[data-preview-base-asset]");
  if (previewBaseAsset) previewBaseKnowledge(previewBaseAsset.dataset.previewBaseAsset);

  if (event.target.closest("[data-close-knowledge-modal]")) closeKnowledgeModal();

  const testRun = event.target.closest("[data-load-test-run]");
  if (testRun) loadTestRun(testRun.dataset.loadTestRun);

  const judgement = event.target.closest("[data-save-judgement]");
  if (judgement) saveJudgement(judgement.dataset.saveJudgement);

  const stageQuestionButton = event.target.closest("[data-stage-question]");
  if (stageQuestionButton) {
    const stage = state.project.workflow.find((item) => item.id === stageQuestionButton.dataset.stageQuestion);
    if (stage) {
      $("#question").value = stageQuestion(stage);
      setView("ask");
    }
  }

  const stageRecordButton = event.target.closest("[data-stage-record]");
  if (stageRecordButton) {
    const stage = state.project.workflow.find((item) => item.id === stageRecordButton.dataset.stageRecord);
    setView("records");
    setTimeout(() => {
      const firstRule = stage?.ruleIds?.[0];
      const row = firstRule ? Array.from(document.querySelectorAll("#recordTable tbody tr")).find((item) => item.firstElementChild?.textContent === firstRule) : null;
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  const stageMaterialButton = event.target.closest("[data-stage-material]");
  if (stageMaterialButton) {
    const stageId = stageMaterialButton.dataset.stageMaterial;
    const material = stageId === "S2" ? "g3" : stageId === "S4" ? "incident" : stageId === "S5" ? "g8" : "value";
    renderMaterials(material);
    setView("materials");
  }
});

setInterval(() => {
  if (state.records?.timer?.running) {
    $("#timerDisplay").textContent = formatElapsed(elapsedMs());
    renderWorkflow();
  }
}, 1000);

$("#runTests").addEventListener("click", () => runTests(false));
$("#runRealTests").addEventListener("click", () => runTests(true));
$("#refreshTestRuns").addEventListener("click", async () => {
  await loadTestRuns();
  await loadAcceptanceSummary();
});
$("#askButton").addEventListener("click", askQuestion);
$("#saveRecords").addEventListener("click", saveRecords);
$("#exportRecords").addEventListener("click", exportRecords);
$("#exportEvidence").addEventListener("click", exportEvidencePack);
$("#validateRecords").addEventListener("click", validateRecords);
$("#refreshMaterials").addEventListener("click", () => renderMaterials());
$("#exportMaterial").addEventListener("click", exportCurrentMaterial);
$("#copyMaterial").addEventListener("click", copyCurrentMaterial);
$("#saveModelConfig").addEventListener("click", saveModelConfig);
$("#testModelConfig").addEventListener("click", testModelConfig);
$("#clearModelKey").addEventListener("click", clearModelKey);
$("#saveKnowledge").addEventListener("click", saveKnowledge);
$("#newKnowledge").addEventListener("click", newKnowledge);
$("#copyKnowledgePreview").addEventListener("click", copyKnowledgePreview);
$("#editSelectedKnowledge").addEventListener("click", editSelectedKnowledge);
$("#closeKnowledgeModal").addEventListener("click", closeKnowledgeModal);
$("#checkKnowledge").addEventListener("click", () => checkKnowledge(true));
$("#knowledgeTemplate").addEventListener("change", newKnowledge);
$("#knowledgeTitle").addEventListener("input", () => {
  if (!$("#knowledgeId").value.trim()) $("#knowledgeId").value = knowledgeSlug($("#knowledgeTitle").value);
});
$("#knowledgeSearch").addEventListener("input", () => {
  state.knowledgeSearch = $("#knowledgeSearch").value;
  renderKnowledgeManager();
});
$("#deleteKnowledge").addEventListener("click", deleteKnowledge);
$("#saveRoles").addEventListener("click", saveRoles);
$("#reloadRoles").addEventListener("click", renderAdmin);
$("#resetRecords").addEventListener("click", () => {
  if (confirm("确定重置本机现场记录？")) {
    state.records = defaultRecords();
    saveRecords();
    renderRecords();
  }
});
$("#printRecords").addEventListener("click", () => window.print());
$("#startTimer").addEventListener("click", () => {
  state.records.timer.running = true;
  state.records.timer.startedAt = Date.now();
  saveRecords();
  renderWorkflow();
});
$("#pauseTimer").addEventListener("click", () => {
  state.records.timer.elapsedMs = elapsedMs();
  state.records.timer.running = false;
  state.records.timer.startedAt = null;
  saveRecords();
  renderWorkflow();
});
$("#resetTimer").addEventListener("click", () => {
  if (confirm("确定重置比赛计时？")) {
    state.records.timer = { startedAt: null, elapsedMs: 0, running: false };
    saveRecords();
    renderWorkflow();
  }
});
$("#roleFilter").addEventListener("change", renderWorkflow);
$("#addIncident").addEventListener("click", () => {
  state.records.incidents.push({
    scenario: "孔距偏差接近0.020mm",
    action: "暂停进给 -> 复核刀具磨损 -> 复核刀补 -> 检查装夹基准 -> 小量补偿后复测",
    basis: "图纸公差、G6实测数据、质检员判定"
  });
  renderRecords();
});
document.addEventListener("input", (event) => syncRecordInputs(event.target));
document.addEventListener("change", (event) => {
  syncRecordInputs(event.target);
  if (event.target.closest("#workflow")) saveRecords();
});
document.addEventListener("input", (event) => {
  if (event.target.closest("#workflow")) saveRecords();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#knowledgeModal").classList.contains("hidden")) {
    closeKnowledgeModal();
  }
});

boot();
