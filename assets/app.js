(() => {
  const ROLE_LABEL = {
    super: "超级管理员",
    admin: "管理员",
    user: "普通用户",
  };

  const ENTITY_TYPE_META = [
    { id: "人物", color: "#2563eb", shape: "circle" },
    { id: "地点", color: "#f59e0b", shape: "circle" },
    { id: "事件", color: "#ec4899", shape: "circle" },
    { id: "时间", color: "#10b981", shape: "circle" },
    { id: "交通", color: "#38bdf8", shape: "circle" },
    { id: "其他", color: "#8b5cf6", shape: "circle" },
  ];

  const LEGACY_TYPE_MAP = {
    用户: "人物",
    艺人: "人物",
    场馆: "地点",
    地点: "地点",
    偏好: "其他",
    交通: "交通",
    政策: "其他",
  };

  // 记忆类型 → 图谱实体类别（ENTITY_TYPE_META 的 id，用于上色）
  const MEM_TYPE_GRAPH_CAT = {
    偏好需求: "其他",
    生活事件: "事件",
    任务计划: "时间",
    对话回复风格: "其他",
    事实: "其他",
    稳定偏好: "其他",
    身份画像: "人物",
  };
  // 画像标签节点的候选实体类别（制造色彩层次）
  const LABEL_GRAPH_CATS = ["其他", "事件", "时间", "交通", "其他", "其他"];

  // 来源智能体固定筛选项（记忆列表 / 记忆关系图谱共用）
  const UM_AGENT_OPTIONS = ["交行知道", "代码助手", "个人智能体"];
  function umAgentFor(seedStr) {
    return UM_AGENT_OPTIONS[bankSeedNum(seedStr) % UM_AGENT_OPTIONS.length];
  }

  const state = {
    user: null,
    viewMode: "admin", // admin | user
    page: "spaces",
    // 监控看板状态
    monitorScene: "all", // all | jhzx | code | personal
    monitorRetrieveMetric: "total", // total | embedding | vector | rerank
    monitorExtractMetric: "extract", // extract | entity
    monitorView: "chart", // chart | table
    // 各卡片独立的日期区间 { vol|retrieve|extract: { start, end } }，字符串 YYYY-MM-DD
    monitorDates: {},
    // 各卡片列表的分页
    monitorPage: { vol: 1, retrieve: 1, extract: 1 },
    // 各卡片列表的排序 { key: { field: "time"|"value", dir: "asc"|"desc" } }
    monitorSort: {
      vol: { field: "time", dir: "desc" },
      retrieve: { field: "time", dir: "desc" },
      extract: { field: "time", dir: "desc" },
    },
    // 记忆库：选中的智能体（spaceId）与人员列表视图
    bankAgentId: null,
    bankUserView: "card", // card | table
    bankPage: 1,
    bankUserSearch: "",
    bankPlatformFilter: "all",
    spaceId: null,
    selectedUserId: null,
    debugMode: "extract", // extract | generate
    graphInstance: null,
    configTab: "extract", // extract | retrieve | extract-engine | retrieve-engine | forget-engine | reflect-engine
    paramsSubTab: "extract",
    outCurrentOpen: true,
    outHistOpen: {},
    paramsDirty: false,
    pgSessions: null,
    sessionSearch: "",
    sessionRailCollapsed: false,
    _sessionCtxIdx: null,
    debugParamId: null,
    engineVersionId: null,
    compareMode: false,
    comparePicking: false,
    comparePickIds: [],
    compareParamA: null,
    compareParamB: null,
    outView: "output", // output | graph
    recallGraphHighlight: null, // { ids, memCount, query }
    paramPresetsBySpace: null,
    stepRecall: false,
    debugLogPage: 0,
    lastRunAt: null,
    lastRunMs: null,
    pgSessionIdx: 0,
    msgView: "editor",
    sidebarExpanded: true,
    spaceSearch: "",
    bankSpaceFilter: "all",
    bankSearch: "",
    bankDetailUserId: null,
    bankPane: null,
    bankOverlayClosed: true,
    engineTab: "extract", // extract | retrieve | forget | reflect
    engineDraftBySpace: {},
    engineBaselineBySpace: null,
    umCardView: null, // 兼容旧逻辑（已不再用于详情浮层）
    umTab: "list", // list | graph —— 记忆详情默认进列表
    umListPage: 1,
    umForgetPage: 1,
    pgContextHidden: false,
    umPortraitOpen: true, // 右侧画像卡默认展开，可收起
    umRightOpen: false,
    // 记忆列表筛选（仅对列表生效）：时间范围 / 记忆类型 / 来源智能体
    umFTime: "all", // all | 7d | 30d | 90d
    umFType: "all", // all | 具体类型
    umFAgent: "all", // all | 交行知道 | 代码助手 | 个人智能体
    umGraphAgent: "all", // 图谱的来源智能体筛选（仅对图谱生效）
    _closeEntityFilter: null,
    _closeSpaceSearch: null,
  };

  const DEFAULT_MEMORY_TYPES = [
    {
      name: "对话回复风格",
      description: "记录用户语气、沟通习惯与表达倾向等偏好。",
    },
    {
      name: "生活事件",
      description: "生日、旅行、购物等近期生活事件梗概。",
    },
    {
      name: "偏好需求",
      description: "饮食、兴趣、品牌等偏好与需求。",
    },
    {
      name: "任务计划",
      description: "待办、日程与长期目标等任务计划。",
    },
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- helpers ---------- */
  function toast(msg) {
    let host = $(".toast-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function fmtTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { hour12: false });
  }

  function fmtMemTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtStamp(iso, withSec = false) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const pad = (n) => String(n).padStart(2, "0");
    const base = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return withSec ? `${base}:${pad(d.getSeconds())}` : base;
  }

  function shortMemType(type) {
    const t = String(type || "");
    if (t.includes("偏好") || t.includes("忌讳")) return "偏好";
    if (t.includes("计划") || t.includes("任务")) return "计划";
    if (t.includes("事实")) return "事实";
    if (t.includes("事件")) return "事件";
    if (t.includes("风格")) return "风格";
    if (t.includes("画像") || t.includes("身份")) return "画像";
    return t.slice(0, 4) || "记忆";
  }

  function toLocalInput(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 19);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function fromLocalInput(val) {
    if (!val) return new Date().toISOString();
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  function truncate(str, n = 18) {
    const s = String(str || "").trim();
    if (!s) return "";
    return s.length > n ? `${s.slice(0, n)}…` : s;
  }

  function typeSlug(type) {
    return String(type || "memory")
      .toLowerCase()
      .replace(/\s+/g, "-");
  }

  function cloneMessages(list) {
    return (list || []).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      text: m.text || "",
      at: m.at || new Date().toISOString(),
    }));
  }

  function ensurePgSessions() {
    if (state.pgSessions) return state.pgSessions;
    state.pgSessions = {
      extract: [
        {
          id: "session-8842",
          startedAt: "2025-10-17T05:48:00",
          messages: cloneMessages(MEMORA_DATA.debugScripts.extract),
          memories: [
            {
              content: "Sarah 偏好麦迪逊广场花园靠近舞台的座位",
              type: "偏好",
              extractAt: "2025-10-17T05:56:00",
              roundFrom: 1,
              roundTo: 1,
            },
            {
              content: "计划参加 Taylor Swift 巡演纽约场",
              type: "计划",
              extractAt: "2025-10-17T05:50:00",
              roundFrom: 1,
              roundTo: 1,
            },
            {
              content: "查询过从布鲁克林到 MSG 的地铁路线",
              type: "事实",
              extractAt: "2025-10-17T06:02:00",
              roundFrom: 2,
              roundTo: 2,
            },
          ],
        },
        {
          id: "session-2201",
          startedAt: "2025-10-16T14:20:00",
          messages: [
            {
              role: "user",
              text: "帮我规划一下北京旅行计划，想去故宫和长城。",
              at: "2025-10-16T14:20:00",
            },
            {
              role: "assistant",
              text: "好的，我可以按你的节奏安排故宫与长城行程。",
              at: "2025-10-16T14:20:20",
            },
            {
              role: "user",
              text: "长城怎么去比较方便？希望白天去。",
              at: "2025-10-16T14:22:00",
            },
            {
              role: "assistant",
              text: "可以优先白天参观，并推荐交通方案。",
              at: "2025-10-16T14:22:18",
            },
            {
              role: "user",
              text: "故宫也安排在同一天可以吗？",
              at: "2025-10-16T14:24:00",
            },
            {
              role: "assistant",
              text: "同一天偏紧，我建议拆成两天更从容。",
              at: "2025-10-16T14:24:20",
            },
          ],
          memories: [
            { content: "计划前往北京故宫与长城", type: "计划", extractAt: "2025-10-16T14:25:00", roundFrom: 1, roundTo: 1 },
            { content: "偏好白天参观热门景点", type: "偏好", extractAt: "2025-10-16T14:26:00", roundFrom: 2, roundTo: 2 },
            { content: "询问过长城交通方式", type: "事实", extractAt: "2025-10-16T14:27:00", roundFrom: 2, roundTo: 3 },
          ],
        },
        {
          id: "session-110",
          startedAt: "2025-10-15T18:32:00",
          messages: [
            { role: "user", text: "周末有什么合适的餐厅可以推荐吗？", at: "2025-10-15T18:32:00" },
            { role: "assistant", text: "可以，我先按你的口味偏好筛选几家。", at: "2025-10-15T18:32:18" },
            { role: "user", text: "安静一点的，预算中等偏上，最好步行可达。", at: "2025-10-15T18:33:00" },
            { role: "assistant", text: "记下了：安静氛围、中高预算、步行可达。", at: "2025-10-15T18:33:20" },
            { role: "user", text: "日料和西餐都可以看看。", at: "2025-10-15T18:34:00" },
            { role: "assistant", text: "好的，我会同时筛选日料与西餐选项。", at: "2025-10-15T18:34:16" },
          ],
          memories: [
            { content: "周末想外出用餐", type: "计划", extractAt: "2025-10-15T18:35:00", roundFrom: 1, roundTo: 1 },
            { content: "偏好安静氛围的餐厅", type: "偏好", extractAt: "2025-10-15T18:36:00", roundFrom: 2, roundTo: 2 },
            { content: "预算中等偏上", type: "偏好", extractAt: "2025-10-15T18:38:00", roundFrom: 2, roundTo: 2 },
            { content: "希望步行可达", type: "偏好", extractAt: "2025-10-15T18:39:00", roundFrom: 2, roundTo: 2 },
            { content: "询问过日料与西餐选项", type: "事实", extractAt: "2025-10-15T18:37:00", roundFrom: 3, roundTo: 3 },
          ],
        },
        {
          id: "session-910",
          startedAt: "2025-10-14T10:00:00",
          messages: [
            { role: "user", text: "这周工作安排帮我梳理一下。", at: "2025-10-14T10:00:00" },
            { role: "assistant", text: "好的，我按优先级帮你整理本周事项。", at: "2025-10-14T10:00:18" },
            { role: "user", text: "季度汇报最重要，尽量安排在上午。", at: "2025-10-14T10:01:00" },
            { role: "assistant", text: "已把季度汇报放在上午优先处理。", at: "2025-10-14T10:01:20" },
          ],
          memories: [
            { content: "本周需完成季度汇报", type: "计划", extractAt: "2025-10-14T10:05:00", roundFrom: 1, roundTo: 2 },
            { content: "偏好上午处理重要事项", type: "偏好", extractAt: "2025-10-14T10:06:00", roundFrom: 2, roundTo: 2 },
          ],
        },
        {
          id: "session-552",
          startedAt: "2025-10-12T09:00:00",
          messages: [
            { role: "user", text: "帮我制定下周健身计划。", at: "2025-10-12T09:00:00" },
            { role: "assistant", text: "可以，我按力量与有氧搭配安排。", at: "2025-10-12T09:00:20" },
            { role: "user", text: "一周三次，晚上练，不要长跑。", at: "2025-10-12T09:01:00" },
            { role: "assistant", text: "好的，晚间三次，侧重力量和拉伸。", at: "2025-10-12T09:01:22" },
          ],
          memories: [
            { content: "每周计划健身 3 次", type: "计划", extractAt: "2025-10-12T09:05:00", roundFrom: 1, roundTo: 2 },
            { content: "偏好晚间锻炼", type: "偏好", extractAt: "2025-10-12T09:06:00", roundFrom: 2, roundTo: 2 },
            { content: "关注力量训练与拉伸", type: "事实", extractAt: "2025-10-12T09:07:00", roundFrom: 1, roundTo: 2 },
            { content: "不喜欢跑步机长跑", type: "偏好", extractAt: "2025-10-12T09:08:00", roundFrom: 2, roundTo: 2 },
          ],
        },
        {
          id: "session-331",
          startedAt: "2025-10-10T16:00:00",
          messages: [
            { role: "user", text: "东京旅行想怎么安排比较好？", at: "2025-10-10T16:00:00" },
            { role: "assistant", text: "可以按区域拆分行程，我先给你一版草案。", at: "2025-10-10T16:00:22" },
            { role: "user", text: "想去浅草和涩谷，大概五天，地铁为主。", at: "2025-10-10T16:02:00" },
            { role: "assistant", text: "记下了，我会按地铁出行规划 5 天行程。", at: "2025-10-10T16:02:20" },
            { role: "user", text: "JR Pass 有必要买吗？也想吃拉面。", at: "2025-10-10T16:04:00" },
            { role: "assistant", text: "五天市区为主可不买 JR Pass；拉面我可以推荐几家。", at: "2025-10-10T16:04:24" },
          ],
          memories: [
            { content: "计划前往东京旅行", type: "计划", extractAt: "2025-10-10T16:05:00", roundFrom: 1, roundTo: 1 },
            { content: "想去浅草与涩谷", type: "计划", extractAt: "2025-10-10T16:06:00", roundFrom: 2, roundTo: 2 },
            { content: "行程约 5 天", type: "事实", extractAt: "2025-10-10T16:10:00", roundFrom: 2, roundTo: 2 },
            { content: "偏好地铁出行", type: "偏好", extractAt: "2025-10-10T16:07:00", roundFrom: 2, roundTo: 2 },
            { content: "询问过 JR Pass", type: "事实", extractAt: "2025-10-10T16:08:00", roundFrom: 3, roundTo: 3 },
            { content: "对拉面感兴趣", type: "偏好", extractAt: "2025-10-10T16:09:00", roundFrom: 3, roundTo: 3 },
          ],
        },
      ],
      generate: [
        {
          id: "session-recall-1",
          startedAt: "2025-10-20T14:00:00",
          messages: cloneMessages(MEMORA_DATA.debugScripts.retrieve),
          memories: null,
        },
        {
          id: "session-recall-2",
          startedAt: "2025-10-21T09:30:00",
          messages: [
            {
              role: "user",
              text: "从布鲁克林去 MSG，交通怎么安排比较好？",
              at: "2025-10-21T09:30:00",
            },
            {
              role: "assistant",
              text: "根据你的记忆，地铁约 35 分钟，我可以按这个偏好继续规划。",
              at: "2025-10-21T09:30:25",
            },
          ],
          memories: [
            { content: "Sarah 偏好麦迪逊广场花园靠近舞台的座位", type: "偏好", extractAt: "2025-10-17T05:56:00", roundFrom: 1, roundTo: 1 },
            { content: "从布鲁克林坐地铁到 MSG 约 35 分钟", type: "事实", extractAt: "2025-10-17T06:02:00", roundFrom: 1, roundTo: 1 },
          ],
        },
      ],
    };
    // 保留各会话初始结果快照，供「重新测试」恢复
    ["extract", "generate"].forEach((key) => {
      state.pgSessions[key].forEach((s) => {
        s._seedMemories =
          s.memories == null ? null : JSON.parse(JSON.stringify(s.memories));
        if (!Array.isArray(s.debugLog)) s.debugLog = [];
      });
    });
    // 演示：首个抽取会话预置两条调试记录，便于对比
    const first = state.pgSessions.extract[0];
    if (first && !first.debugLog.length && first.memories?.length) {
      const all = JSON.parse(JSON.stringify(first.memories));
      first.debugLog.push(
        {
          id: "dbg-seed-2",
          at: "2025-10-17T06:08:00",
          kind: "extract",
          paramId: "preset-strict",
          paramLabel: "严格抽取 · 高阈值",
          summary: `${Math.min(2, all.length)} 条记忆 · 严格阈值`,
          memories: all.filter((m) => /偏好|计划/.test(m.type || "")).slice(0, 2),
          durationMs: 2180,
        },
        {
          id: "dbg-seed-1",
          at: first.startedAt || "2025-10-17T06:05:00",
          kind: "extract",
          paramId: "preset-current",
          paramLabel: "当前空间配置",
          summary: `${all.length} 条记忆 · 初始抽取`,
          memories: all,
          durationMs: 2310,
        },
        {
          id: "dbg-seed-3",
          at: "2025-10-17T05:58:00",
          kind: "extract",
          paramId: "preset-lite",
          paramLabel: "轻量抽取 · v1 模型",
          summary: "1 条记忆 · 轻量抽取",
          memories: all.slice(0, 1),
          durationMs: 1640,
        },
        {
          id: "dbg-seed-4",
          at: "2025-10-17T05:52:00",
          kind: "extract",
          paramId: "preset-recall",
          paramLabel: "召回增强 · 宽召回",
          summary: "2 条记忆 · 宽召回",
          memories: all.slice(1, 3),
          durationMs: 2480,
        },
        {
          id: "dbg-seed-5",
          at: "2025-10-17T05:40:00",
          kind: "extract",
          paramId: "preset-strict",
          paramLabel: "严格抽取 · 高阈值",
          summary: "2 条记忆 · 复跑",
          memories: all.slice(0, 2),
          durationMs: 2010,
        },
        {
          id: "dbg-seed-6",
          at: "2025-10-17T05:32:00",
          kind: "extract",
          paramId: "preset-current",
          paramLabel: "当前空间配置",
          summary: `${all.length} 条记忆 · 首次抽取`,
          memories: all,
          durationMs: 2760,
        }
      );
    }
    state.pgSessionIdx = 0;
    return state.pgSessions;
  }

  function currentModeKey() {
    return state.debugMode === "generate" ? "generate" : "extract";
  }

  function cloneConfig(cfg) {
    return JSON.parse(JSON.stringify(cfg || {}));
  }

  function ensureParamPresets(space) {
    if (!space) return [];
    if (!state.paramPresetsBySpace) state.paramPresetsBySpace = {};
    let list = state.paramPresetsBySpace[space.id];
    if (!list) {
      const base = cloneConfig(space.config);
      list = [
        {
          id: "preset-current",
          name: "当前空间配置",
          desc: "与引擎页保存内容同步",
          builtin: true,
          config: base,
        },
        {
          id: "preset-strict",
          name: "严格抽取 · 高阈值",
          desc: "相似度 0.85 · TopK 5 · 仅向量+关键词",
          builtin: true,
          config: (() => {
            const c = cloneConfig(base);
            c.retrieve.similarity = 0.85;
            c.retrieve.topK = 5;
            c.retrieve.vectorTopK = 6;
            c.retrieve.keywordTopK = 3;
            c.retrieve.methods = (c.retrieve.methods || []).map((m) => ({
              ...m,
              enabled: m.id !== "graph",
              weight: m.id === "vector" ? 0.7 : m.id === "keyword" ? 0.3 : 0,
            }));
            c.extract.model = "mem-extract-v2";
            c.extract.prompt =
              (c.extract.prompt || "") + "\n仅保留高置信偏好与计划，忽略闲聊。";
            return c;
          })(),
        },
        {
          id: "preset-recall",
          name: "召回增强 · 宽召回",
          desc: "相似度 0.55 · TopK 12 · 三路融合+重排",
          builtin: true,
          config: (() => {
            const c = cloneConfig(base);
            c.retrieve.similarity = 0.55;
            c.retrieve.topK = 12;
            c.retrieve.vectorTopK = 16;
            c.retrieve.keywordTopK = 8;
            c.retrieve.rerankEnabled = true;
            c.retrieve.rerankModel = "rerank-pro";
            c.retrieve.methods = (c.retrieve.methods || []).map((m) => ({
              ...m,
              enabled: true,
              weight: m.id === "vector" ? 0.45 : m.id === "graph" ? 0.3 : 0.25,
            }));
            return c;
          })(),
        },
        {
          id: "preset-lite",
          name: "轻量抽取 · v1 模型",
          desc: "mem-extract-v1 · TopK 6 · 关闭重排",
          builtin: true,
          config: (() => {
            const c = cloneConfig(base);
            c.extract.model = "mem-extract-v1";
            c.retrieve.topK = 6;
            c.retrieve.rerankEnabled = false;
            c.retrieve.rerankModel = "rerank-off";
            return c;
          })(),
        },
      ];
      state.paramPresetsBySpace[space.id] = list;
    } else {
      const cur = list.find((p) => p.id === "preset-current");
      if (cur) cur.config = cloneConfig(space.config);
    }
    if (!state.debugParamId || !list.find((p) => p.id === state.debugParamId)) {
      state.debugParamId = list[0]?.id || null;
    }
    if (!state.compareParamA) state.compareParamA = list[0]?.id || null;
    if (!state.compareParamB) {
      state.compareParamB = list[1]?.id || list[0]?.id || null;
    }
    return list;
  }

  function getParamPreset(space, id) {
    const list = ensureParamPresets(space);
    return list.find((p) => p.id === id) || list[0] || null;
  }

  function activeEngineVersion(space) {
    const list = ensureParamPresets(space);
    if (!state.engineVersionId || !list.find((p) => p.id === state.engineVersionId)) {
      state.engineVersionId = "preset-current";
    }
    return getParamPreset(space, state.engineVersionId);
  }

  function syncPresetCurrent(space) {
    const cur = ensureParamPresets(space).find((p) => p.id === "preset-current");
    if (cur) cur.config = cloneConfig(space.config);
  }

  function applyVersionToSpace(space, version) {
    if (!space || !version?.config) return;
    space.config = cloneConfig(version.config);
    ensureReflect(space.config);
    syncPresetCurrent(space);
  }

  function formatVersionTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function activeDebugPreset(space) {
    return getParamPreset(space, state.debugParamId);
  }

  function presetSummary(preset) {
    if (!preset?.config) return "";
    const r = preset.config.retrieve || {};
    const e = preset.config.extract || {};
    const methods = (r.methods || [])
      .filter((m) => m.enabled)
      .map((m) => m.label)
      .join("+");
    return `${e.model || "—"} · TopK ${r.topK ?? "—"} · 阈值 ${Number(r.similarity ?? 0).toFixed(2)} · ${methods || "无检索路"}`;
  }

  function ensureSessionDebugLog(session) {
    if (!session) return [];
    if (!Array.isArray(session.debugLog)) session.debugLog = [];
    return session.debugLog;
  }

  function snapshotPreset(preset) {
    if (!preset) return null;
    const r = preset.config?.retrieve || {};
    const e = preset.config?.extract || {};
    return {
      name: preset.name || "—",
      model: e.model || "—",
      topK: r.topK ?? "—",
      similarity: r.similarity != null ? Number(r.similarity).toFixed(2) : "—",
      keywordTopK: r.keywordTopK ?? "—",
      vectorTopK: r.vectorTopK ?? "—",
      rerank: r.rerankEnabled === false || r.rerankModel === "rerank-off" ? "关闭" : r.rerankModel || "—",
      methods: (r.methods || [])
        .filter((m) => m.enabled)
        .map((m) => `${m.label} ${Number(m.weight).toFixed(2)}`)
        .join(" · ") || "—",
      extractPrompt: (e.prompt || "").replace(/\s+/g, " ").trim(),
      retrievePrompt: (r.prompt || "").replace(/\s+/g, " ").trim(),
    };
  }

  function pushDebugLog(session, entry) {
    if (!session) return;
    const log = ensureSessionDebugLog(session);
    const space = spaceById(state.spaceId);
    let paramDetail = entry.paramDetail || null;
    if (!paramDetail && space) {
      if (entry.kind === "compare" && entry.compare) {
        paramDetail = {
          a: snapshotPreset(getParamPreset(space, entry.compare.aId)),
          b: snapshotPreset(getParamPreset(space, entry.compare.bId)),
        };
      } else if (entry.paramId) {
        paramDetail = snapshotPreset(getParamPreset(space, entry.paramId));
      }
    }
    log.unshift({
      id: `dbg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      ...entry,
      paramDetail,
    });
    if (log.length > 30) log.length = 30;
    state.debugLogPage = 0;
  }

  function memoriesForPreset(space, preset, session, isGen) {
    const base = isGen
      ? Array.isArray(session?._seedMemories) && session._seedMemories.length
        ? JSON.parse(JSON.stringify(session._seedMemories))
        : getRetrievedMemories()
      : Array.isArray(session?._seedMemories) && session._seedMemories.length
        ? JSON.parse(JSON.stringify(session._seedMemories))
        : (() => {
            const stored = getExtractedMemories(space.id, playgroundUserId());
            return stored.length ? stored : defaultExtractMemories();
          })();

    const pid = preset?.id || "";
    const cfg = preset?.config || space.config;
    const topK = cfg?.retrieve?.topK ?? 8;
    const sim = cfg?.retrieve?.similarity ?? 0.7;
    let list = base.map((m, i) => ({ ...m }));

    if (pid === "preset-strict") {
      list = list
        .filter((m) => /偏好|计划/.test(m.type || ""))
        .map((m, i) => ({
          ...m,
          score: Math.max(0.82, 0.96 - i * 0.04),
          note: "严格阈值过滤后保留",
        }));
    } else if (pid === "preset-recall") {
      list = [
        ...list,
        {
          content: "（宽召回补充）用户近期多次提及相关主题",
          type: "事实",
          extractAt: new Date().toISOString(),
          roundFrom: 1,
          roundTo: Math.max(1, sessionRoundCount(session)),
          score: 0.61,
          note: "宽召回补充候选",
        },
      ].map((m, i) => ({
        ...m,
        score: m.score ?? Math.max(0.55, 0.9 - i * 0.05),
      }));
    } else if (pid === "preset-lite") {
      list = list.slice(0, Math.min(2, list.length)).map((m, i) => ({
        ...m,
        score: Math.max(0.7, 0.88 - i * 0.06),
        note: "轻量模型抽样结果",
      }));
    } else {
      list = list.map((m, i) => ({
        ...m,
        score: m.score ?? Math.max(0.65, 0.92 - i * 0.04),
      }));
    }

    if (sim >= 0.8) list = list.filter((m) => (m.score ?? 0.8) >= 0.8);
    return list.slice(0, Math.max(1, topK));
  }

  function currentSession() {
    const sessions = ensurePgSessions()[currentModeKey()];
    const idx = Math.min(state.pgSessionIdx, sessions.length - 1);
    state.pgSessionIdx = Math.max(0, idx);
    return sessions[state.pgSessionIdx];
  }

  function sessionFirstContent(session) {
    const first =
      session?.messages?.find((m) => m.role === "user" && m.text?.trim())?.text ||
      session?.messages?.find((m) => m.text?.trim())?.text ||
      "";
    return first.replace(/\s+/g, " ").trim();
  }

  function sessionTitle(session) {
    if (session?.displayName?.trim()) return session.displayName.trim();
    if (session?.title?.trim()) return session.title.trim();
    return sessionFirstContent(session);
  }

  function sessionName(session, index) {
    return session?.id || session?.name || `session-${index + 1}`;
  }

  /** 默认名称：会话 id + 首条内容；重命名后用 displayName */
  function sessionListName(session, index) {
    if (session?.displayName?.trim()) return session.displayName.trim();
    const id = sessionName(session, index);
    const first = sessionFirstContent(session);
    if (!first) return id;
    return `${id} · ${truncate(first, 28)}`;
  }

  function sessionTriggerLabel(session, index) {
    return sessionListName(session, index);
  }

  function sessionListLabel(session, index) {
    return sessionListName(session, index);
  }

  function sessionRoundCount(session) {
    const msgs = session?.messages || [];
    const users = msgs.filter((m) => m.role === "user" && m.text?.trim()).length;
    return users || Math.max(0, Math.ceil(msgs.length / 2));
  }

  function formatRoundRange(from, to) {
    const a = Number(from);
    const b = Number(to == null ? from : to);
    if (!Number.isFinite(a) || a < 1) return "";
    if (!Number.isFinite(b) || b <= a) return `第${a}轮`;
    return `第${a}-${b}轮`;
  }

  function inferMemoryRoundRange(msgs, mem) {
    if (mem?.roundFrom != null) {
      return {
        from: Number(mem.roundFrom),
        to: Number(mem.roundTo != null ? mem.roundTo : mem.roundFrom),
      };
    }
    const indexed = (msgs || []).map((m, idx) => ({ ...m, idx }));
    const users = indexed.filter((m) => m.role === "user" && m.text?.trim());
    if (!users.length) return { from: 1, to: 1 };
    const content = mem?.content || "";
    const keys = ["舞台", "座位", "地铁", "布鲁克林", "故宫", "长城", "餐厅", "健身", "东京", "浅草", "工作", "汇报", "拉面", "JR"];
    const hits = [];
    users.forEach((u, ri) => {
      const round = ri + 1;
      if (keys.some((k) => content.includes(k) && u.text.includes(k))) hits.push(round);
    });
    if (!hits.length) {
      const n = users.length;
      return { from: 1, to: Math.min(n, 2) };
    }
    return { from: Math.min(...hits), to: Math.max(...hits) };
  }

  function memoryRoundLabel(msgs, mem) {
    const { from, to } = inferMemoryRoundRange(msgs, mem);
    return formatRoundRange(from, to);
  }

  function relativeSessionTime(iso) {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "";
    const diff = Date.now() - t;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    return fmtStamp(iso, true);
  }

  function renderSessionRail(sessions, activeIdx) {
    const q = (state.sessionSearch || "").trim().toLowerCase();
    const filtered = sessions
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => {
        if (!q) return true;
        return [s.id, sessionListName(s, i), sessionFirstContent(s)]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
    const cards = filtered.length
      ? filtered
          .map(({ s, i }) => {
            const active = i === activeIdx ? "active" : "";
            const rounds = sessionRoundCount(s);
            const preview = sessionFirstContent(s);
            return `
              <div class="pg-session-card ${active}" data-session-idx="${i}">
                <div class="pg-session-card-top">
                  <button type="button" class="pg-session-card-main" data-session-pick="${i}">
                    <span class="pg-session-card-name">${esc(sessionListName(s, i))}</span>
                    <span class="pg-session-card-time">${esc(relativeSessionTime(s.startedAt))}</span>
                  </button>
                  <button type="button" class="pg-session-more" data-session-more="${i}" title="更多" aria-label="更多操作">···</button>
                </div>
                ${
                  preview
                    ? `<p class="pg-session-card-preview">${esc(truncate(preview, 48))}</p>`
                    : ""
                }
                <div class="pg-session-card-tags">
                  <span class="pg-session-tag">${rounds}轮</span>
                </div>
              </div>`;
          })
          .join("")
      : `<div class="pg-session-empty">无匹配会话</div>`;

    const collapsed = !!state.sessionRailCollapsed;
    return `
      <aside class="pg-session-rail ${collapsed ? "is-collapsed" : ""}" id="pg-session-rail">
        <div class="pg-session-rail-hd">
          <span class="pg-session-rail-title">会话列表</span>
          <button type="button" class="btn btn-primary btn-sm" id="pg-session-new">+ 新建</button>
        </div>
        <div class="pg-session-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
          <input type="search" id="pg-session-search" class="pg-session-search-input" placeholder="会话 ID / 内容" value="${esc(state.sessionSearch || "")}" />
        </div>
        <div class="pg-session-list" id="pg-session-list">${cards}</div>
        <div class="pg-session-ctx hidden" id="pg-session-ctx" role="menu">
          <button type="button" data-session-act="rename">重命名</button>
          <button type="button" data-session-act="duplicate">复制</button>
          <div class="pg-session-ctx-sep"></div>
          <button type="button" class="is-danger" data-session-act="delete">删除</button>
        </div>
      </aside>`;
  }

  /** @deprecated kept for any leftover refs — prefer renderSessionRail */
  function renderSessionPicker(sessions, activeIdx) {
    return renderSessionRail(sessions, activeIdx);
  }

  function spaceById(id) {
    return MEMORA_DATA.spaces.find((s) => s.id === id);
  }

  function userById(id) {
    return MEMORA_DATA.users.find((u) => u.id === id);
  }

  function accessibleSpaces() {
    const u = state.user;
    if (!u) return [];
    if (state.viewMode === "user" || u.role === "user") {
      const ids = u.usedSpaces || [];
      return MEMORA_DATA.spaces.filter((s) => ids.includes(s.id));
    }
    if (u.role === "super") return [...MEMORA_DATA.spaces];
    const ids = u.managedSpaces || [];
    return MEMORA_DATA.spaces.filter((s) => ids.includes(s.id));
  }

  function canSeePermissions() {
    return state.user?.role === "super" && state.viewMode === "admin";
  }

  function canManageContent(spaceId) {
    const u = state.user;
    if (!u) return false;
    if (u.role === "super") return true;
    if (u.role === "user") return false;
    const p = (u.spacePerms || {})[spaceId];
    return !!(p && p.content);
  }

  function canManageOps(spaceId) {
    const u = state.user;
    if (!u) return false;
    if (u.role === "super") return true;
    if (u.role === "user") return false;
    const p = (u.spacePerms || {})[spaceId];
    return !!(p && p.ops);
  }

  function graphKey(userId, spaceId) {
    return `${userId}|${spaceId}`;
  }

  function getGraph(userId, spaceId) {
    return mapGraph(MEMORA_DATA.graphs[graphKey(userId, spaceId)] || { nodes: [], edges: [] });
  }

  // 真实图谱 / 演示图谱统一映射：type → category → 颜色
  function mapGraph(raw) {
    const g = raw || { nodes: [], edges: [] };
    return {
      ...g,
      nodes: (g.nodes || []).map((n) => {
        const cat = LEGACY_TYPE_MAP[n.type] || n.type;
        const meta = ENTITY_TYPE_META.find((t) => t.id === cat);
        return {
          ...n,
          category: cat,
          shape: "circle",
          color: meta?.color || n.color || "#2563eb",
          agent: n.agent || umAgentFor(n.id || n.uuid || n.label || "n"),
        };
      }),
    };
  }

  // 为无真实图谱的用户，依据其记忆列表生成稳定的演示图谱
  // 结构：核心用户节点 → 各记忆类型节点 → 该类型下的画像标签节点（两层聚类，连线清晰）
  function demoGraphForUser(uid, spaceId) {
    const user = userById(uid);
    const rows = userMemoryRows(uid, spaceId);
    const nodes = [{ id: `g-user-${uid}`, label: user?.name || "用户", type: "用户", kind: "user" }];
    const edges = [];
    const typeLabels = {}; // type -> Set(labels)
    rows.forEach((r) => {
      const set = (typeLabels[r.type] = typeLabels[r.type] || new Set());
      (r.labels || []).forEach((l) => set.add(l));
    });
    const TYPES = Object.keys(typeLabels);
    TYPES.forEach((t, i) => {
      const tid = `g-type-${uid}-${i}`;
      nodes.push({ id: tid, label: t, type: MEM_TYPE_GRAPH_CAT[t] || "其他", kind: "type", agent: umAgentFor(tid) });
      edges.push({ id: `ge-${uid}-${i}-u`, from: `g-user-${uid}`, to: tid, label: "记忆类型" });
      [...typeLabels[t]].forEach((l, j) => {
        const lid = `g-lab-${uid}-${i}-${j}`;
        const lcat = LABEL_GRAPH_CATS[bankSeedNum(`${uid}|${spaceId}|lab|${l}`) % LABEL_GRAPH_CATS.length];
        nodes.push({ id: lid, label: l, type: lcat, kind: "label", agent: umAgentFor(lid) });
        edges.push({ id: `ge-${uid}-${i}-${j}`, from: tid, to: lid, label: "关联标签" });
      });
    });
    return { nodes, edges };
  }

  // 按来源智能体过滤图谱：保留核心用户节点 + 该智能体的节点，边两端都保留才保留
  function filterGraphByAgent(g, agent) {
    if (!agent || agent === "all") return g;
    const nodes = (g.nodes || []).filter((n) => n.kind === "user" || n.agent === agent);
    const ids = new Set(nodes.map((n) => n.id));
    const edges = (g.edges || []).filter((e) => ids.has(e.from) && ids.has(e.to));
    return { nodes, edges };
  }

  // 取用户图谱：有真实图谱用真实，否则用演示图谱（始终有数据可展示）
  function userGraph(userId, spaceId) {
    const raw = MEMORA_DATA.graphs[graphKey(userId, spaceId)];
    if (raw && (raw.nodes || []).length) return getGraph(userId, spaceId);
    return mapGraph(demoGraphForUser(userId, spaceId));
  }

  /* ---------- login ---------- */
  function enterAs(user, { silent = false } = {}) {
    state.user = { ...user };
    state.viewMode = user.role === "user" ? "user" : "admin";
    state.page = "memories";
    const spaces = accessibleSpaces();
    state.spaceId = spaces[0]?.id || null;
    state.selectedUserId = user.role === "user" ? user.id : "u-sarah";

    $("#login-screen")?.classList.add("hidden");
    $("#app")?.classList.remove("hidden");
    renderChrome();
    renderPage();
    if (!silent) toast(`已以「${ROLE_LABEL[user.role]}」身份登录`);
  }

  function initLogin() {
    $("#login-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const username = $("#login-username").value.trim().toLowerCase();
      const role = $$('input[name="role"]').find((r) => r.checked)?.value || "super";
      let user = MEMORA_DATA.users.find((u) => u.username === username);
      if (!user) {
        user = MEMORA_DATA.users.find((u) => u.role === role);
      }
      if (role === "super") user = MEMORA_DATA.users.find((u) => u.role === "super");
      else if (role === "admin") user = MEMORA_DATA.users.find((u) => u.role === "admin");
      else if (username === "sarah" || role === "user") {
        user =
          MEMORA_DATA.users.find((u) => u.username === username && u.role === "user") ||
          MEMORA_DATA.users.find((u) => u.username === "sarah");
      }
      enterAs(user);
    });
  }

  /* ---------- chrome ---------- */
  function navSections() {
    // 扁平五项，无分组标题
    return [
      { id: "monitor", label: "监控看板", icon: iconActivity() },
      { id: "memories", label: "记忆库", icon: iconBook() },
      { id: "engine", label: "记忆参数配置", icon: iconEngine() },
      { id: "space-config", label: "记忆调试", icon: iconTune() },
      { id: "verify", label: "记忆验证", icon: iconCheck() },
    ];
  }

  function renderNavItem(item) {
    const active = state.page === item.id ? "active" : "";
    const tip = item.label;
    if (item.disabled) {
      return `<button type="button" class="nav-item" disabled data-tip="${tip}" title="${tip}">
          ${item.icon}<span class="nav-label">${item.label}</span>
          ${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ""}
        </button>`;
    }
    return `<button type="button" class="nav-item ${active}" data-page="${item.id}" data-tip="${tip}" title="${tip}">
      ${item.icon}<span class="nav-label">${item.label}</span>
      ${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ""}
    </button>`;
  }

  function pageCrumbLabel(page) {
    const map = {
      monitor: "监控看板",
      memories: "记忆库",
      engine: "记忆参数配置",
      "space-config": "记忆调试",
      verify: "记忆验证",
    };
    return map[page] || "记忆控制台";
  }

  function renderBreadcrumb() {
    const el = $("#breadcrumb");
    if (!el) return;
    const leaf = pageCrumbLabel(state.page);
    el.innerHTML = `
      <span class="crumb-muted">记忆控制台</span>
      <span class="crumb-sep">/</span>
      <span class="crumb-current">${esc(leaf)}</span>`;
    $$("[data-crumb]", el).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.page = btn.dataset.crumb;
        state.bankDetailUserId = null;
        renderChrome();
        renderPage();
      });
    });
  }

  function renderChrome() {
    const u = state.user;
    const topAvatar = $("#topbar-avatar");
    if (topAvatar) {
      topAvatar.textContent = u.avatar || "ZZ";
      topAvatar.title = `${u.name} · ${ROLE_LABEL[u.role]}`;
    }

    const app = $("#app");
    app?.classList.toggle("sidebar-collapsed", !state.sidebarExpanded);
    app?.setAttribute("data-sidebar", state.sidebarExpanded ? "expanded" : "collapsed");
    // 用户端：隐藏左侧导航栏，明细板画像卡移到最左
    app?.classList.toggle("user-view", state.viewMode === "user");
    // 用户端顶栏整体隐藏后，管理员/超管预览需要悬浮返回按钮；真实用户无需返回
    let backBtn = $("#user-view-back");
    if (state.viewMode === "user" && u.role !== "user") {
      if (!backBtn) {
        backBtn = document.createElement("button");
        backBtn.type = "button";
        backBtn.id = "user-view-back";
        backBtn.className = "user-view-back";
        backBtn.textContent = "← 返回管理端";
        backBtn.title = "返回管理端";
        backBtn.setAttribute("aria-label", "返回管理端");
        backBtn.addEventListener("click", () => {
          state.viewMode = "admin";
          state.page = "memories";
          renderChrome();
          renderPage();
        });
        document.body.appendChild(backBtn);
      }
    } else if (backBtn) {
      backBtn.remove();
    }

    const switchEl = $("#topbar-view-switch");
    if (u.role === "user") {
      switchEl.classList.add("hidden");
    } else {
      switchEl.classList.remove("hidden");
      // 管理端显示"→ 用户端"，用户端显示"→ 管理端"
      const isUserMode = state.viewMode === "user";
      const target = isUserMode ? "管理端" : "用户端";
      const switchIcon =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3l4 4-4 4M20 7H7M8 21l-4-4 4-4M4 17h13"/></svg>';
      switchEl.innerHTML = `${switchIcon}<span>${target}</span>`;
      switchEl.dataset.targetView = isUserMode ? "admin" : "user";
      switchEl.title = `切换到${target}`;
      switchEl.setAttribute("aria-label", `切换到${target}`);
    }

    const nav = $("#sidebar-nav");
    const sections = navSections();
    // 扁平渲染，无分组标题
    nav.innerHTML = `<div class="nav-section">${sections.map(renderNavItem).join("")}</div>`;

    $$("[data-page]", nav).forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.dataset.page;
        if (next === "space-config") {
          state.configTab = "extract";
          state.debugMode = "extract";
        }
        state.page = next;
        renderChrome();
        renderPage();
      });
    });

    renderBreadcrumb();
  }

  function setPageTitle(title, actionsHtml = "", subtitle = "") {
    document.querySelector(".page-head")?.classList.remove("hidden");
    const titleEl = $("#page-title");
    if (titleEl) titleEl.textContent = title;
    const sub = $("#page-subtitle");
    if (sub) {
      sub.textContent = subtitle || "";
      sub.classList.toggle("hidden", !subtitle);
    }
    const actions = $("#page-head-actions");
    if (actions) actions.innerHTML = actionsHtml || "";
    document.querySelector(".page-head-row")?.classList.toggle("hidden", !title);
    document.body.classList.toggle("page-has-cfg-context", !!actions?.querySelector(".cfg-context"));
    renderBreadcrumb();
  }

  /* ---------- pages ---------- */
  function renderPage() {
    destroyGraph();
    const content = $("#content");
    const page = state.page;
    setPageTitle("");

    if (page === "monitor") renderMonitor(content);
    else if (page === "space-config") renderSpaceConfig(content);
    else if (page === "engine") renderEngineParams(content);
    else if (page === "memories" || page === "my-memories") renderMemories(content);
    else if (page === "verify") renderVerify(content);
    else content.innerHTML = `<div class="empty-state">页面不存在</div>`;
  }

  function renderSpaces(root) {
    const isSuper = state.user?.role === "super";
    setPageTitle(
      "",
      isSuper
        ? `<button type="button" class="btn btn-primary" id="btn-create-space">创建智能体记忆空间</button>`
        : ""
    );

    const allSpaces = accessibleSpaces();
    const q = (state.spaceSearch || "").trim().toLowerCase();

    const matchSpace = (s) => {
      if (!q) return true;
      const ownerName = (s.owners || [])
        .map((id) => userById(id)?.name || "")
        .join(" ");
      return [s.id, s.name, s.desc, s.platform, s.agentId, ownerName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    };

    const spaces = allSpaces.filter(matchSpace);
    const fmtDate = (iso) => {
      if (!iso) return "—";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    root.innerHTML = spaces.length
      ? `<div class="space-cards">
        ${spaces
          .map((s) => {
            const owner =
              userById(s.owners?.[0])?.name || s.owners?.[0] || "未指定";
            const updated = s.updatedAt || s.createdAt;
            const typeCount = Array.isArray(s.config?.extract?.types)
              ? s.config.extract.types.length
              : 0;
            return `
            <article class="panel space-card" data-space-id="${esc(s.id)}">
              <div class="space-card-top">
                <button type="button" class="space-card-main" data-open-space="${esc(s.id)}">
                  <h4>${esc(s.name)}</h4>
                  <div class="space-card-tags">
                    <span class="space-type-tag" title="记忆类型数量">${typeCount}种</span>
                  </div>
                  <p>${esc(s.desc)}</p>
                  <div class="space-card-fields">
                    <div class="space-card-field">空间ID：${esc(s.id)}</div>
                    <div class="space-card-field">来源平台：${esc(s.platform || "—")}</div>
                    <div class="space-card-field">负责人：${esc(owner)}</div>
                  </div>
                </button>
                <div class="space-card-more-wrap">
                  <button type="button" class="space-card-more" data-space-more="${esc(s.id)}" title="更多操作" aria-label="更多操作" aria-haspopup="menu" aria-expanded="false">···</button>
                  <div class="space-card-menu hidden" data-space-menu="${esc(s.id)}" role="menu">
                    <button type="button" role="menuitem" class="space-card-menu-item is-danger" data-space-del="${esc(s.id)}">删除空间</button>
                  </div>
                </div>
              </div>
              <div class="space-card-times">
                <span class="space-card-time" title="创建时间">创建 ${esc(fmtDate(s.createdAt))}</span>
                <span class="space-card-time" title="更新时间">更新 ${esc(fmtDate(updated))}</span>
              </div>
            </article>`;
          })
          .join("")}
      </div>`
      : `<div class="empty-state">${q ? "未找到匹配的记忆空间" : "暂无可用记忆空间"}</div>`;

    $$("[data-open-space]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.openSpace;
        state.spaceId = id;
        state.bankSpaceFilter = id;
        state.bankDetailUserId = null;
        state.bankSearch = "";
        state.page = "memories";
        renderChrome();
        renderPage();
      });
    });

    const closeAllSpaceMenus = () => {
      $$("[data-space-menu]", root).forEach((m) => m.classList.add("hidden"));
      $$("[data-space-more]", root).forEach((b) => b.setAttribute("aria-expanded", "false"));
    };

    $$("[data-space-more]", root).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.spaceMore;
        const menu = root.querySelector(`[data-space-menu="${id}"]`);
        const willOpen = menu?.classList.contains("hidden");
        closeAllSpaceMenus();
        if (willOpen && menu) {
          menu.classList.remove("hidden");
          btn.setAttribute("aria-expanded", "true");
        }
      });
    });

    $$("[data-space-del]", root).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAllSpaceMenus();
        confirmDeleteSpace(btn.dataset.spaceDel, root);
      });
    });

    if (state._closeSpaceMenus) {
      document.removeEventListener("click", state._closeSpaceMenus);
    }
    const onMenuDocClick = () => closeAllSpaceMenus();
    document.addEventListener("click", onMenuDocClick);
    state._closeSpaceMenus = onMenuDocClick;

    $("#btn-create-space")?.addEventListener("click", () => openCreateSpaceModal());
  }

  function confirmDeleteSpace(spaceId, root) {
    const space = spaceById(spaceId);
    if (!space) return;
    const host = $("#modal-host");
    if (!host) return;
    host.innerHTML = `
      <div class="modal-backdrop" id="del-space-modal">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-hd">
            <h3>删除记忆空间？</h3>
            <button type="button" class="icon-btn" id="modal-x" aria-label="关闭">×</button>
          </div>
          <div class="modal-bd">
            <p class="modal-desc">确定删除「${esc(space.name)}」吗？删除后该空间将从列表中移除。</p>
          </div>
          <div class="modal-ft">
            <button type="button" class="btn btn-primary" id="modal-confirm-del">确认</button>
            <button type="button" class="btn btn-secondary" id="modal-cancel">取消</button>
          </div>
        </div>
      </div>`;
    const close = () => {
      host.innerHTML = "";
    };
    $("#modal-x", host).onclick = close;
    $("#modal-cancel", host).onclick = close;
    $("#del-space-modal", host).addEventListener("click", (e) => {
      if (e.target.id === "del-space-modal") close();
    });
    $("#modal-confirm-del", host).onclick = () => {
      const idx = MEMORA_DATA.spaces.findIndex((s) => s.id === spaceId);
      if (idx >= 0) MEMORA_DATA.spaces.splice(idx, 1);
      if (state.spaceId === spaceId) {
        state.spaceId = accessibleSpaces()[0]?.id || null;
      }
      toast("已删除记忆空间");
      close();
      renderSpaces(root);
    };
  }

  function openCreateSpaceModal() {
    const host = $("#modal-host");
    const close = () => {
      host.innerHTML = "";
    };
    host.innerHTML = `
      <div class="modal-backdrop" id="space-modal">
        <div class="modal">
          <div class="modal-hd">
            <h3>创建智能体记忆空间</h3>
            <button type="button" class="icon-btn" id="modal-x" aria-label="关闭">×</button>
          </div>
          <div class="modal-bd form-grid">
            <label class="field"><span>空间名称</span>
              <input class="input" id="sp-name" placeholder="例如：客服助手" />
            </label>
            <label class="field"><span>记忆空间 ID</span>
              <input class="input" id="sp-id" placeholder="例如：sp-cs" />
            </label>
            <label class="field"><span>来源平台</span>
              <input class="input" id="sp-platform" placeholder="例如：智能客服" />
            </label>
            <label class="field"><span>智能体 ID</span>
              <input class="input" id="sp-agent" placeholder="例如：agent-cs-04" />
            </label>
            <label class="field"><span>描述</span>
              <textarea class="textarea" id="sp-desc" rows="3" placeholder="简要说明该空间的记忆用途"></textarea>
            </label>
          </div>
          <div class="modal-ft">
            <button type="button" class="btn btn-secondary" id="modal-cancel">取消</button>
            <button type="button" class="btn btn-primary" id="modal-save">创建</button>
          </div>
        </div>
      </div>`;
    $("#modal-x").onclick = close;
    $("#modal-cancel").onclick = close;
    $("#space-modal").addEventListener("click", (e) => {
      if (e.target.id === "space-modal") close();
    });
    $("#modal-save").onclick = () => {
      const name = $("#sp-name").value.trim();
      const customId = $("#sp-id").value.trim();
      const platform = $("#sp-platform").value.trim();
      const agentId = $("#sp-agent").value.trim();
      const desc = $("#sp-desc").value.trim();
      if (!name || !agentId) {
        toast("请填写空间名称与智能体 ID");
        return;
      }
      const id = customId || "sp-" + Date.now();
      if (MEMORA_DATA.spaces.some((s) => s.id === id)) {
        toast("记忆空间 ID 已存在");
        return;
      }
      const template = MEMORA_DATA.spaces[0];
      MEMORA_DATA.spaces.push({
        id,
        name,
        desc: desc || "新创建的智能体记忆空间",
        agentId,
        platform: platform || "未指定",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        owners: [state.user.id],
        midTermCount: 0,
        subscribers: [],
        config: JSON.parse(JSON.stringify(template.config)),
      });
      toast("已创建记忆空间");
      close();
      renderPage();
    };
  }

  function renderSpaceConfig(root) {
    const spaces = accessibleSpaces();
    const space = spaceById(state.spaceId) || spaces[0];
    if (!space) {
      setPageTitle("", "", "");
      root.innerHTML = `<div class="empty-state">暂无可用记忆空间</div>`;
      return;
    }
    state.spaceId = space.id;

    const buildContextBar = () => `
      <div class="cfg-context" id="cfg-context">
        <div class="cfg-context-tabs" id="config-tabs" role="tablist" aria-label="页面功能">
          <button type="button" role="tab" class="cfg-context-tab ${state.configTab === "extract" ? "active" : ""}" data-ctab="extract" aria-selected="${state.configTab === "extract"}">记忆抽取调试</button>
          <button type="button" role="tab" class="cfg-context-tab ${state.configTab === "retrieve" ? "active" : ""}" data-ctab="retrieve" aria-selected="${state.configTab === "retrieve"}">记忆检索调试</button>
          <button type="button" role="tab" class="cfg-context-tab ${state.configTab === "extract-engine" ? "active" : ""}" data-ctab="extract-engine" aria-selected="${state.configTab === "extract-engine"}">萃取引擎</button>
          <button type="button" role="tab" class="cfg-context-tab ${state.configTab === "retrieve-engine" ? "active" : ""}" data-ctab="retrieve-engine" aria-selected="${state.configTab === "retrieve-engine"}">检索引擎</button>
        </div>
      </div>`;

    setPageTitle("", buildContextBar(), "");

    const cfg = space.config;
    const opsLocked = !canManageOps(space.id);

    root.innerHTML = `
      <div class="config-shell ${isPlaygroundTab(state.configTab) ? "is-playground" : ""}" id="config-shell">
        <div class="config-body" id="config-body"></div>
      </div>`;

    const body = $("#config-body", root);
    const shell = $("#config-shell", root);

    const paint = () => {
      if (state.configTab === "debug" || state.configTab === "params" || state.configTab === "forget-engine" || state.configTab === "reflect-engine") state.configTab = "extract-engine";
      const pg = isPlaygroundTab(state.configTab);
      if (state.configTab === "retrieve") state.debugMode = "generate";
      else if (pg) state.debugMode = "extract";
      shell.classList.toggle("is-playground", pg);
      setPageTitle("", buildContextBar(), "");
      document.body.classList.add("page-has-cfg-context");
      bindBar();
      if (pg) {
        body.innerHTML = renderDebugPlayground(space);
        requestAnimationFrame(() => initDebugPlayground(space));
      } else {
        body.innerHTML = renderEngineTab(state.configTab, space, opsLocked);
      }
      bindConfigForms(body, space, opsLocked);
    };

    const bindBar = () => {
      $("#cfg-space-select")?.addEventListener("change", (e) => {
        state.spaceId = e.target.value;
        state.pgSessionIdx = 0;
        state.engineVersionId = "preset-current";
        destroyGraph();
        renderSpaceConfig(root);
      });
      $$("#config-tabs [data-ctab]").forEach((t) => {
        t.addEventListener("click", () => {
          if (state.configTab === t.dataset.ctab) return;
          // 离开参数页时落盘，避免未点保存导致调试仍用旧配置
          if (isEngineTab(state.configTab)) saveActiveEngine(body, space);
          const next = t.dataset.ctab;
          if (isPlaygroundTab(state.configTab) && isPlaygroundTab(next) && state.configTab !== next) {
            state.pgSessionIdx = 0;
            state.recallTurns = null;
            state.recallGraphHighlight = null;
            state.outView = "output";
          }
          state.configTab = next;
          if (next === "extract") state.debugMode = "extract";
          if (next === "retrieve") state.debugMode = "generate";
          if (next !== "retrieve") state.recallGraphHighlight = null;
          destroyGraph();
          paint();
        });
      });
    };

    paint();
  }

  function normalizeExtractTypes(types) {
    if (!Array.isArray(types) || !types.length) {
      return DEFAULT_MEMORY_TYPES.map((t) => ({ ...t }));
    }
    return types.map((t) =>
      typeof t === "string"
        ? { name: t, description: "" }
        : { name: t.name || "", description: t.description || "" }
    );
  }

  function isPlaygroundTab(tab) {
    return tab === "extract" || tab === "retrieve";
  }

  function isEngineTab(tab) {
    return tab === "extract-engine" || tab === "retrieve-engine" || tab === "forget-engine" || tab === "reflect-engine";
  }

  function ensureReflect(cfg) {
    if (!cfg.reflect) {
      cfg.reflect = {
        enabled: true,
        model: "reflect-pro",
        interval: 12,
        depth: 2,
        prompt: "归纳近期对话中的稳定偏好、长期计划与反复出现的事实，写入认知记忆。",
      };
    }
    return cfg.reflect;
  }

  function engineSaveBtn() {
    return `<div class="params-card-ft">
      <button type="button" class="btn btn-secondary" id="engine-save-as">另存为版本</button>
      <button type="button" class="btn btn-primary" id="save-engine">保存</button>
    </div>`;
  }

  function renderEngineVersionBar(space, locked) {
    const presets = ensureParamPresets(space);
    const ver = activeEngineVersion(space);
    const opts = presets
      .map((p) => {
        const stamp = formatVersionTime(p.savedAt);
        const label = stamp && !p.builtin ? `${p.name} · ${stamp}` : p.name;
        return `<option value="${esc(p.id)}" ${p.id === ver?.id ? "selected" : ""}>${esc(label)}</option>`;
      })
      .join("");
    return `
      <div class="params-ver-bar">
        <label class="params-ver-pick" for="engine-version-select">
          <span>参数版本</span>
          <select id="engine-version-select" class="select" ${locked ? "disabled" : ""} title="保存的参数版本可在调试时选用">${opts}</select>
        </label>
        ${
          locked || ver?.builtin
            ? ""
            : `<button type="button" class="btn btn-secondary btn-sm" id="engine-version-del" title="删除此版本">删除</button>`
        }
        ${ver?.id === "preset-current" ? "" : `<button type="button" class="btn btn-secondary btn-sm" id="engine-version-apply" ${locked ? "disabled" : ""}>设为当前</button>`}
      </div>`;
  }

  function renderEngineTab(tab, space, locked) {
    const meta = {
      "extract-engine": ["萃取引擎", "配置提取提示词、模型与记忆类型"],
      "retrieve-engine": ["检索引擎", "配置召回数量、相似度阈值与多路检索权重"],
      "forget-engine": ["遗忘引擎", "控制记忆衰减速度与自动淘汰阈值"],
      "reflect-engine": ["反思引擎", "周期性归纳对话，沉淀更高层认知记忆"],
    }[tab] || ["引擎", ""];
    const ver = activeEngineVersion(space);
    const cfg = ver?.config || space.config;
    ensureReflect(cfg);
    ensureRetrieve(cfg);
    const body =
      tab === "retrieve-engine"
        ? renderRetrieveForm(cfg, locked)
        : tab === "forget-engine"
          ? renderForgetForm(cfg, locked)
          : tab === "reflect-engine"
            ? renderReflectForm(cfg, locked)
            : renderExtractForm(cfg, locked);
    return `
      <div class="params-grid params-grid-single">
        ${locked ? `<p class="badge badge-warn">当前账号仅可查看，无空间运维权限</p>` : ""}
        <section class="params-card">
          <header class="params-card-hd params-card-hd-engine">
            <div class="params-card-hd-text">
              <h3>${meta[0]}</h3>
              <p>${meta[1]}</p>
            </div>
            ${renderEngineVersionBar(space, locked)}
          </header>
          ${body}
          ${locked ? "" : engineSaveBtn()}
        </section>
      </div>`;
  }

  function renderForgetForm(cfg, locked) {
    const g = cfg.governance || { decayWeight: 0.85, forgetThreshold: 0.15 };
    const dis = locked ? "disabled" : "";
    return `
      <div class="form-grid cols-2">
        <label class="field"><span>衰减权重 <span id="gov-decay-val">${g.decayWeight}</span></span>
          <input type="range" id="gov-decay" min="0.5" max="1" step="0.01" value="${g.decayWeight}" ${dis} />
        </label>
        <label class="field"><span>遗忘阈值 <span id="gov-forget-val">${g.forgetThreshold}</span></span>
          <input type="range" id="gov-forget" min="0" max="0.5" step="0.01" value="${g.forgetThreshold}" ${dis} />
        </label>
      </div>
      <p style="margin:12px 0 0;font-size:0.85rem;color:var(--ink-soft)">当记忆综合分数低于遗忘阈值时，将进入待归档/遗忘队列。</p>`;
  }

  function renderReflectForm(cfg, locked) {
    const r = ensureReflect(cfg);
    const dis = locked ? "disabled" : "";
    const prompt = r.prompt || "";
    return `
      <div class="form-grid params-form params-form-tight">
        <label class="engine-switch">
          <span>启用反思引擎</span>
          <input type="checkbox" id="rf-enabled" ${r.enabled ? "checked" : ""} ${dis} />
          <em>${r.enabled ? "已启用" : "已关闭"}</em>
        </label>
        <label class="field"><span>反思模型</span>
          <select class="select" id="rf-model" ${dis}>
            ${["reflect-lite", "reflect-pro"]
              .map((m) => `<option ${m === r.model ? "selected" : ""} value="${m}">${m}</option>`)
              .join("")}
          </select>
        </label>
        <label class="field"><span>反思提示词</span>
          <div class="textarea-wrap">
            <textarea class="textarea" rows="4" id="rf-prompt" maxlength="2000" ${dis}>${esc(prompt)}</textarea>
            <span class="field-count">${prompt.length}/2000</span>
          </div>
        </label>
        <div class="form-grid cols-2">
          <label class="field"><span>反思间隔（小时） <span id="rf-interval-val">${r.interval}</span></span>
            <input type="range" id="rf-interval" min="1" max="72" step="1" value="${r.interval}" ${dis} />
          </label>
          <label class="field"><span>归纳深度 <span id="rf-depth-val">${r.depth}</span></span>
            <input type="range" id="rf-depth" min="1" max="5" step="1" value="${r.depth}" ${dis} />
          </label>
        </div>
      </div>`;
  }

  function writeExtractToConfig(body, cfg) {
    if (!$("#ex-prompt", body) || !cfg?.extract) return false;
    cfg.extract.prompt = $("#ex-prompt", body).value;
    cfg.extract.model = $("#ex-model", body).value;
    cfg.extract.types = collectExtractTypes(body);
    return true;
  }

  function writeRetrieveToConfig(body, cfg) {
    if (!$("#rt-topk", body) || !cfg?.retrieve) return false;
    const r = ensureRetrieve(cfg);
    const promptEl = $("#rt-prompt", body);
    if (promptEl) r.prompt = promptEl.value;
    const rewriteEl = $("#rt-rewrite", body);
    if (rewriteEl) r.rewritePrompt = rewriteEl.value;
    if ($("#rt-enabled", body)) r.enabled = !!$("#rt-enabled", body).checked;
    r.topK = Number($("#rt-topk", body).value);
    const simEl = $("#rt-sim", body);
    if (simEl) r.similarity = Number(simEl.value);
    const kwEl = $("#rt-kw", body);
    if (kwEl) r.keywordTopK = Number(kwEl.value);
    const vecEl = $("#rt-vec", body);
    if (vecEl) r.vectorTopK = Number(vecEl.value);
    const weightEl = $("#rt-vec-weight", body);
    if (weightEl) r.vectorWeight = Number(weightEl.value);
    syncHybridWeights(r);
    const rerankOn = !!$("#rt-rerank-on", body)?.checked;
    r.rerankEnabled = rerankOn;
    const rerankEl = $("#rt-rerank", body);
    r.rerankModel = rerankOn ? rerankEl?.value || "rerank-lite" : "rerank-off";
    return true;
  }

  function writeGovToConfig(body, cfg) {
    if (!$("#gov-decay", body)) return false;
    if (!cfg.governance) cfg.governance = {};
    cfg.governance.decayWeight = Number($("#gov-decay", body).value);
    cfg.governance.forgetThreshold = Number($("#gov-forget", body).value);
    return true;
  }

  function writeReflectToConfig(body, cfg) {
    if (!$("#rf-prompt", body)) return false;
    const r = ensureReflect(cfg);
    r.enabled = !!$("#rf-enabled", body)?.checked;
    r.model = $("#rf-model", body)?.value || r.model;
    r.prompt = $("#rf-prompt", body).value;
    r.interval = Number($("#rf-interval", body)?.value || r.interval);
    r.depth = Number($("#rf-depth", body)?.value || r.depth);
    return true;
  }

  function saveActiveEngine(body, space) {
    const ver = activeEngineVersion(space);
    if (!ver?.config) return;
    if (state.configTab === "extract-engine") writeExtractToConfig(body, ver.config);
    else if (state.configTab === "retrieve-engine") writeRetrieveToConfig(body, ver.config);
    else if (state.configTab === "forget-engine") writeGovToConfig(body, ver.config);
    else if (state.configTab === "reflect-engine") writeReflectToConfig(body, ver.config);
    ver.savedAt = new Date().toISOString();
    if (ver.id === "preset-current") {
      space.config = cloneConfig(ver.config);
    }
  }

  function saveEngineAsVersion(body, space) {
    saveActiveEngine(body, space);
    const ver = activeEngineVersion(space);
    const defaultName = `参数版本 ${new Date().toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}`;
    const name = window.prompt("输入版本名称，保存后可在调试参数中选用", defaultName);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast("名称不能为空");
      return;
    }
    const list = ensureParamPresets(space);
    const id = `preset-user-${Date.now()}`;
    list.push({
      id,
      name: trimmed,
      desc: "自定义保存的参数版本",
      builtin: false,
      savedAt: new Date().toISOString(),
      config: cloneConfig(ver.config),
    });
    state.engineVersionId = id;
    toast("已另存为参数版本");
    renderSpaceConfig($("#content"));
  }

  function renderExtractTypesList(types, locked) {
    const dis = locked ? "disabled" : "";
    return `
      <div class="type-cards" id="ex-type-list">
        <div class="type-cards-hd">
          <h4>记忆类型</h4>
        </div>
        <p class="type-cards-hint">每条记忆与字段标签绑定，可增删自定义类型，带 * 为必选类型。</p>
        ${types
          .map(
            (t, i) => `
          <div class="type-card" data-type-idx="${i}">
            <div class="type-card-body">
              <input class="input cat-name" data-type-name value="${esc(t.name)}" placeholder="类型名称" ${dis} />
              <input class="input cat-desc" data-type-desc value="${esc(t.description)}" placeholder="类型说明" ${dis} />
            </div>
            ${
              locked
                ? ""
                : `<button type="button" class="cat-del" data-type-del title="删除" aria-label="删除">×</button>`
            }
          </div>`
          )
          .join("")}
        ${
          locked
            ? ""
            : `<div class="cat-add-row type-card-add hidden">
                <input class="input cat-name" id="ex-type-name-new" placeholder="类型名称" />
                <input class="input cat-desc" id="ex-type-desc-new" placeholder="类型说明" />
              </div>
              <button type="button" class="type-add-link" id="ex-type-add">+ 添加自定义类型</button>`
        }
      </div>`;
  }

  function renderExtractForm(cfg, locked) {
    const dis = locked ? "disabled" : "";
    const types = normalizeExtractTypes(cfg.extract.types);
    const prompt = cfg.extract.prompt || "";
    return `
      <div class="pe-form">
        <label class="field pe-prompt-block">
          <span>记忆提取提示词</span>
          <div class="textarea-wrap">
            <textarea class="textarea" rows="4" id="ex-prompt" maxlength="2000" ${dis}>${esc(prompt)}</textarea>
            <span class="field-count">${prompt.length}/2000</span>
          </div>
        </label>
        ${peRow(
          "记忆提取模型",
          "选择抽取模型，高精度模型更准但更慢",
          `<div class="select-with-ico pe-select">
            <span class="select-ico" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
            </span>
            <select class="select" id="ex-model" ${dis}>
              ${["mem-extract-v1", "mem-extract-v2", "mem-extract-pro"]
                .map((m) => `<option ${m === cfg.extract.model ? "selected" : ""}>${m}</option>`)
                .join("")}
            </select>
          </div>`
        )}
        <div class="pe-types-block">${renderExtractTypesList(types, locked)}</div>
      </div>`;
  }

  function ensureRetrieve(cfg) {
    if (!cfg.retrieve) cfg.retrieve = {};
    const r = cfg.retrieve;
    if (r.enabled == null) r.enabled = true;
    if (!r.rewritePrompt) {
      r.rewritePrompt =
        "改写用户问题为清晰检索意图：补全指代、归一实体别名（如 MSG→麦迪逊广场花园），保留关键约束与偏好。";
    }
    if (r.vectorWeight == null) {
      const vec = (r.methods || []).find((m) => m.id === "vector");
      r.vectorWeight = Math.round(Number(vec?.weight ?? 0.5) * 100);
    }
    return r;
  }

  function syncHybridWeights(r) {
    const methods = r.methods || [];
    const vw = Math.min(100, Math.max(0, Number(r.vectorWeight) || 0)) / 100;
    const graph = methods.find((m) => m.id === "graph");
    const graphW = graph?.enabled ? Number(graph.weight) || 0 : 0;
    const rest = Math.max(0, 1 - vw - graphW);
    methods.forEach((m) => {
      if (m.id === "vector") {
        m.weight = Number(vw.toFixed(2));
        m.enabled = true;
      } else if (m.id === "keyword") {
        m.weight = Number(rest.toFixed(2));
        m.enabled = true;
      }
    });
  }

  function peRow(title, hint, ctrl, extraClass = "") {
    return `
      <div class="pe-row ${extraClass}">
        <div class="pe-row-meta">
          <strong>${title}</strong>
          ${hint ? `<span>${hint}</span>` : ""}
        </div>
        <div class="pe-row-ctrl">${ctrl}</div>
      </div>`;
  }

  function peSlider(id, valLabelId, val, min, max, step, locked, format) {
    const dis = locked ? "disabled" : "";
    const shown = format === "pct" ? `${Math.round(val)}%` : format === "sim" ? Number(val).toFixed(2) : String(val);
    return `
      <div class="pe-slider">
        <b id="${valLabelId}">${shown}</b>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" ${dis} />
      </div>`;
  }

  function methodOn(retrieve, id) {
    return !!retrieve.methods?.find((m) => m.id === id)?.enabled;
  }

  function syncMethodDependentFields(body) {
    const kwOn = !!body.querySelector('[data-method="keyword"]')?.checked;
    const vecOn = !!body.querySelector('[data-method="vector"]')?.checked;
    body.querySelector("#rt-kw-deps")?.classList.toggle("hidden", !kwOn);
    body.querySelector("#rt-vec-deps")?.classList.toggle("hidden", !vecOn);
  }

  function syncRerankFields(body) {
    const on = !!body.querySelector("#rt-rerank-on")?.checked;
    body.querySelector("#rt-rerank-deps")?.classList.toggle("hidden", !on);
  }

  function renderRetrieveForm(cfg, locked) {
    const r = ensureRetrieve(cfg);
    const dis = locked ? "disabled" : "";
    const prompt = r.prompt || "";
    const rewrite = r.rewritePrompt || "";
    const rerankOn = r.rerankEnabled !== false && r.rerankModel !== "rerank-off";
    return `
      <div class="pe-form">
        <label class="field pe-prompt-block">
          <span>问题改写提示词</span>
          <div class="textarea-wrap">
            <textarea class="textarea" rows="3" id="rt-rewrite" maxlength="2000" ${dis}>${esc(rewrite)}</textarea>
            <span class="field-count">${rewrite.length}/2000</span>
          </div>
        </label>
        <label class="field pe-prompt-block">
          <span>记忆检索提示词</span>
          <div class="textarea-wrap">
            <textarea class="textarea" rows="3" id="rt-prompt" maxlength="2000" ${dis}>${esc(prompt)}</textarea>
            <span class="field-count" data-rt-count>${prompt.length}/2000</span>
          </div>
        </label>
        ${peRow(
          "召回 Top-K",
          "每次检索最终返回的记忆条数",
          peSlider("rt-topk", "rt-topk-val", r.topK, 1, 20, 1, locked)
        )}
        ${peRow(
          "相似度阈值",
          "低于该值的记忆不进入候选结果",
          peSlider("rt-sim", "rt-sim-val", r.similarity, 0, 1, 0.01, locked, "sim")
        )}
        ${peRow(
          "混合检索权重",
          "向量检索在混合召回中的占比，其余分配给关键词",
          peSlider("rt-vec-weight", "rt-vec-weight-val", r.vectorWeight, 0, 100, 1, locked, "pct")
        )}
        ${peRow(
          "关键词召回数量",
          "关键词检索阶段返回的候选条数",
          `<input type="number" class="input pe-num" id="rt-kw" value="${r.keywordTopK}" min="1" max="50" ${dis} />`
        )}
        ${peRow(
          "向量召回数量",
          "向量检索阶段返回的候选条数",
          `<input type="number" class="input pe-num" id="rt-vec" value="${r.vectorTopK}" min="1" max="50" ${dis} />`
        )}
        ${peRow(
          "启用重排",
          "对融合候选再排序，提高最终相关性",
          `<label class="pe-switch">
            <input type="checkbox" id="rt-rerank-on" ${rerankOn ? "checked" : ""} ${dis} />
            <em id="rt-rerank-lab">${rerankOn ? "已启用" : "已关闭"}</em>
          </label>`,
          "is-switch"
        )}
        <div class="pe-row ${rerankOn ? "" : "hidden"}" id="rt-rerank-deps">
          <div class="pe-row-meta">
            <strong>重排模型</strong>
            <span>选择轻量或高精度重排策略</span>
          </div>
          <div class="pe-row-ctrl">
            <select class="select pe-select" id="rt-rerank" ${dis}>
              ${["rerank-lite", "rerank-pro"]
                .map((m) => `<option ${m === (r.rerankModel === "rerank-off" ? "rerank-lite" : r.rerankModel) ? "selected" : ""}>${m}</option>`)
                .join("")}
            </select>
          </div>
        </div>
      </div>`;
  }

  function renderGovForm(cfg, locked) {
    const g = cfg.governance;
    const dis = locked ? "disabled" : "";
    return `
      <div class="form-grid cols-2">
        <label class="field"><span>衰减权重 <span id="gov-decay-val">${g.decayWeight}</span></span>
          <input type="range" id="gov-decay" min="0.5" max="1" step="0.01" value="${g.decayWeight}" ${dis} />
        </label>
        <label class="field"><span>遗忘阈值 <span id="gov-forget-val">${g.forgetThreshold}</span></span>
          <input type="range" id="gov-forget" min="0" max="0.5" step="0.01" value="${g.forgetThreshold}" ${dis} />
        </label>
      </div>
      <p style="margin:12px 0 0;font-size:0.85rem;color:var(--ink-soft)">当记忆综合分数低于遗忘阈值时，将进入待归档/遗忘队列（演示静态）。</p>`;
  }

  function sessionTraceId(session) {
    if (session?.traceId) return session.traceId;
    const raw = String(session?.id || "sess").replace(/\D/g, "").slice(-5) || "90312";
    return `TD-${raw.padStart(5, "0")}`;
  }

  function formatLastRunClock(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function renderDebugPlayground(space) {
    if (state.compareMode) {
      return renderCompareModeView(space);
    }
    const isExtract = state.debugMode !== "generate";
    ensurePgSessions();
    const sessions = state.pgSessions[currentModeKey()];
    const curSess = sessions[state.pgSessionIdx] || sessions[0];
    const sessName = sessionListName(curSess, state.pgSessionIdx);
    const traceId = sessionTraceId(curSess);
    const engineVer = space?.config?.extract?.model || "v2.4.1";
    const presets = ensureParamPresets(space);
    const activePreset = activeDebugPreset(space);
    const outView = state.outView === "graph" ? "graph" : "output";
    const lastAt = state.lastRunAt || curSess?.lastRunAt;
    const lastMs = state.lastRunMs ?? curSess?.lastRunMs ?? null;
    const typeOpts = ENTITY_TYPE_META.map(
      (t) => `
      <button type="button" class="type-opt" data-type="${esc(t.id)}">
        <i class="type-mark circle" style="background:${t.color}"></i>
        ${esc(t.id)}
      </button>`
    ).join("");
    const presetOptions = presets
      .map(
        (p) =>
          `<option value="${esc(p.id)}" ${p.id === state.debugParamId ? "selected" : ""}>${esc(p.name)}</option>`
      )
      .join("");
    return `
      <div class="playground ${isExtract ? "is-extract-layout" : "is-recall-layout"}">
        <div class="pg-split ${isExtract ? "pg-split-3" : "pg-split-stage"} ${state.sessionRailCollapsed ? "is-rail-collapsed" : ""}">
          ${isExtract ? renderSessionRail(sessions, state.pgSessionIdx) : ""}
          <div class="pg-session-stage">
          <div class="pg-stage-main ${outView === "graph" ? "is-graph-focus" : ""}">
            ${
              isExtract
                ? `<button type="button" class="pg-rail-handle" id="pg-rail-toggle" title="${state.sessionRailCollapsed ? "展开会话列表" : "收起会话列表"}" aria-label="${state.sessionRailCollapsed ? "展开会话列表" : "收起会话列表"}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="${state.sessionRailCollapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}"/></svg>
                  </button>`
                : ""
            }
          <div class="pg-col pg-col-chat">
            <div class="pg-chat-session-hd">
              <div class="pg-chat-session-main">
                <h3 class="pg-chat-session-name" id="pg-chat-session-name" title="${esc(sessName)}">${esc(sessName)}</h3>
                <div class="pg-chat-session-meta">
                  <span>Trace ID <code>#${esc(traceId)}</code></span>
                  <span>引擎 ${esc(engineVer)}</span>
                  <span class="pg-chat-engine-on">检索引擎已启用</span>
                </div>
              </div>
              <div class="pg-chat-session-actions">
                <div class="seg-toggle" id="msg-view-toggle">
                  <button type="button" data-msgview="editor" class="${state.msgView === "editor" ? "active" : ""}">Editor</button>
                  <button type="button" data-msgview="json" class="${state.msgView === "json" ? "active" : ""}">JSON</button>
                </div>
              </div>
            </div>
            <div class="msg-list ${state.msgView === "json" ? "hidden" : ""}" id="chat-stream"></div>
            <textarea class="pg-json ${state.msgView === "json" ? "" : "hidden"}" id="chat-json" spellcheck="false"></textarea>
            <div class="pg-add-msg-row">
              <button type="button" class="msg-add-link" id="pg-add-msg">+ 添加消息</button>
            </div>
            <div class="pg-debug-dock" id="pg-debug-dock">
              <label class="pg-param-pick pg-param-dock" for="pg-param-select">
                <span class="pg-param-label">调试参数</span>
                <select id="pg-param-select" class="select pg-param-select" title="${esc(presetSummary(activePreset))}">
                  ${presetOptions}
                </select>
              </label>
              <div class="pg-debug-actions">
                <button type="button" class="pg-dock-btn pg-dock-primary" id="pg-rerun-round">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12a7 7 0 0112.2-4.9M19 12a7 7 0 01-12.2 4.9"/><path d="M17 3v5h-5M7 21v-5h5"/></svg>
                  重跑本轮
                </button>
                <button type="button" class="pg-dock-btn" id="pg-step-run">单步执行</button>
                <button type="button" class="pg-dock-btn" id="pg-snapshot">生成快照</button>
              </div>
              <div class="pg-dock-meta">
                <span>上次运行 ${esc(formatLastRunClock(lastAt))}</span>
                <span>总耗时 ${lastMs != null ? `${lastMs}ms` : "—"}</span>
              </div>
            </div>
          </div>

          <div class="pg-col pg-col-out">
            <div class="pg-col-hd pg-out-hd">
              <div class="pg-out-tabs" id="pg-out-tabs">
                <button type="button" data-out="output" class="${outView === "output" ? "active" : ""}">${isExtract ? "调试结果" : "输出结果"}</button>
                <button type="button" data-out="graph" class="${outView === "graph" ? "active" : ""}">图谱</button>
              </div>
              <div class="pg-out-actions">
                <button type="button" class="pg-out-clear-btn ${outView === "graph" ? "" : "hidden"}" id="pg-graph-fs-btn" title="全屏查看图谱">
                  <span class="pg-fs-ico" aria-hidden="true">⛶</span> 全屏
                </button>
              </div>
            </div>
            <div class="pg-stale-bar ${state.paramsDirty ? "" : "hidden"}" id="pg-stale-bar">
              <span class="pg-stale-msg">
                <i class="pg-stale-dot" aria-hidden="true"></i>
                配置已修改，当前结果可能已过期
              </span>
              <button type="button" class="btn btn-primary pg-retest-btn" id="pg-retest">重新测试</button>
            </div>
            <div class="pg-out-body ${outView === "graph" ? "hidden" : ""}" id="pg-output"></div>
            <div class="pg-out-body ${outView === "graph" ? "" : "hidden"}" id="pg-graph-wrap">
              <div class="pg-graph-pane">
                <div class="pg-graph-body">
                  <div class="graph-canvas-wrap">
                    <canvas id="kg-canvas"></canvas>
                  </div>
                  <aside class="graph-detail-panel hidden" id="graph-detail-panel" aria-hidden="true"></aside>
                </div>
                <div class="graph-legend">
                  ${ENTITY_TYPE_META.map(
                    (t) =>
                      `<span><i class="type-mark circle" style="background:${t.color}"></i>${esc(t.id)}</span>`
                  ).join("")}
                </div>
                <div class="graph-toolbar hidden">
                  <input type="search" id="graph-search" class="input" placeholder="搜索图谱…" />
                  <div class="type-filter" id="entity-filter">
                    <button type="button" class="type-filter-btn" id="entity-filter-btn">
                      <i class="type-mark circle" style="background:#94a3b8"></i>
                      <span id="entity-filter-label">全部类型</span>
                    </button>
                    <div class="type-filter-menu hidden" id="entity-filter-menu">
                      <button type="button" class="type-opt active" data-type="all">全部类型</button>
                      ${typeOpts}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
          ${renderDebugLogModule()}
          </div>
        </div>
        <div class="pg-graph-fs hidden" id="pg-graph-fs" aria-hidden="true">
          <div class="pg-graph-fs-hd">
            <button type="button" class="pg-graph-fs-back" id="pg-graph-fs-back">← 返回</button>
            <div class="pg-graph-fs-session" id="pg-graph-fs-session">当前会话</div>
            <button type="button" class="pg-out-clear-btn" id="pg-graph-fs-exit">
              <span class="pg-fs-ico" aria-hidden="true">⛶</span> 退出全屏
            </button>
          </div>
          <div class="pg-graph-fs-stage" id="pg-graph-fs-stage"></div>
          <div class="pg-graph-fs-hint">滚轮缩放 · 拖拽平移 · 拖动节点 · 双击展开/收起 · Shift 框选 · 点击空白取消选中</div>
        </div>
      </div>`;
  }

  function playgroundUserId() {
    return state.selectedUserId || "u-sarah";
  }

  function getExtractedMemories(spaceId, userId) {
    return MEMORA_DATA.memories.mid
      .filter((m) => m.userId === userId && m.spaceId === spaceId)
      .map((m) => ({
        content: m.content,
        type: m.type,
        source: m.source,
        id: m.id,
        extractAt: m.createdAt,
      }));
  }

  function getRetrievedMemories() {
    return (
      MEMORA_DATA.debugScripts.retrieve.find((m) => m.context)?.context || []
    ).map((c) => ({
      ...c,
      extractAt: c.extractAt || c.createdAt || "2025-10-17T05:56:00",
    }));
  }

  function tokenizeForGraph(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^\u4e00-\u9fff\w]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  }

  function mapMemoriesToGraphHighlight(memories, graph) {
    const nodes = graph?.nodes || [];
    const edges = graph?.edges || [];
    if (!nodes.length || !memories?.length) return [];
    const ids = new Set();
    const hints = [
      {
        re: /近台|座位|舞台|偏好.*麦迪逊|靠近舞台|麦迪逊广场/,
        nodes: ["n-sarah", "n-seat", "n-msg"],
        edges: ["e2", "e6"],
      },
      {
        re: /Taylor|Swift|巡演|演唱会|计划参加|纽约场|MSG|麦迪逊/,
        nodes: ["n-sarah", "n-swift", "n-msg"],
        edges: ["e1", "e3"],
      },
      {
        re: /布鲁克林|地铁|交通|路线|偏好地铁/,
        nodes: ["n-sarah", "n-brooklyn", "n-subway", "n-msg"],
        edges: ["e4", "e5"],
      },
    ];
    const nodeSet = new Set(nodes.map((n) => n.id));
    const edgeSet = new Set(edges.map((e) => e.id));
    memories.forEach((m) => {
      const content = `${m.content || ""} ${m.type || ""}`;
      hints.forEach((h) => {
        if (!h.re.test(content)) return;
        h.nodes.forEach((id) => nodeSet.has(id) && ids.add(id));
        h.edges.forEach((id) => edgeSet.has(id) && ids.add(id));
      });
      const tokens = tokenizeForGraph(content);
      if (!tokens.length) return;
      nodes.forEach((n) => {
        const bag = tokenizeForGraph(
          [n.label, n.summary, n.type, ...(n.props?.keywords || []), ...(n.labels || [])].join(" ")
        );
        if (tokens.some((t) => bag.some((b) => b.includes(t) || t.includes(b)))) ids.add(n.id);
      });
      edges.forEach((e) => {
        const bag = tokenizeForGraph(`${e.label || ""} ${e.description || ""}`);
        if (!tokens.some((t) => bag.some((b) => b.includes(t) || t.includes(b)))) return;
        ids.add(e.id);
        if (nodeSet.has(e.from)) ids.add(e.from);
        if (nodeSet.has(e.to)) ids.add(e.to);
      });
    });
    return [...ids];
  }

  function latestRecallMemories() {
    if (state.debugMode !== "generate") return [];
    const turns = state.recallTurns;
    if (Array.isArray(turns) && turns.length) {
      const t = turns.find((x) => x.open) || turns[turns.length - 1];
      if (t?.memories?.length) return t.memories;
    }
    const sess = currentSession();
    const asst = [...(sess?.messages || [])]
      .reverse()
      .find((m) => m.role === "assistant" && Array.isArray(m.context) && m.context.length);
    if (asst?.context?.length) return asst.context;
    if (Array.isArray(sess?.memories) && sess.memories.length) return sess.memories;
    return getRetrievedMemories();
  }

  function syncRecallGraphBanner() {
    const wrap = document.querySelector("#pg-graph-wrap .graph-canvas-wrap");
    if (!wrap) return;
    let el = wrap.querySelector(".kg-recall-banner");
    const hi = state.recallGraphHighlight;
    if (state.debugMode !== "generate" || !hi?.ids?.length) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.className = "kg-recall-banner";
      wrap.appendChild(el);
    }
    const nodeN = hi.ids.filter((id) => !/^e\d/i.test(String(id)) && !String(id).startsWith("rel-")).length;
    el.innerHTML = `
      <div class="kg-recall-banner-text">
        <strong>检索命中</strong>
        <span>${hi.memCount} 条记忆 · 高亮 ${nodeN} 个实体</span>
      </div>
      <button type="button" class="kg-recall-clear" title="清除高亮" aria-label="清除高亮">×</button>`;
    el.querySelector(".kg-recall-clear")?.addEventListener("click", (e) => {
      e.stopPropagation();
      clearRecallGraphHighlight();
    });
  }

  function clearRecallGraphHighlight() {
    state.recallGraphHighlight = null;
    state.graphInstance?.setHighlight([]);
    syncRecallGraphBanner();
  }

  function applyRecallGraphHighlight(memories, { pulse = true } = {}) {
    const space = spaceById(state.spaceId);
    if (!space) return [];
    const graph = getGraph(playgroundUserId(), space.id);
    const ids = mapMemoriesToGraphHighlight(memories, graph);
    state.recallGraphHighlight = {
      ids,
      memCount: (memories || []).length,
      query: null,
    };
    const g = state.graphInstance;
    if (g) {
      if (pulse && ids.length) g.pulseNew(ids);
      else g.setHighlight(ids);
    }
    syncRecallGraphBanner();
    return ids;
  }

  function syncRecallHighlightToGraph({ pulse = false } = {}) {
    if (state.debugMode !== "generate") {
      syncRecallGraphBanner();
      return;
    }
    const mems = latestRecallMemories();
    if (!mems.length) {
      syncRecallGraphBanner();
      return;
    }
    if (state.recallGraphHighlight?.ids?.length && state.graphInstance) {
      if (pulse) state.graphInstance.pulseNew(state.recallGraphHighlight.ids);
      else state.graphInstance.setHighlight(state.recallGraphHighlight.ids);
      syncRecallGraphBanner();
      return;
    }
    applyRecallGraphHighlight(mems, { pulse });
  }

  function memTypeClass(type) {
    const map = {
      对话回复风格: "type-style",
      生活事件: "type-event",
      偏好忌讳: "type-pref",
      偏好需求: "type-pref",
      任务计划: "type-plan",
      偏好: "type-pref",
      计划: "type-plan",
      事实: "type-fact",
      身份画像: "type-profile",
      稳定偏好: "type-stable",
      制度: "type-policy",
      实体关联: "type-entity",
    };
    return map[type] || "type-default";
  }

  function sessionDisplayTitle(session, index) {
    return sessionTitle(session) || sessionName(session, index);
  }

  function sessionMemories(session) {
    if (Array.isArray(session?.memories)) return session.memories;
    return [];
  }

  function sessionLatestMemTime(session) {
    const mems = sessionMemories(session);
    if (!mems.length) return session?.startedAt || "";
    return mems.reduce((latest, m) => {
      const t = m.extractAt || m.createdAt || "";
      return t > latest ? t : latest;
    }, "");
  }

  function defaultExtractMemories() {
    return [
      {
        content: "Sarah 偏好麦迪逊广场花园靠近舞台的座位",
        type: "偏好",
        extractAt: "2025-10-17T05:56:00",
      },
      {
        content: "计划参加 Taylor Swift 巡演纽约场",
        type: "计划",
        extractAt: "2025-10-17T05:50:00",
      },
      {
        content: "查询过从布鲁克林到 MSG 的地铁路线",
        type: "事实",
        extractAt: "2025-10-17T06:02:00",
      },
    ];
  }

  function renderMemoryCard(m) {
    const type = m.type || "—";
    const short = shortMemType(type);
    const roundLabel = m.roundLabel || "";
    return `
      <button type="button" class="mem-result ${memTypeClass(type)}" data-mem-id="${esc(m.id || "")}">
        <div class="mem-main">
          <div class="mem-head-row">
            ${roundLabel ? `<span class="mem-round-badge">${esc(roundLabel)}</span>` : ""}
            <span class="mem-type-tag ${memTypeClass(type)}">${esc(short)}</span>
          </div>
          <p class="mem-text">${esc(m.content)}</p>
          <div class="mem-foot">
            <span class="mem-time">${esc(fmtStamp(m.extractAt || m.createdAt, true))}</span>
          </div>
        </div>
      </button>`;
  }

  function collectExtractMemoryPool() {
    const sessions = ensurePgSessions().extract || [];
    const pool = [];
    sessions.forEach((s, i) => {
      let mems = Array.isArray(s.memories) ? s.memories : [];
      if (!mems.length && s.memories == null && i === 0) mems = defaultExtractMemories();
      const msgs = s.messages || [];
      const sessionLabel = sessionListName(s, i);
      mems.forEach((m) => {
        pool.push({
          ...m,
          sessionLabel,
          roundLabel: memoryRoundLabel(msgs, m),
          sourceItem: memorySourceItem(msgs, m),
        });
      });
    });
    return pool;
  }

  function memorySourceItem(msgs, mem) {
    const indexed = (msgs || []).map((m, idx) => ({ ...m, idx }));
    const users = indexed.filter((m) => m.role === "user" && m.text?.trim());
    const content = mem.content || "";
    const keys = ["舞台", "座位", "地铁", "布鲁克林", "故宫", "长城", "餐厅", "健身", "东京", "浅草", "工作", "汇报"];
    let best = users[0];
    for (const u of users) {
      if (keys.some((k) => content.includes(k) && u.text.includes(k))) {
        best = u;
        break;
      }
    }
    if (!best) return "—";
    const text = best.text.replace(/\s+/g, " ").trim();
    const short = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    return `第 ${best.idx + 1} 条 · ${short}`;
  }

  function scoreKeywordHit(query, mem) {
    const q = (query || "").toLowerCase();
    const c = `${mem.content || ""} ${mem.type || ""}`.toLowerCase();
    let score = 0;
    ["座位", "舞台", "地铁", "交通", "路线", "演唱会", "taylor", "swift", "msg", "北京", "餐厅", "健身", "东京", "工作", "偏好"].forEach((k) => {
      if (q.includes(k) && c.includes(k)) score += 0.18;
    });
    q.split(/\s+/).forEach((tok) => {
      if (tok.length > 1 && c.includes(tok)) score += 0.08;
    });
    return Math.min(0.99, Number(score.toFixed(2)));
  }

  function scoreVectorHit(query, mem) {
    const q = (query || "").toLowerCase();
    const c = `${mem.content || ""} ${mem.type || ""}`.toLowerCase();
    let score = 0.42;
    ["座位", "舞台", "地铁", "布鲁克林", "演唱会", "taylor", "swift", "msg", "麦迪逊", "计划", "偏好"].forEach((k) => {
      if (q.includes(k) && c.includes(k)) score += 0.12;
    });
    if (/座位|舞台|偏好/.test(q) && /偏好|座位|舞台/.test(c)) score += 0.15;
    if (/地铁|交通|路线/.test(q) && /地铁|路线|交通|布鲁克林/.test(c)) score += 0.14;
    return Math.min(0.99, Number(score.toFixed(2)));
  }

  function rewriteRecallQuery(query, session, rewritePrompt) {
    const raw = (query || "").trim();
    if (!raw) return { rewritten: "", note: "空问题" };
    let rewritten = raw;
    const noteParts = [];
    if (rewritePrompt) noteParts.push("已应用问题改写提示词");
    if (/还记得|记得我|什么样/.test(raw)) {
      rewritten = rewritten.replace(/还记得我喜欢什么样的座位吗[？?]?/, "用户偏好的演唱会座位类型");
      rewritten = rewritten.replace(/还记得/, "回忆");
      noteParts.push("指代消解与意图补全");
    }
    if (/下周去\s*MSG|MSG\s*看演唱会/.test(raw)) {
      rewritten = rewritten
        .replace(/下周去\s*MSG\s*看演唱会[，,]?/, "麦迪逊广场花园演唱会座位偏好 · ")
        .replace(/去\s*MSG/, "去麦迪逊广场花园(MSG)");
      noteParts.push("实体归一：MSG → 麦迪逊广场花园");
    }
    if (rewritten === raw) {
      rewritten = `用户意图：${raw}`;
      noteParts.push("补全检索意图表述");
    }
    const hist = (session?.messages || [])
      .filter((m) => m.role === "user" && m.text?.trim() && m.text !== raw)
      .slice(-2)
      .map((m) => truncate(m.text, 18));
    if (hist.length) noteParts.push(`结合近期提问：${hist.join(" / ")}`);
    return { rewritten, note: noteParts.join(" · ") || "问题改写" };
  }

  function annotateRecallHit(m, score, channel, msgs) {
    const sourceMsgs = msgs || [];
    return {
      ...m,
      score: Number(score.toFixed(2)),
      channel,
      roundLabel: memoryRoundLabel(sourceMsgs, m),
      sourceText: memorySourceItem(sourceMsgs, m),
    };
  }

  function buildRecallPipeline(query, preset, session) {
    const cfg = preset?.config?.retrieve || {};
    const methods = cfg.methods || [];
    const kwOn = !!methods.find((m) => m.id === "keyword" && m.enabled);
    const vecOn = !!methods.find((m) => m.id === "vector" && m.enabled);
    const kwTop = Math.max(1, Number(cfg.keywordTopK) || 5);
    const vecTop = Math.max(1, Number(cfg.vectorTopK) || 10);
    const topK = Math.max(1, Number(cfg.topK) || 8);
    const sim = Number(cfg.similarity ?? 0.7);
    const rerankOn = cfg.rerankEnabled !== false && cfg.rerankModel !== "rerank-off";
    const kwW = Number(methods.find((m) => m.id === "keyword")?.weight ?? 0.3);
    const vecW = Number(methods.find((m) => m.id === "vector")?.weight ?? 0.7);
    const pool = collectExtractMemoryPool();
    const srcByContent = new Map();
    pool.forEach((m) => {
      const key = m.content || "";
      if (!srcByContent.has(key)) srcByContent.set(key, m);
    });
    const findMsgs = (m) => {
      const hit = srcByContent.get(m.content || "");
      const sessions = ensurePgSessions().extract || [];
      const sess = sessions.find((s) => (s.memories || []).some((x) => x.content === m.content));
      return sess?.messages || session?.messages || [];
    };

    const rewrite = rewriteRecallQuery(query, session, cfg.rewritePrompt);
    const stages = [];
    let totalMs = 0;

    const rewriteMs = 28 + (rewrite.rewritten.length % 20);
    totalMs += rewriteMs;
    stages.push({
      id: "rewrite",
      title: "问题改写",
      status: "ok",
      ms: rewriteMs,
      summary: rewrite.note,
      rewritten: rewrite.rewritten,
      original: query,
    });

    let keywordHits = [];
    if (kwOn) {
      keywordHits = pool
        .map((m) => annotateRecallHit(m, scoreKeywordHit(rewrite.rewritten || query, m), "keyword", findMsgs(m)))
        .filter((h) => h.score > 0.15)
        .sort((a, b) => b.score - a.score)
        .slice(0, kwTop);
      if (!keywordHits.length) {
        keywordHits = pool.slice(0, Math.min(kwTop, pool.length)).map((m, i) =>
          annotateRecallHit(m, Math.max(0.35, 0.72 - i * 0.08), "keyword", findMsgs(m))
        );
      }
      const kwMs = 40 + keywordHits.length * 6;
      totalMs += kwMs;
      stages.push({
        id: "keyword",
        title: "关键字召回",
        status: "ok",
        ms: kwMs,
        summary: `Top-${kwTop} · 命中 ${keywordHits.length} 条`,
        hits: keywordHits,
        limit: kwTop,
      });
    }

    let vectorHits = [];
    if (vecOn) {
      vectorHits = pool
        .map((m) => annotateRecallHit(m, scoreVectorHit(rewrite.rewritten || query, m), "vector", findMsgs(m)))
        .filter((h) => h.score >= sim * 0.85)
        .sort((a, b) => b.score - a.score)
        .slice(0, vecTop);
      if (!vectorHits.length) {
        vectorHits = pool.slice(0, Math.min(vecTop, pool.length)).map((m, i) =>
          annotateRecallHit(m, Math.max(sim, 0.9 - i * 0.05), "vector", findMsgs(m))
        );
      }
      const vecMs = 90 + vectorHits.length * 8;
      totalMs += vecMs;
      stages.push({
        id: "vector",
        title: "向量召回",
        status: "ok",
        ms: vecMs,
        summary: `Top-${vecTop} · 阈值 ${sim.toFixed(2)} · 命中 ${vectorHits.length} 条`,
        hits: vectorHits,
        limit: vecTop,
        similarity: sim,
      });
    }

    const merged = new Map();
    const bump = (hit, weight) => {
      const key = hit.content || hit.id || JSON.stringify(hit);
      const prev = merged.get(key);
      const score = (hit.score || 0) * weight;
      if (!prev || score > prev.score) {
        merged.set(key, { ...hit, score: Number(score.toFixed(2)), channels: [...new Set([...(prev?.channels || []), hit.channel])] });
      } else if (prev) {
        prev.channels = [...new Set([...(prev.channels || []), hit.channel])];
      }
    };
    keywordHits.forEach((h) => bump(h, kwW || 0.3));
    vectorHits.forEach((h) => bump(h, vecW || 0.7));
    let fused = [...merged.values()].sort((a, b) => b.score - a.score);

    if (rerankOn) {
      const before = fused.length;
      fused = fused
        .map((h, i) => {
          const boost = /偏好|座位|舞台/.test(rewrite.rewritten || query) && /偏好|座位|舞台/.test(h.content || "") ? 0.08 : 0;
          const penalty = i * 0.01;
          return { ...h, score: Number(Math.min(0.99, h.score + boost - penalty).toFixed(2)), rank: i + 1 };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map((h, i) => ({ ...h, rank: i + 1 }));
      const rrMs = 18 + fused.length * 3;
      totalMs += rrMs;
      stages.push({
        id: "rerank",
        title: "重排",
        status: fused.length < before ? "warn" : "ok",
        ms: rrMs,
        summary: `融合 ${before} 条 → 重排 Top-${topK} · ${cfg.rerankModel || "rerank"}`,
        hits: fused,
        limit: topK,
        model: cfg.rerankModel || "rerank-lite",
      });
    } else {
      fused = fused.slice(0, topK).map((h, i) => ({ ...h, rank: i + 1 }));
    }

    return {
      query,
      rewritten: rewrite.rewritten,
      stages,
      memories: fused,
      totalMs,
      traceId: sessionTraceId(session),
    };
  }

  function retrieveForQuery(query, preset, session) {
    return buildRecallPipeline(query, preset || activeDebugPreset(spaceById(state.spaceId)), session || currentSession()).memories;
  }

  function ensureRecallTurns() {
    if (Array.isArray(state.recallTurns)) return state.recallTurns;
    const sess = ensurePgSessions().generate?.[0];
    const space = spaceById(state.spaceId);
    const preset = activeDebugPreset(space);
    const users = (sess?.messages || []).filter((m) => m.role === "user" && m.text?.trim());
    state.recallTurns = users.map((m, i) => {
      const pipeline = buildRecallPipeline(m.text, preset, sess);
      return {
        id: `rt-seed-${i}`,
        query: m.text,
        at: m.at,
        open: i === users.length - 1,
        memories: pipeline.memories,
        pipeline,
      };
    });
    return state.recallTurns;
  }

  function pushRecallTurn(query, at) {
    const turns = ensureRecallTurns();
    const text = (query || "").trim();
    if (!text) return null;
    const space = spaceById(state.spaceId);
    const preset = activeDebugPreset(space);
    const session = currentSession();
    const pipeline = buildRecallPipeline(text, preset, session);
    const last = turns[turns.length - 1];
    if (last && last.query === text) {
      last.memories = pipeline.memories;
      last.pipeline = pipeline;
      last.open = true;
      turns.forEach((t) => {
        if (t !== last) t.open = false;
      });
      return last;
    }
    turns.forEach((t) => {
      t.open = false;
    });
    const turn = {
      id: `rt-${Date.now()}`,
      query: text,
      at: at || new Date().toISOString(),
      open: true,
      memories: pipeline.memories,
      pipeline,
    };
    turns.push(turn);
    return turn;
  }

  function renderRecallHitCard(hit, stageId) {
    const type = hit.type || "—";
    const showChannel = stageId === "keyword" || stageId === "vector";
    const channelLabel =
      hit.channel === "keyword" ? "关键词" : hit.channel === "vector" ? "向量" : hit.channel || "";
    return `
      <article class="rc-hit">
        <div class="rc-hit-hd">
          <div class="mem-head-row">
            ${hit.roundLabel ? `<span class="mem-round-badge">${esc(hit.roundLabel)}</span>` : ""}
            <span class="mem-type-tag ${memTypeClass(type)}">${esc(shortMemType(type))}</span>
            ${showChannel && channelLabel ? `<span class="rc-hit-channel">${esc(channelLabel)}</span>` : ""}
          </div>
          <span class="rc-hit-score">${Number(hit.score || 0).toFixed(2)}</span>
        </div>
        <p class="mem-text">${esc(hit.content || "")}</p>
        <div class="rc-hit-src">来源对话：${esc(hit.sourceText || memorySourceItem([], hit))}</div>
      </article>`;
  }

  function renderRecallStage(stage, index) {
    const statusClass = stage.status === "warn" ? "is-warn" : stage.status === "num" ? "is-num" : "is-ok";
    const icon =
      stage.status === "warn"
        ? "!"
        : stage.status === "num"
          ? String(index + 1)
          : "✓";
    let body = "";
    if (stage.id === "rewrite") {
      body = `
        <div class="rc-stage-block">
          <div class="rc-kv"><span>原始问题</span><p>${esc(stage.original || "—")}</p></div>
          <div class="rc-kv"><span>改写后</span><p class="rc-rewrite">${esc(stage.rewritten || "—")}</p></div>
        </div>`;
    } else if (stage.hits) {
      body = stage.hits.length
        ? `<div class="rc-hit-list">${stage.hits.map((h) => renderRecallHitCard(h, stage.id)).join("")}</div>`
        : `<div class="out-empty">本路未召回记忆</div>`;
    }
    return `
      <li class="rc-stage ${statusClass}">
        <div class="rc-stage-rail"><span class="rc-stage-dot">${icon}</span></div>
        <div class="rc-stage-main">
          <div class="rc-stage-hd">
            <strong>${esc(stage.title)}</strong>
            <span class="rc-stage-ms">${stage.ms}ms</span>
          </div>
          <p class="rc-stage-summary">${esc(stage.summary || "")}</p>
          ${body}
        </div>
      </li>`;
  }

  function renderRecallPanel(space) {
    const out = $("#pg-output");
    if (!out) return;
    const turns = ensureRecallTurns();
    const latest = [...turns].reverse().find((t) => t.open) || turns[turns.length - 1];
    if (!latest?.pipeline) {
      out.innerHTML = `<div class="out-empty">发送问题后，将在此展示检索链路</div>`;
      return;
    }
    const pipe = latest.pipeline;
    const stages = pipe.stages || [];
    out.innerHTML = `
      <section class="rc-trace">
        <header class="rc-trace-hd">
          <div>
            <h3>召回链路追踪</h3>
            <p>Trace #${esc(pipe.traceId || sessionTraceId(currentSession()))} · ${stages.length} 阶段</p>
          </div>
          <span class="rc-trace-total">${pipe.totalMs || 0}ms</span>
        </header>
        <ol class="rc-stage-list">
          ${stages.map((s, i) => renderRecallStage(s, i)).join("")}
        </ol>
      </section>`;
  }

  function bindRecallGroups() {
    /* 检索链路为只读展示，无折叠交互 */
  }

  function renderMemoryCardsList(mems, msgs) {
    if (!mems?.length) return `<div class="out-empty">暂无结果</div>`;
    return mems
      .map((m) =>
        renderMemoryCard({
          ...m,
          roundLabel: memoryRoundLabel(msgs, m),
        })
      )
      .join("");
  }

  function paramDetailHtml(detail, label) {
    if (!detail) return `<p class="pg-log-param-empty">未记录参数快照</p>`;
    return `
      <div class="pg-log-param-card">
        ${label ? `<div class="pg-log-param-name">${esc(label)}</div>` : ""}
        <dl class="pg-log-param-dl">
          <div><dt>方案</dt><dd>${esc(detail.name || "—")}</dd></div>
          <div><dt>提取模型</dt><dd>${esc(detail.model || "—")}</dd></div>
          <div><dt>TopK</dt><dd>${esc(String(detail.topK ?? "—"))}</dd></div>
          <div><dt>相似度阈值</dt><dd>${esc(String(detail.similarity ?? "—"))}</dd></div>
          <div><dt>关键词 / 向量召回</dt><dd>${esc(String(detail.keywordTopK ?? "—"))} / ${esc(String(detail.vectorTopK ?? "—"))}</dd></div>
          <div><dt>检索方式</dt><dd>${esc(detail.methods || "—")}</dd></div>
          <div><dt>重排</dt><dd>${esc(detail.rerank || "—")}</dd></div>
        </dl>
        ${
          detail.extractPrompt
            ? `<p class="pg-log-param-prompt"><span>提取提示词</span>${esc(detail.extractPrompt)}</p>`
            : ""
        }
        ${
          detail.retrievePrompt
            ? `<p class="pg-log-param-prompt"><span>检索提示词</span>${esc(detail.retrievePrompt)}</p>`
            : ""
        }
      </div>`;
  }

  function debugRunCode(index, total) {
    return `#DR-${1800 + (total - index)}`;
  }

  function debugRunMs(run) {
    if (run?.durationMs) return run.durationMs;
    const n = (run?.memories || []).length;
    let h = 0;
    for (const ch of String(run?.id || "")) h = (h + ch.charCodeAt(0)) % 400;
    return 1600 + n * 120 + h;
  }

  function ensureRunParamDetail(run) {
    if (!run || run.paramDetail) return run?.paramDetail || null;
    const space = spaceById(state.spaceId);
    if (!space || !run.paramId || String(run.paramId).includes("|")) return null;
    run.paramDetail = snapshotPreset(getParamPreset(space, run.paramId));
    return run.paramDetail;
  }

  function closeRecordModal() {
    const host = $("#modal-host");
    if (host) host.innerHTML = "";
  }

  function openRecordModal(title, body, footerHtml) {
    const host = $("#modal-host");
    if (!host) return;
    host.innerHTML = `
      <div class="modal-backdrop" id="dbg-record-modal">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="dbg-modal-title">
          <div class="modal-hd">
            <h3 id="dbg-modal-title">${title}</h3>
            <button type="button" class="icon-btn" id="modal-x" aria-label="关闭">×</button>
          </div>
          <div class="modal-bd">${body}</div>
          <div class="modal-ft">
            ${footerHtml || `<button type="button" class="btn btn-secondary" id="modal-cancel">关闭</button>`}
          </div>
        </div>
      </div>`;
    $("#modal-x", host).onclick = closeRecordModal;
    $("#modal-cancel", host).onclick = closeRecordModal;
    $("#dbg-record-modal", host).addEventListener("click", (e) => {
      if (e.target.id === "dbg-record-modal") closeRecordModal();
    });
  }

  function openRunParamsModal(run, code) {
    const detail = ensureRunParamDetail(run);
    const body =
      run.kind === "compare"
        ? `<div class="pg-log-param-grid">
            ${paramDetailHtml(detail?.a, "参数 A")}
            ${paramDetailHtml(detail?.b, "参数 B")}
          </div>`
        : paramDetailHtml(detail);
    openRecordModal(`${code} · 参数`, body);
  }

  function openRunResultModal(run, code) {
    const session = currentSession();
    const msgs = session?.messages || [];
    const mems = run.memories || [];
    const body = `
      <p class="modal-desc" style="margin-bottom:12px">${esc(run.paramLabel || "—")} · ${mems.length} 条</p>
      <div class="out-extract-list">${renderMemoryCardsList(mems, msgs)}</div>`;
    openRecordModal(`${code} · 结果`, body);
  }

  const DEBUG_LOG_PAGE_SIZE = 4;

  function currentDebugLogPageSlice(log) {
    const total = log.length;
    const pageCount = Math.max(1, Math.ceil(total / DEBUG_LOG_PAGE_SIZE) || 1);
    let page = Math.max(0, Number(state.debugLogPage) || 0);
    if (page > pageCount - 1) page = pageCount - 1;
    state.debugLogPage = page;
    const start = page * DEBUG_LOG_PAGE_SIZE;
    return { total, page, pageCount, start, slice: log.slice(start, start + DEBUG_LOG_PAGE_SIZE) };
  }

  function memorySourceDialogues(msgs, mem) {
    const { from, to } = inferMemoryRoundRange(msgs, mem);
    const indexed = (msgs || []).map((m, idx) => ({ ...m, idx }));
    const users = indexed.filter((m) => m.role === "user" && m.text?.trim());
    const turns = [];
    const end = Number.isFinite(to) ? to : from;
    for (let round = from; round <= end; round += 1) {
      const user = users[round - 1];
      if (!user) continue;
      const assistant = indexed.find((m) => m.idx > user.idx && m.role === "assistant");
      turns.push({ round, user, assistant });
    }
    return turns;
  }

  function renderSourceTurns(msgs, mem) {
    const turns = memorySourceDialogues(msgs, mem);
    if (!turns.length) return `<p class="cmp-src-empty">未匹配到来源对话</p>`;
    return turns
      .map(
        (t) => `
        <div class="cmp-src-turn">
          <div class="cmp-src-round">第${t.round}轮</div>
          <div class="cmp-src-line"><span>USER</span><p>${esc(t.user.text || "")}</p></div>
          ${
            t.assistant
              ? `<div class="cmp-src-line"><span>ASSISTANT</span><p>${esc(t.assistant.text || "")}</p></div>`
              : ""
          }
        </div>`
      )
      .join("");
  }

  function renderCompareMemory(m, msgs) {
    const type = m.type || "—";
    const roundLabel = memoryRoundLabel(msgs, m);
    return `
      <article class="cmp-mem">
        <div class="mem-head-row">
          ${roundLabel ? `<span class="mem-round-badge">${esc(roundLabel)}</span>` : ""}
          <span class="mem-type-tag ${memTypeClass(type)}">${esc(shortMemType(type))}</span>
        </div>
        <p class="mem-text">${esc(m.content || "")}</p>
        <div class="cmp-src">
          <div class="cmp-src-title">来源对话</div>
          ${renderSourceTurns(msgs, m)}
        </div>
      </article>`;
  }

  function renderDebugLogModule() {
    const session = currentSession();
    const log = ensureSessionDebugLog(session);
    const { total, page, pageCount, start, slice } = currentDebugLogPageSlice(log);
    const validIds = new Set(log.map((r) => r.id));
    state.comparePickIds = (state.comparePickIds || []).filter((id) => validIds.has(id)).slice(0, 2);
    const picking = !!state.comparePicking;
    const picks = picking ? state.comparePickIds : [];
    const pickSet = new Set(picks);
    const rows = slice.length
      ? slice
          .map((r, localIdx) => {
            ensureRunParamDetail(r);
            const i = start + localIdx;
            const code = debugRunCode(i, total);
            const sec = (debugRunMs(r) / 1000).toFixed(2);
            const checked = pickSet.has(r.id);
            const disabled = !checked && picks.length >= 2;
            return `
              <tr>
                ${
                  picking
                    ? `<td class="pg-run-check"><input type="checkbox" data-dbg-pick="${esc(r.id)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} aria-label="选择 ${esc(code)}" /></td>`
                    : ""
                }
                <td><span class="pg-run-id">${esc(code)}</span></td>
                <td><button type="button" class="pg-run-link" data-dbg-params="${esc(r.id)}">查看参数</button></td>
                <td><button type="button" class="pg-run-link" data-dbg-result="${esc(r.id)}">查看结果</button></td>
                <td class="pg-run-ms">${sec}s</td>
                <td class="pg-run-time">${esc(fmtStamp(r.at, true))}</td>
              </tr>`;
          })
          .join("")
      : `<tr><td colspan="${picking ? 6 : 5}"><div class="out-empty">尚无调试记录。重跑本轮后会记在这里。</div></td></tr>`;

    const pager = `
      <div class="pg-run-pager">
        <span class="pg-run-pager-info">${picking ? `已选 ${picks.length}/2 · ` : ""}第 ${page + 1} / ${pageCount} 页 · 共 ${total} 条</span>
        <button type="button" class="btn btn-secondary btn-sm" id="pg-log-prev" ${page <= 0 ? "disabled" : ""}>上一页</button>
        <button type="button" class="btn btn-secondary btn-sm" id="pg-log-next" ${page >= pageCount - 1 ? "disabled" : ""}>下一页</button>
      </div>`;

    return `
      <section class="pg-log-module" id="pg-log-module">
        <header class="pg-log-hd">
          <div>
            <h3>调试记录</h3>
            ${picking ? `<p>勾选两条记录，翻页会保留已选</p>` : ""}
          </div>
          <div class="pg-log-hd-actions">
            ${picking ? `<button type="button" class="btn btn-secondary btn-sm" id="pg-cancel-compare">取消</button>` : ""}
            <button type="button" class="btn ${picking ? "btn-primary" : "btn-secondary"} btn-sm" id="pg-enter-compare" ${picking && picks.length !== 2 ? "disabled" : ""}>${picking ? "开始对比" : "对比"}</button>
          </div>
        </header>
        <div class="pg-run-table-wrap">
          <table class="pg-run-table">
            <thead>
              <tr>
                ${picking ? `<th class="pg-run-check"></th>` : ""}
                <th>运行 ID</th>
                <th>查看参数</th>
                <th>结果</th>
                <th>耗时</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${pager}
      </section>`;
  }

  function refreshDebugLogModule() {
    const host = $("#pg-log-module");
    if (!host) return;
    const html = renderDebugLogModule();
    const tmp = document.createElement("div");
    tmp.innerHTML = html.trim();
    host.replaceWith(tmp.firstElementChild);
    bindDebugLogModule();
  }

  function debugRunLabel(log, index) {
    const n = Math.max(1, log.length - index);
    return `Run #${String(n).padStart(2, "0")}`;
  }

  function comparableDebugRuns(session) {
    return ensureSessionDebugLog(session).filter(
      (r) => r.kind !== "compare" && Array.isArray(r.memories)
    );
  }

  function enterCompareMode() {
    const session = currentSession();
    const log = ensureSessionDebugLog(session);
    const validIds = new Set(log.map((r) => r.id));
    const picks = (state.comparePickIds || []).filter((id) => validIds.has(id)).slice(0, 2);
    if (picks.length !== 2) {
      toast("请勾选两条调试记录");
      return;
    }
    state.comparePickIds = picks;
    state.comparePicking = false;
    state.compareMode = true;
    state.outView = "output";
    renderPage();
  }

  function exitCompareMode() {
    state.compareMode = false;
    state.comparePicking = false;
    state.comparePickIds = [];
    renderPage();
  }

  function renderCompareRunColumn(run, label, msgs) {
    if (!run) {
      return `<div class="cmp-pane"><div class="out-empty">请选择一条调试记录</div></div>`;
    }
    const detail = run.paramDetail;
    const paramLine = detail
      ? `${detail.name || "—"} · ${detail.model || "—"} · TopK ${detail.topK ?? "—"} · 阈值 ${detail.similarity ?? "—"}`
      : run.paramLabel || "—";
    const mems = run.memories || [];
    const tokens = 900 + mems.length * 80 + ((run.id || "").length % 97);
    const ms = run.durationMs || 1800 + mems.length * 90 + ((run.id || "").charCodeAt(4) || 0) % 400;
    return `
      <div class="cmp-pane">
        <header class="cmp-pane-hd">
          <div>
            <div class="cmp-pane-title">${esc(label)}</div>
            <div class="cmp-pane-param">参数：${esc(paramLine)}</div>
          </div>
          <span class="out-extract-count">${mems.length} 条</span>
        </header>
        <div class="cmp-pane-body">
          <div class="cmp-pane-label">输出结果</div>
          <div class="out-extract-list">${(mems.length ? mems : []).map((m) => renderCompareMemory(m, msgs)).join("") || `<div class="out-empty">暂无结果</div>`}</div>
        </div>
        <footer class="cmp-pane-ft">
          <span>Token：${tokens}</span>
          <span>耗时：${(ms / 1000).toFixed(2)}s</span>
        </footer>
      </div>`;
  }

  function renderCompareModeView(space) {
    const session = currentSession();
    const log = ensureSessionDebugLog(session);
    const picks = (state.comparePickIds || []).slice(0, 2);
    const msgs = session?.messages || [];
    const runA = log.find((r) => r.id === picks[0]);
    const runB = log.find((r) => r.id === picks[1]);
    const labelOf = (id) => {
      const i = log.findIndex((r) => r.id === id);
      return i >= 0 ? debugRunCode(i, log.length) : "—";
    };

    return `
      <div class="playground is-compare-mode">
        <div class="cmp-mode">
          <header class="cmp-mode-hd">
            <button type="button" class="btn btn-secondary btn-sm" id="pg-exit-compare">← 返回调试</button>
            <h2>对比模式</h2>
            <span class="cmp-mode-hint">${esc(labelOf(picks[0]))} 与 ${esc(labelOf(picks[1]))}</span>
          </header>
          <div class="cmp-split">
            ${renderCompareRunColumn(runA, labelOf(picks[0]), msgs)}
            ${renderCompareRunColumn(runB, labelOf(picks[1]), msgs)}
          </div>
        </div>
      </div>`;
  }

  function bindCompareMode() {
    $("#pg-exit-compare")?.addEventListener("click", () => exitCompareMode());
  }

  function loadDebugRecord(id) {
    const session = currentSession();
    const space = spaceById(state.spaceId);
    const entry = ensureSessionDebugLog(session).find((x) => x.id === id);
    if (!entry || !session) return;
    if (entry.kind === "compare") {
      toast("请使用「对比」模式查看对比类记录");
      return;
    }
    session.memories = JSON.parse(JSON.stringify(entry.memories || []));
    if (entry.paramId && !String(entry.paramId).includes("|")) state.debugParamId = entry.paramId;
    state.outView = "output";
    state.compareMode = false;
    toast("已载入该次调试结果");
    renderPage();
  }

  function bindDebugLogModule() {
    const host = $("#pg-log-module");
    if (!host) return;
    const session = currentSession();
    const log = ensureSessionDebugLog(session);
    const findRun = (id) => log.find((r) => r.id === id);
    $$("[data-dbg-params]", host).forEach((btn) => {
      btn.onclick = () => {
        const run = findRun(btn.dataset.dbgParams);
        if (!run) return;
        const i = log.indexOf(run);
        openRunParamsModal(run, debugRunCode(i, log.length));
      };
    });
    $$("[data-dbg-result]", host).forEach((btn) => {
      btn.onclick = () => {
        const run = findRun(btn.dataset.dbgResult);
        if (!run) return;
        const i = log.indexOf(run);
        openRunResultModal(run, debugRunCode(i, log.length));
      };
    });
    $("#pg-enter-compare", host)?.addEventListener("click", () => {
      if (!state.comparePicking) {
        state.comparePicking = true;
        state.comparePickIds = [];
        refreshDebugLogModule();
        return;
      }
      enterCompareMode();
    });
    $("#pg-cancel-compare", host)?.addEventListener("click", () => {
      state.comparePicking = false;
      state.comparePickIds = [];
      refreshDebugLogModule();
    });
    $$("[data-dbg-pick]", host).forEach((cb) => {
      cb.onchange = () => {
        const id = cb.dataset.dbgPick;
        let picks = [...(state.comparePickIds || [])];
        if (cb.checked) {
          if (!picks.includes(id) && picks.length < 2) picks.push(id);
        } else {
          picks = picks.filter((x) => x !== id);
        }
        state.comparePickIds = picks;
        refreshDebugLogModule();
      };
    });
    $("#pg-log-prev", host)?.addEventListener("click", () => {
      if (state.debugLogPage <= 0) return;
      state.debugLogPage -= 1;
      refreshDebugLogModule();
    });
    $("#pg-log-next", host)?.addEventListener("click", () => {
      const total = ensureSessionDebugLog(currentSession()).length;
      const pageCount = Math.max(1, Math.ceil(total / DEBUG_LOG_PAGE_SIZE));
      if (state.debugLogPage >= pageCount - 1) return;
      state.debugLogPage += 1;
      refreshDebugLogModule();
    });
  }

  function renderOutputPanel(space) {
    const out = $("#pg-output");
    if (!out) return;
    if (state.debugMode === "generate") {
      renderRecallPanel(space);
      return;
    }
    ensurePgSessions();
    const sessions = ensurePgSessions()[currentModeKey()];
    const curIdx = state.pgSessionIdx;
    const current = sessions[curIdx] || sessions[0];
    const preset = activeDebugPreset(space);

    let currentMems = sessionMemories(current);
    if (current?.memories == null) {
      currentMems = defaultExtractMemories();
    }
    const msgs = current?.messages || [];
    const cards = renderMemoryCardsList(currentMems, msgs);
    const curCount = currentMems.length;

    out.innerHTML = `
      <section class="out-extract">
        <div class="out-extract-hd">
          <div>
            <div class="out-extract-title">抽取结果</div>
            <div class="out-extract-sub">${esc(preset?.name || "当前参数")}</div>
          </div>
          <span class="out-extract-count">${curCount} 条</span>
        </div>
        <div class="out-extract-list">
          ${
            curCount
              ? cards
              : `<div class="out-empty">暂无记忆，点击「重跑本轮」</div>`
          }
        </div>
      </section>`;
  }

  function bindOutputGroups(space) {
    const out = $("#pg-output");
    if (!out) return;

    out.querySelector("[data-current-toggle]")?.addEventListener("click", () => {
      state.outCurrentOpen = !state.outCurrentOpen;
      renderOutputPanel(space);
    });

    $$("[data-hist-toggle]", out).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.histToggle;
        state.outHistOpen = { ...state.outHistOpen, [id]: !state.outHistOpen[id] };
        renderOutputPanel(space);
      });
    });
  }

  function collectMessagesJson() {
    const session = currentSession();
    return (session?.messages || []).map((m) => ({
      role: m.role,
      content: m.text,
      timestamp: m.at,
    }));
  }

  function refreshMsgJson() {
    const jsonEl = $("#chat-json");
    if (!jsonEl) return;
    const text = JSON.stringify(collectMessagesJson(), null, 2);
    if (jsonEl.tagName === "TEXTAREA") jsonEl.value = text;
    else jsonEl.textContent = text;
  }

  function applyMsgJsonFromEditor() {
    const jsonEl = $("#chat-json");
    const session = currentSession();
    if (!jsonEl || !session) return false;
    const raw = jsonEl.tagName === "TEXTAREA" ? jsonEl.value : jsonEl.textContent;
    try {
      const parsed = JSON.parse(raw || "[]");
      if (!Array.isArray(parsed)) throw new Error("JSON 须为数组");
      session.messages = parsed.map((m, i) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        text: String(m.content ?? m.text ?? ""),
        at: m.timestamp || m.at || session.messages?.[i]?.at || new Date().toISOString(),
      }));
      return true;
    } catch (err) {
      toast(`JSON 无效：${err.message || "请检查格式"}`);
      return false;
    }
  }

  function refreshSessionSelect() {
    const rail = $("#pg-session-rail");
    const sessions = ensurePgSessions()[currentModeKey()];
    const idx = state.pgSessionIdx;
    if (rail) {
      const search = $("#pg-session-search");
      const caret = search && document.activeElement === search;
      const start = search?.selectionStart;
      const html = renderSessionRail(sessions, idx);
      const tmp = document.createElement("div");
      tmp.innerHTML = html.trim();
      const next = tmp.firstElementChild;
      rail.replaceWith(next);
      bindSessionPicker();
      updateGraphFsSessionLabel();
      if (caret) {
        const el = $("#pg-session-search");
        el?.focus();
        if (el && start != null) el.setSelectionRange(start, start);
      }
      return;
    }
    updateGraphFsSessionLabel();
  }

  function closeSessionMenu() {
    $("#pg-session-ctx")?.classList.add("hidden");
    state._sessionCtxIdx = null;
  }

  function closeSessionCtx() {
    closeSessionMenu();
  }

  function openSessionCtx(idx, anchor) {
    const ctx = $("#pg-session-ctx");
    if (!ctx || !anchor) return;
    state._sessionCtxIdx = idx;
    ctx.classList.remove("hidden");
    const aRect = anchor.getBoundingClientRect();
    const menuW = 120;
    const gap = 6;
    let left = aRect.right + gap;
    let top = aRect.top;
    if (left + menuW > window.innerWidth - 8) {
      left = Math.max(8, aRect.left - menuW - gap);
    }
    const menuH = ctx.offsetHeight || 120;
    if (top + menuH > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - menuH - 8);
    }
    ctx.style.top = `${top}px`;
    ctx.style.left = `${left}px`;
  }

  function refreshChatSessionHeader() {
    const nameEl = $("#pg-chat-session-name");
    const sess = currentSession();
    if (!nameEl || !sess) return;
    const name = sessionListName(sess, state.pgSessionIdx);
    nameEl.textContent = name;
    nameEl.title = name;
    const meta = document.querySelector(".pg-chat-session-meta");
    if (meta) {
      const space = spaceById(state.spaceId);
      const engineVer = space?.config?.extract?.model || "v2.4.1";
      meta.innerHTML = `
        <span>Trace ID <code>#${esc(sessionTraceId(sess))}</code></span>
        <span>引擎 ${esc(engineVer)}</span>
        <span class="pg-chat-engine-on">检索引擎已启用</span>`;
    }
    const dock = $("#pg-debug-dock");
    if (dock) {
      const metas = dock.querySelectorAll(".pg-dock-meta span");
      if (metas[0]) metas[0].textContent = `上次运行 ${formatLastRunClock(sess.lastRunAt || state.lastRunAt)}`;
      if (metas[1]) {
        const ms = sess.lastRunMs ?? state.lastRunMs;
        metas[1].textContent = `总耗时 ${ms != null ? `${ms}ms` : "—"}`;
      }
    }
  }

  function selectSession(idx) {
    state.pgSessionIdx = idx;
    state.outCurrentOpen = true;
    closeSessionMenu();
    refreshSessionSelect();
    refreshChatSessionHeader();
    replayDebug($("#chat-stream"));
    state.debugParamViewId = null;
    state.debugLogPage = 0;
    state.comparePicking = false;
    state.comparePickIds = [];
    refreshDebugLogModule();
    const space = spaceById(state.spaceId);
    if (space) renderOutputPanel(space);
  }

  function createSession() {
    const sessions = ensurePgSessions()[currentModeKey()];
    const n = sessions.length + 1;
    sessions.unshift({
      id: `session-${Date.now().toString().slice(-4)}`,
      displayName: "",
      startedAt: new Date().toISOString(),
      messages: [
        {
          role: "user",
          text: "开始一段新的对话…",
          at: new Date().toISOString(),
        },
      ],
      memories: [],
      _seedMemories: [],
    });
    selectSession(0);
    toast("已新建会话");
  }

  function renameSession(idx) {
    const sessions = ensurePgSessions()[currentModeKey()];
    const sess = sessions[idx];
    if (!sess) return;
    const next = window.prompt("重命名会话", sessionListName(sess, idx));
    if (next == null) return;
    const title = next.trim();
    if (!title) {
      toast("名称不能为空");
      return;
    }
    sess.displayName = title;
    refreshSessionSelect();
    toast("已重命名");
  }

  function duplicateSession(idx) {
    const sessions = ensurePgSessions()[currentModeKey()];
    const sess = sessions[idx];
    if (!sess) return;
    const copy = JSON.parse(JSON.stringify(sess));
    copy.id = `session-${Date.now().toString().slice(-4)}`;
    copy.displayName = `${sessionListName(sess, idx)}（副本）`;
    copy.startedAt = new Date().toISOString();
    sessions.splice(idx + 1, 0, copy);
    selectSession(idx + 1);
    toast("已复制会话");
  }

  function deleteSession(idx) {
    const sessions = ensurePgSessions()[currentModeKey()];
    if (sessions.length <= 1) {
      toast("至少保留一个会话");
      return;
    }
    const sess = sessions[idx];
    if (!sess) return;
    confirmDeleteSession(idx, sessionListLabel(sess, idx));
  }

  function confirmDeleteSession(idx, label) {
    const host = $("#modal-host");
    if (!host) return;
    host.innerHTML = `
      <div class="modal-backdrop" id="delete-session-modal">
        <div class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="delete-session-title">
          <div class="modal-hd">
            <h3 id="delete-session-title">删除会话？</h3>
            <button type="button" class="icon-btn" id="modal-x" aria-label="关闭">×</button>
          </div>
          <div class="modal-bd">
            <p class="modal-desc">确定删除「${esc(label)}」？删除后不可恢复。</p>
          </div>
          <div class="modal-ft">
            <button type="button" class="btn btn-secondary" id="modal-cancel">取消</button>
            <button type="button" class="btn btn-danger" id="modal-confirm-delete">删除</button>
          </div>
        </div>
      </div>`;
    const close = () => {
      host.innerHTML = "";
    };
    const doDelete = () => {
      const sessions = ensurePgSessions()[currentModeKey()];
      if (sessions.length <= 1) {
        toast("至少保留一个会话");
        close();
        return;
      }
      if (!sessions[idx]) {
        close();
        return;
      }
      sessions.splice(idx, 1);
      if (state.pgSessionIdx >= sessions.length) state.pgSessionIdx = sessions.length - 1;
      else if (state.pgSessionIdx > idx) state.pgSessionIdx -= 1;
      selectSession(state.pgSessionIdx);
      close();
      toast("已删除会话");
    };
    $("#modal-x", host).onclick = close;
    $("#modal-cancel", host).onclick = close;
    $("#modal-confirm-delete", host).onclick = doDelete;
    $("#delete-session-modal", host).addEventListener("click", (e) => {
      if (e.target.id === "delete-session-modal") close();
    });
    $("#modal-confirm-delete", host)?.focus();
  }

  function bindSessionPicker() {
    const rail = $("#pg-session-rail");
    const ctx = $("#pg-session-ctx");
    if (!rail) return;

    const toggle = $("#pg-rail-toggle");
    if (toggle) {
      toggle.onclick = (e) => {
        e.stopPropagation();
        state.sessionRailCollapsed = !state.sessionRailCollapsed;
        const collapsed = state.sessionRailCollapsed;
        rail.classList.toggle("is-collapsed", collapsed);
        rail.closest(".pg-split")?.classList.toggle("is-rail-collapsed", collapsed);
        const label = collapsed ? "展开会话列表" : "收起会话列表";
        toggle.title = label;
        toggle.setAttribute("aria-label", label);
        const path = toggle.querySelector("path");
        if (path) path.setAttribute("d", collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6");
      };
    }

    $("#pg-session-search")?.addEventListener("input", (e) => {
      state.sessionSearch = e.target.value;
      refreshSessionSelect();
    });

    $$("[data-session-pick]", rail).forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        selectSession(Number(btn.dataset.sessionPick) || 0);
      };
    });

    $$("[data-session-more]", rail).forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.sessionMore) || 0;
        if (state._sessionCtxIdx === idx && !ctx?.classList.contains("hidden")) {
          closeSessionCtx();
          return;
        }
        openSessionCtx(idx, btn);
      };
    });

    $("#pg-session-new")?.addEventListener("click", (e) => {
      e.stopPropagation();
      createSession();
    });

    $$("[data-session-act]", ctx).forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const idx = state._sessionCtxIdx;
        const act = btn.dataset.sessionAct;
        closeSessionCtx();
        if (idx == null) return;
        if (act === "rename") renameSession(idx);
        else if (act === "duplicate") duplicateSession(idx);
        else if (act === "delete") deleteSession(idx);
      };
    });

    if (!state._sessionMenuCloser) {
      state._sessionMenuCloser = (e) => {
        const p = $("#pg-session-rail");
        if (!p?.contains(e.target)) closeSessionMenu();
      };
      document.addEventListener("click", state._sessionMenuCloser);
    }
  }

  function initDebugPlayground(space) {
    if (state.compareMode) {
      bindCompareMode();
      return;
    }
    const stream = $("#chat-stream");
    const uid = () => playgroundUserId();
    replayDebug(stream);
    renderOutputPanel(space);
    bindDebugLogModule();
    updatePgActionLabel();
    if (state.debugMode === "generate" && !state.recallGraphHighlight) {
      const mems = latestRecallMemories();
      if (mems.length) applyRecallGraphHighlight(mems, { pulse: false });
    }

    const ensureGraph = () => {
      const canvas = $("#kg-canvas");
      if (!canvas) return;
      if (state.graphInstance) {
        state.graphInstance.setData(
          getGraph(uid(), space.id),
          state.debugMode === "generate" ? state.recallGraphHighlight?.ids || [] : []
        );
        syncRecallHighlightToGraph({ pulse: false });
        return;
      }
      state.graphInstance = new MemoryGraph(canvas, {
        onSelect: (sel) => openGraphDetail(sel),
        onFullscreen: () => {
          if (state.graphFullscreen) exitGraphFullscreen();
          else enterGraphFullscreen(() => ensureGraph());
        },
      });
      state.graphInstance.setData(
        getGraph(uid(), space.id),
        state.debugMode === "generate" ? state.recallGraphHighlight?.ids || [] : []
      );
      if (state.debugMode === "generate") syncRecallHighlightToGraph({ pulse: false });
    };

    bindSessionPicker();

    $$("#msg-view-toggle [data-msgview]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state.msgView === "json" && btn.dataset.msgview === "editor") {
          if (!applyMsgJsonFromEditor()) return;
          replayDebug($("#chat-stream"));
        }
        state.msgView = btn.dataset.msgview;
        $$("#msg-view-toggle [data-msgview]").forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
        const isJson = state.msgView === "json";
        $("#chat-stream")?.classList.toggle("hidden", isJson);
        $("#chat-json")?.classList.toggle("hidden", !isJson);
        if (isJson) refreshMsgJson();
      });
    });

    $("#chat-json")?.addEventListener("blur", () => {
      if (state.msgView !== "json") return;
      if (applyMsgJsonFromEditor()) refreshMsgJson();
    });
    $("#chat-json")?.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (applyMsgJsonFromEditor()) {
          refreshMsgJson();
          toast("JSON 已应用");
        }
      }
    });

    $$("#pg-out-tabs [data-out]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.out;
        state.outView = tab;
        $$("#pg-out-tabs [data-out]").forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
        const isGraph = tab === "graph";
        $("#pg-output")?.classList.toggle("hidden", isGraph);
        $("#pg-graph-wrap")?.classList.toggle("hidden", !isGraph);
        document.querySelector(".pg-stage-main")?.classList.toggle("is-graph-focus", isGraph);
        syncOutTabActions(tab);
        if (!isGraph) {
          clearGraphDetailPanel();
          if (state.graphFullscreen) exitGraphFullscreen();
          renderOutputPanel(space);
        } else {
          requestAnimationFrame(() => {
            ensureGraph();
            state.graphInstance?._resize?.();
            if (state.debugMode === "generate") {
              syncRecallHighlightToGraph({ pulse: true });
            } else {
              clearGraphDetailPanel();
            }
          });
        }
      });
    });
    syncOutTabActions(state.outView || "output");
    if ((state.outView || "output") === "graph") {
      requestAnimationFrame(() => ensureGraph());
    }

    bindDebugParamControls(space);

    const enterFs = () => {
      // 先切到图谱 Tab
      document.querySelector('#pg-out-tabs [data-out="graph"]')?.click();
      enterGraphFullscreen(() => ensureGraph());
    };
    $("#pg-graph-fs-btn")?.addEventListener("click", enterFs);
    $("#pg-graph-fs-back")?.addEventListener("click", () => exitGraphFullscreen());
    $("#pg-graph-fs-exit")?.addEventListener("click", () => exitGraphFullscreen());

    if (state._graphFsEsc) {
      document.removeEventListener("keydown", state._graphFsEsc);
    }
    state._graphFsEsc = (e) => {
      if (e.key === "Escape" && state.graphFullscreen) exitGraphFullscreen();
    };
    document.addEventListener("keydown", state._graphFsEsc);

    const filterBtn = $("#entity-filter-btn");
    const filterMenu = $("#entity-filter-menu");
    filterBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      filterMenu?.classList.toggle("hidden");
    });
    filterMenu?.addEventListener("click", (e) => {
      const opt = e.target.closest("[data-type]");
      if (!opt) return;
      const t = opt.dataset.type;
      $$(".type-opt", filterMenu).forEach((o) =>
        o.classList.toggle("active", o === opt)
      );
      const meta = ENTITY_TYPE_META.find((x) => x.id === t);
      const mark = filterBtn?.querySelector(".type-mark");
      const lab = $("#entity-filter-label");
      if (mark) {
        mark.className = `type-mark ${meta?.shape || "circle"}`;
        mark.style.background = meta?.color || "#94a3b8";
      }
      if (lab) lab.textContent = t === "all" ? "全部类型" : t;
      filterMenu.classList.add("hidden");
      const g = getGraph(uid(), space.id);
      const ids =
        t === "all"
          ? []
          : g.nodes
              .filter((n) => (n.category || LEGACY_TYPE_MAP[n.type] || n.type) === t)
              .map((n) => n.id);
      state.graphInstance?.setHighlight(ids);
    });
    const closeFilter = (e) => {
      if (!e.target.closest("#entity-filter")) filterMenu?.classList.add("hidden");
    };
    if (state._closeEntityFilter) {
      document.removeEventListener("click", state._closeEntityFilter);
    }
    document.addEventListener("click", closeFilter);
    state._closeEntityFilter = closeFilter;

    $("#graph-search")?.addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      const g = getGraph(uid(), space.id);
      const ids = q
        ? g.nodes
            .filter(
              (n) =>
                n.label.toLowerCase().includes(q) ||
                String(n.type).toLowerCase().includes(q)
            )
            .map((n) => n.id)
        : [];
      state.graphInstance?.setHighlight(ids);
    });

    $("#pg-run")?.addEventListener("click", () => runPlayground(space));

    $("#pg-add-msg")?.addEventListener("click", () => addDebugMessage(space));

    bindSessionPicker();

    $("#pg-retest-all")?.addEventListener("click", () => retestAllSessions(space));
    $("#pg-retest")?.addEventListener("click", () => retestAllSessions(space));
    syncStaleBar();
  }

  function markDebugRun(ms) {
    const at = new Date().toISOString();
    const dur = ms ?? 180 + Math.floor(Math.random() * 280);
    state.lastRunAt = at;
    state.lastRunMs = dur;
    const sess = currentSession();
    if (sess) {
      sess.lastRunAt = at;
      sess.lastRunMs = dur;
    }
    const dock = $("#pg-debug-dock");
    if (dock) {
      const metas = dock.querySelectorAll(".pg-dock-meta span");
      if (metas[0]) metas[0].textContent = `上次运行 ${formatLastRunClock(at)}`;
      if (metas[1]) metas[1].textContent = `总耗时 ${dur}ms`;
    }
    return dur;
  }

  function bindDebugParamControls(space) {
    const select = $("#pg-param-select");
    select?.addEventListener("change", (e) => {
      state.debugParamId = e.target.value;
      const preset = activeDebugPreset(space);
      if (select) select.title = presetSummary(preset);
      if (state.debugMode === "generate") {
        state.recallTurns = null;
        renderOutputPanel(space);
      }
      markParamsDirty();
    });

    $("#pg-enter-compare-top")?.addEventListener("click", () => enterCompareMode());

    $("#pg-rerun-round")?.addEventListener("click", () => {
      if (state.debugMode === "generate") {
        autoAssistantReply(space);
        markDebugRun(320 + Math.floor(Math.random() * 120));
        refreshDebugLogModule();
        toast("已重跑本轮召回");
      } else {
        runPlayground(space);
      }
    });

    $("#pg-step-run")?.addEventListener("click", () => {
      state.stepRecall = true;
      toast(state.debugMode === "generate" ? "单步执行：逐步展开召回链路" : "单步执行：按消息逐步抽取");
      markDebugRun(95 + Math.floor(Math.random() * 80));
      if (state.debugMode !== "generate") runPlayground(space);
      else {
        const sess = currentSession();
        const lastUser = [...(sess?.messages || [])].reverse().find((m) => m.role === "user" && m.text?.trim());
        if (lastUser) {
          state.recallTurns = null;
          pushRecallTurn(lastUser.text, lastUser.at);
        }
        state.outView = "output";
        renderOutputPanel(space);
        document.querySelector('#pg-out-tabs [data-out="output"]')?.click();
        refreshDebugLogModule();
      }
    });

    $("#pg-snapshot")?.addEventListener("click", () => {
      const sess = currentSession();
      if (!sess) return;
      const preset = activeDebugPreset(space);
      const mems = Array.isArray(sess.memories)
        ? JSON.parse(JSON.stringify(sess.memories))
        : memoriesForPreset(space, preset, sess, state.debugMode === "generate");
      pushDebugLog(sess, {
        kind: state.debugMode === "generate" ? "recall" : "extract",
        paramId: preset?.id,
        paramLabel: `快照 · ${preset?.name || "当前参数"}`,
        summary: `手动快照 · ${mems.length} 条 · ${presetSummary(preset)}`,
        memories: mems,
      });
      toast("已生成调试快照");
      refreshDebugLogModule();
      $("#pg-log-module")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    $("#pg-step-recall")?.addEventListener("change", (e) => {
      state.stepRecall = !!e.target.checked;
      toast(state.stepRecall ? "已开启逐步召回" : "已关闭逐步召回");
    });

    $("#pg-export-session")?.addEventListener("click", () => {
      const sess = currentSession();
      if (!sess) return;
      const payload = {
        id: sess.id,
        name: sessionListName(sess, state.pgSessionIdx),
        traceId: sessionTraceId(sess),
        messages: sess.messages,
        memories: sess.memories,
        debugLog: sess.debugLog || [],
        param: activeDebugPreset(space)?.name,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${sess.id || "session"}-debug.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("已导出会话调试数据");
    });
  }

  function syncOutTabActions(tab) {
    const fsBtn = $("#pg-graph-fs-btn");
    const retest = $("#pg-retest-all");
    const isGraph = tab === "graph";
    fsBtn?.classList.toggle("hidden", !isGraph);
    retest?.classList.toggle("hidden", isGraph);
  }

  function updateGraphFsSessionLabel() {
    const el = $("#pg-graph-fs-session");
    if (!el) return;
    const sess = currentSession();
    const title = sessionDisplayTitle(sess, state.pgSessionIdx) || "未命名会话";
    el.textContent = `当前会话：${title}`;
  }

  function enterGraphFullscreen(ensureGraph) {
    const wrap = $("#pg-graph-wrap");
    const fs = $("#pg-graph-fs");
    const stage = $("#pg-graph-fs-stage");
    if (!wrap || !fs || !stage || state.graphFullscreen) return;
    state._graphFsHome = {
      parent: wrap.parentElement,
      next: wrap.nextSibling,
    };
    stage.appendChild(wrap);
    wrap.classList.remove("hidden");
    fs.classList.remove("hidden");
    fs.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-graph-fullscreen");
    state.graphFullscreen = true;
    updateGraphFsSessionLabel();
    requestAnimationFrame(() => {
      ensureGraph?.();
      state.graphInstance?._resize?.();
    });
  }

  function exitGraphFullscreen() {
    const wrap = $("#pg-graph-wrap");
    const fs = $("#pg-graph-fs");
    const home = state._graphFsHome;
    if (!wrap || !fs || !state.graphFullscreen) return;
    if (home?.parent) {
      if (home.next && home.next.parentNode === home.parent) {
        home.parent.insertBefore(wrap, home.next);
      } else {
        home.parent.appendChild(wrap);
      }
    }
    const graphTabActive = $(
      '#pg-out-tabs [data-out="graph"]'
    )?.classList.contains("active");
    wrap.classList.toggle("hidden", !graphTabActive);
    fs.classList.add("hidden");
    fs.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-graph-fullscreen");
    state.graphFullscreen = false;
    state._graphFsHome = null;
    requestAnimationFrame(() => {
      state.graphInstance?._resize?.();
    });
  }

  function markParamsDirty() {
    if (state.paramsDirty) return;
    state.paramsDirty = true;
    syncStaleBar();
  }

  function clearParamsDirty() {
    state.paramsDirty = false;
    syncStaleBar();
  }

  function syncStaleBar() {
    const bar = $("#pg-stale-bar");
    if (!bar) return;
    bar.classList.toggle("hidden", !state.paramsDirty);
  }

  function clearAllSessionOutputs() {
    const sessions = ensurePgSessions()[currentModeKey()];
    sessions.forEach((s) => {
      s.memories = [];
    });
  }

  function regenerateSessionMemories(sess, space, isGen) {
    if (!sess) return;
    if (isGen) {
      if (Array.isArray(sess._seedMemories) && sess._seedMemories.length) {
        sess.memories = JSON.parse(JSON.stringify(sess._seedMemories));
      } else {
        sess.memories = getRetrievedMemories();
      }
      return;
    }
    if (Array.isArray(sess._seedMemories) && sess._seedMemories.length) {
      sess.memories = JSON.parse(JSON.stringify(sess._seedMemories));
      return;
    }
    const stored = getExtractedMemories(space.id, playgroundUserId());
    sess.memories = stored.length ? stored : defaultExtractMemories();
  }

  function confirmClearOutput(space) {
    const host = $("#modal-host");
    if (!host) return;
    host.innerHTML = `
      <div class="modal-backdrop" id="clear-out-modal">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="clear-out-title">
          <div class="modal-hd">
            <h3 id="clear-out-title">清空所有会话结果？</h3>
            <button type="button" class="icon-btn" id="modal-x" aria-label="关闭">×</button>
          </div>
          <div class="modal-bd">
            <p class="modal-desc">所有会话的调试输出结果将被清空，不会删除会话本身及其消息内容。</p>
          </div>
          <div class="modal-ft">
            <button type="button" class="btn btn-secondary" id="modal-cancel">取消</button>
            <button type="button" class="btn btn-primary" id="modal-confirm-clear">清空所有会话结果</button>
          </div>
        </div>
      </div>`;
    const close = () => {
      host.innerHTML = "";
    };
    $("#modal-x", host).onclick = close;
    $("#modal-cancel", host).onclick = close;
    $("#clear-out-modal", host).addEventListener("click", (e) => {
      if (e.target.id === "clear-out-modal") close();
    });
    $("#modal-confirm-clear", host).onclick = () => {
      clearAllSessionOutputs();
      state.outCurrentOpen = true;
      state.outHistOpen = {};
      renderOutputPanel(space);
      document.querySelector('#pg-out-tabs [data-out="output"]')?.click();
      close();
    };
  }

  function retestAllSessions(space) {
    if ($("#pg-run")?.classList.contains("is-loading") || state._retestPending) return;
    clearAllSessionOutputs();
    state.outCurrentOpen = true;
    state.outHistOpen = {};
    renderOutputPanel(space);
    document.querySelector('#pg-out-tabs [data-out="output"]')?.click();

    const isGen = state.debugMode === "generate";
    state._retestPending = true;
    const out = $("#pg-output");
    out?.classList.add("is-generating");
    if (!isGen) setPgRunLoading(true, "记忆生成中…");

    setTimeout(() => {
      const sessions = ensurePgSessions()[currentModeKey()];
      sessions.forEach((sess) => regenerateSessionMemories(sess, space, isGen));
      clearParamsDirty();
      state._retestPending = false;
      setPgRunLoading(false);
      out?.classList.remove("is-generating");
      renderOutputPanel(space);
      out?.classList.add("is-reveal");
      setTimeout(() => out?.classList.remove("is-reveal"), 600);
    }, isGen ? 900 : 1200);
  }

  function updatePgActionLabel() {
    const btn = $("#pg-run");
    const label = $("#pg-run-label");
    const ico = $("#pg-run-ico");
    const isGen = state.debugMode === "generate";
    btn?.classList.toggle("hidden", isGen);
    if (label) label.textContent = "提取记忆";
    if (ico) {
      ico.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.6 3.8L18 8.4l-4.4 1.6L12 14l-1.6-4L6 8.4l4.4-1.6L12 3z"/><path d="M5 16l.9 2.1L8 19l-2.1.9L5 22l-.9-2.1L2 19l2.1-.9L5 16z"/><path d="M18 14l.7 1.6L20.4 16.4 18.8 17.1 18 18.8l-.7-1.7L15.6 16.4l1.7-.8L18 14z"/></svg>`;
    }
    btn?.classList.remove("is-loading");
    if (btn) btn.disabled = false;
  }

  function setPgRunLoading(on, text) {
    const btn = $("#pg-run");
    const label = $("#pg-run-label");
    const ico = $("#pg-run-ico");
    if (!btn) return;
    btn.classList.toggle("is-loading", on);
    btn.disabled = !!on;
    if (label) label.textContent = on ? text || "记忆生成中…" : label.textContent;
    if (on && ico) {
      ico.innerHTML = `<svg class="pg-run-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 3a9 9 0 019 9" stroke-linecap="round"/></svg>`;
    }
    if (!on) updatePgActionLabel();
  }

  function runPlayground(space) {
    if ($("#pg-run")?.classList.contains("is-loading")) return;
    if (state.msgView === "json" && !applyMsgJsonFromEditor()) return;
    const stream = $("#chat-stream");
    const isGen = state.debugMode === "generate";
    if (isGen) {
      autoAssistantReply(space);
      return;
    }
    setPgRunLoading(true, "记忆生成中…");
    const out = $("#pg-output");
    out?.classList.add("is-generating");
    setTimeout(() => {
      const sess = currentSession();
      const preset = activeDebugPreset(space);
      if (sess) {
        sess.memories = memoriesForPreset(space, preset, sess, false);
        pushDebugLog(sess, {
          kind: "extract",
          paramId: preset?.id,
          paramLabel: preset?.name || "当前参数",
          summary: `${sess.memories.length} 条记忆 · ${presetSummary(preset)}`,
          memories: JSON.parse(JSON.stringify(sess.memories)),
        });
      }
      state.outCurrentOpen = true;
      state.outView = "output";
      renderOutputPanel(space);
      document.querySelector('#pg-out-tabs [data-out="output"]')?.click();
      setPgRunLoading(false);
      out?.classList.remove("is-generating");
      out?.classList.add("is-reveal");
      setTimeout(() => out?.classList.remove("is-reveal"), 600);
      clearParamsDirty();
      markDebugRun(360 + Math.floor(Math.random() * 180));
      refreshDebugLogModule();
    }, 1400);
    if (stream) stream.scrollTop = stream.scrollHeight;
  }

  function demoAssistantText(userText) {
    const q = (userText || "").toLowerCase();
    if (/座位|seat|舞台/.test(q)) {
      return "记得，你偏好麦迪逊广场花园靠近舞台的座位。要不要我按这个偏好帮你筛选票档？";
    }
    if (/地铁|交通|布鲁克林|路线/.test(q)) {
      return "根据你的记忆，从布鲁克林坐地铁到 MSG 大约 35 分钟。我可以按这个偏好继续帮你规划路线。";
    }
    if (/演唱会|taylor|swift|msg|巡演/.test(q)) {
      return "好的。我记得你计划参加 Taylor Swift 巡演纽约场，也偏好靠近舞台的座位。需要我继续帮你确认场次或交通吗？";
    }
    return "好的，我已结合你的历史记忆来回答。还有其他想了解的吗？";
  }

  function autoAssistantReply(space) {
    const session = currentSession();
    if (!session || state._autoReplyPending) return;
    const msgs = session.messages;
    const lastIdx = msgs.length - 1;
    const last = msgs[lastIdx];
    if (!last || last.role !== "user") return;
    if (!last.text?.trim()) return;

    state._autoReplyPending = true;
    const base = last.at ? new Date(last.at).getTime() : Date.now();
    const sp = space || spaceById(state.spaceId);
    const preset = activeDebugPreset(sp);
    const pipeline =
      state.debugMode === "generate" ? buildRecallPipeline(last.text, preset, session) : null;
    const topMem = pipeline?.memories?.[0];
    const replyText =
      state.debugMode === "generate"
        ? topMem
          ? `结合检索到的记忆，我记得：${topMem.content}。需要的话我可以继续按这个偏好帮你筛选方案。`
          : demoAssistantText(last.text)
        : demoAssistantText(last.text);

    setTimeout(() => {
      const sess = currentSession();
      if (!sess) {
        state._autoReplyPending = false;
        return;
      }
      const cur = sess.messages;
      const i = cur.length - 1;
      if (!cur[i] || cur[i].role !== "user" || cur[i].text !== last.text) {
        state._autoReplyPending = false;
        return;
      }
      cur.push({
        role: "assistant",
        text: replyText,
        at: new Date(base + 20_000).toISOString(),
      });
      if (state.debugMode === "generate") {
        const turn = pushRecallTurn(last.text, last.at);
        const mems = turn?.memories || pipeline?.memories || [];
        pushDebugLog(sess, {
          kind: "recall",
          paramId: preset?.id,
          paramLabel: preset?.name || "当前参数",
          summary: `提问「${truncate(last.text, 24)}」· 召回 ${mems.length} 条 · ${presetSummary(preset)}`,
          memories: JSON.parse(JSON.stringify(mems)),
          durationMs: pipeline?.totalMs || turn?.pipeline?.totalMs,
          pipeline: turn?.pipeline || pipeline,
        });
        clearParamsDirty();
        const hitIds = applyRecallGraphHighlight(mems, { pulse: true });
        state.outView = "graph";
        renderOutputPanel(sp);
        document.querySelector('#pg-out-tabs [data-out="graph"]')?.click();
        requestAnimationFrame(() => {
          state.graphInstance?._resize?.();
          if (hitIds.length) {
            state.graphInstance?.pulseNew(hitIds);
            syncRecallGraphBanner();
            toast(`图谱已高亮本次检索相关实体（${hitIds.filter((id) => !/^e\d/i.test(String(id))).length} 个）`);
          } else {
            toast(`已召回 ${mems.length} 条记忆`);
          }
        });
      }
      state._autoReplyPending = false;
      replayDebug($("#chat-stream"));
    }, 700);
  }

  function replayDebug(stream) {
    if (!stream) return;
    const session = currentSession();
    stream.innerHTML = "";
    (session?.messages || []).forEach((msg, idx) =>
      appendChatMessage(stream, msg, idx)
    );
    stream.scrollTop = stream.scrollHeight;
    refreshMsgJson();
    refreshSessionSelect();
  }

  function appendChatMessage(stream, msg, idx) {
    const wrap = document.createElement("div");
    wrap.className = `msg-wrap ${msg.role}`;
    wrap.dataset.idx = String(idx);
    const isUser = msg.role === "user";
    const roleLabel = isUser ? "USER" : "ASSISTANT";
    const isRecall = state.debugMode === "generate";
    const manualRole = !isRecall;
    const editable = isRecall ? isUser : true;
    wrap.innerHTML = `
      <div class="msg-meta">
        <span class="msg-role-ico" aria-hidden="true"></span>
        <button type="button" class="role-tag role-${isUser ? "user" : "assistant"}" data-role-toggle ${
          manualRole ? "" : "disabled"
        } title="${manualRole ? "点击切换角色" : roleLabel}">${roleLabel}</button>
        ${
          isRecall && !isUser
            ? ""
            : `<button type="button" class="msg-remove" data-msg-remove title="删除消息" aria-label="删除">×</button>`
        }
      </div>
      <div class="msg-card ${msg.role}">
        <div class="msg-text ${editable ? "" : "is-readonly"}" ${editable ? 'contenteditable="true"' : 'contenteditable="false"'} data-msg-text spellcheck="false">${esc(msg.text)}</div>
      </div>
      <div class="msg-stamp">${esc(fmtStamp(msg.at))}</div>`;
    stream.appendChild(wrap);
    bindMessageCard(wrap);
  }

  function bindMessageCard(card) {
    const idx = () => Number(card.dataset.idx);
    const session = () => currentSession();
    const space = () => spaceById(state.spaceId);
    const isRecall = () => state.debugMode === "generate";

    card.querySelector("[data-role-toggle]")?.addEventListener("click", () => {
      if (isRecall()) return;
      const msgs = session()?.messages;
      if (!msgs?.[idx()]) return;
      const next = msgs[idx()].role === "user" ? "assistant" : "user";
      msgs[idx()].role = next;
      card.classList.toggle("user", next === "user");
      card.classList.toggle("assistant", next === "assistant");
      const bubble = card.querySelector(".msg-card");
      bubble?.classList.toggle("user", next === "user");
      bubble?.classList.toggle("assistant", next === "assistant");
      const tag = card.querySelector("[data-role-toggle]");
      if (tag) {
        tag.textContent = next === "user" ? "USER" : "ASSISTANT";
        tag.classList.toggle("role-user", next === "user");
        tag.classList.toggle("role-assistant", next === "assistant");
      }
      refreshMsgJson();
      refreshSessionSelect();
    });

    const textEl = card.querySelector("[data-msg-text]");
    textEl?.addEventListener("input", (e) => {
      if (textEl.getAttribute("contenteditable") === "false") return;
      const msgs = session()?.messages;
      if (!msgs?.[idx()]) return;
      msgs[idx()].text = e.target.textContent || "";
      refreshMsgJson();
      refreshSessionSelect();
    });

    textEl?.addEventListener("keydown", (e) => {
      if (!isRecall()) return;
      if (e.key !== "Enter" || e.shiftKey) return;
      const msgs = session()?.messages;
      const m = msgs?.[idx()];
      if (!m || m.role !== "user") return;
      e.preventDefault();
      textEl.blur();
      autoAssistantReply(space());
    });

    textEl?.addEventListener("blur", () => {
      if (!isRecall()) return;
      const msgs = session()?.messages;
      const m = msgs?.[idx()];
      if (!m || m.role !== "user") return;
      if (idx() !== (msgs.length - 1)) return;
      autoAssistantReply(space());
    });

    card.querySelector("[data-msg-remove]")?.addEventListener("click", () => {
      const msgs = session()?.messages;
      if (!msgs) return;
      msgs.splice(idx(), 1);
      replayDebug($("#chat-stream"));
    });
  }

  function addDebugMessage(space, text = "") {
    const session = currentSession();
    if (!session) return;
    const last = session.messages[session.messages.length - 1];
    const isRecall = state.debugMode === "generate";

    // 记忆召回：末尾空 user 则聚焦；记忆生成：末尾空消息（任意角色）则聚焦
    if (!text && last && !last.text?.trim()) {
      if (isRecall ? last.role === "user" : true) {
        const stream = $("#chat-stream");
        const lastCard = stream?.querySelector(".msg-wrap:last-of-type [data-msg-text]");
        lastCard?.focus();
        return;
      }
    }

    const base = last?.at ? new Date(last.at).getTime() : Date.now();
    // 记忆生成：手动交替角色；记忆召回：固定新增为 user
    const nextRole = isRecall
      ? "user"
      : last?.role === "user"
        ? "assistant"
        : "user";
    session.messages.push({
      role: text ? "user" : nextRole,
      text: text || "",
      at: new Date(base + 30_000).toISOString(),
    });
    state.msgView = "editor";
    $$("#msg-view-toggle [data-msgview]").forEach((b) =>
      b.classList.toggle("active", b.dataset.msgview === "editor")
    );
    $("#chat-stream")?.classList.remove("hidden");
    $("#chat-json")?.classList.add("hidden");
    replayDebug($("#chat-stream"));
    const stream = $("#chat-stream");
    if (stream) {
      stream.scrollTop = stream.scrollHeight;
      const lastCard = stream.querySelector(".msg-wrap:last-of-type [data-msg-text]");
      lastCard?.focus();
    }
    if (isRecall && text?.trim()) autoAssistantReply(space || spaceById(state.spaceId));
  }

  function bindConfigForms(body, space, locked) {
    if (isEngineTab(state.configTab) && !locked) {
      const mark = () => markParamsDirty();
      body.addEventListener("input", mark);
      body.addEventListener("change", mark);
      body.addEventListener("click", (e) => {
        if (e.target.closest("[data-rerank], [data-method], .cat-del, #ex-type-add, [data-type-del]")) {
          mark();
        }
      });
    }

    $("#rt-sim", body)?.addEventListener("input", (e) => {
      const el = $("#rt-sim-val", body);
      if (el) el.textContent = Number(e.target.value).toFixed(2);
    });
    $("#rt-topk", body)?.addEventListener("input", (e) => {
      const el = $("#rt-topk-val", body);
      if (el) el.textContent = e.target.value;
    });
    $("#rt-vec-weight", body)?.addEventListener("input", (e) => {
      const el = $("#rt-vec-weight-val", body);
      if (el) el.textContent = `${Math.round(Number(e.target.value))}%`;
    });
    $("#rt-enabled", body)?.addEventListener("change", (e) => {
      const lab = $("#rt-enabled-lab", body);
      if (lab) lab.textContent = e.target.checked ? "已启用" : "已关闭";
    });
    $("#rt-rerank-on", body)?.addEventListener("change", (e) => {
      const lab = $("#rt-rerank-lab", body);
      if (lab) lab.textContent = e.target.checked ? "已启用" : "已关闭";
      body.querySelector("#rt-rerank-deps")?.classList.toggle("hidden", !e.target.checked);
    });
    $("#gov-decay", body)?.addEventListener("input", (e) => {
      const el = $("#gov-decay-val", body);
      if (el) el.textContent = e.target.value;
    });
    $("#gov-forget", body)?.addEventListener("input", (e) => {
      const el = $("#gov-forget-val", body);
      if (el) el.textContent = e.target.value;
    });
    $("#ex-prompt", body)?.addEventListener("input", (e) => {
      const count = e.target.closest(".textarea-wrap")?.querySelector(".field-count");
      if (count) count.textContent = `${e.target.value.length}/2000`;
    });
    $("#rt-prompt", body)?.addEventListener("input", (e) => {
      const count = e.target.closest(".textarea-wrap")?.querySelector(".field-count");
      if (count) count.textContent = `${e.target.value.length}/2000`;
    });
    $("#rt-rewrite", body)?.addEventListener("input", (e) => {
      const count = e.target.closest(".textarea-wrap")?.querySelector(".field-count");
      if (count) count.textContent = `${e.target.value.length}/2000`;
    });
    $("#rf-prompt", body)?.addEventListener("input", (e) => {
      const count = e.target.closest(".textarea-wrap")?.querySelector(".field-count");
      if (count) count.textContent = `${e.target.value.length}/2000`;
    });
    $("#rf-interval", body)?.addEventListener("input", (e) => {
      const el = $("#rf-interval-val", body);
      if (el) el.textContent = e.target.value;
      const em = body.querySelector(".engine-switch em");
      if (em && $("#rf-enabled", body)) em.textContent = $("#rf-enabled", body).checked ? "已启用" : "已关闭";
    });
    $("#rf-depth", body)?.addEventListener("input", (e) => {
      const el = $("#rf-depth-val", body);
      if (el) el.textContent = e.target.value;
    });
    $("#rf-enabled", body)?.addEventListener("change", (e) => {
      const em = e.target.closest(".engine-switch")?.querySelector("em");
      if (em) em.textContent = e.target.checked ? "已启用" : "已关闭";
    });

    $$("[data-method]", body).forEach((cb) => {
      cb.addEventListener("change", () => {
        const w = body.querySelector(`[data-weight="${cb.dataset.method}"]`);
        if (w) w.disabled = locked || !cb.checked;
        syncMethodDependentFields(body);
      });
    });
    syncMethodDependentFields(body);
    $$("#rt-rerank-toggle [data-rerank]", body).forEach((btn) => {
      btn.addEventListener("click", () => {
        if (locked || btn.disabled) return;
        const on = btn.dataset.rerank === "1";
        const cb = $("#rt-rerank-on", body);
        if (cb) cb.checked = on;
        $$("#rt-rerank-toggle [data-rerank]", body).forEach((b) => {
          b.classList.toggle("active", b.dataset.rerank === btn.dataset.rerank);
        });
        syncRerankFields(body);
      });
    });
    syncRerankFields(body);
    $$("[data-weight]", body).forEach((sl) => {
      sl.addEventListener("input", () => {
        const lab = body.querySelector(`[data-weight-label="${sl.dataset.weight}"]`);
        if (lab) lab.textContent = Number(sl.value).toFixed(2);
      });
    });

    $("#save-extract", body)?.addEventListener("click", () => saveExtract(body, space));
    $("#save-retrieve", body)?.addEventListener("click", () => saveRetrieve(body, space));
    $("#save-gov", body)?.addEventListener("click", () => saveGov(body, space));
    $("#save-engine", body)?.addEventListener("click", () => {
      saveActiveEngine(body, space);
      toast("已保存");
    });
    $("#engine-save-as", body)?.addEventListener("click", () => saveEngineAsVersion(body, space));
    $("#engine-version-select", body)?.addEventListener("change", (e) => {
      if (isEngineTab(state.configTab)) saveActiveEngine(body, space);
      state.engineVersionId = e.target.value;
      renderSpaceConfig($("#content"));
    });
    $("#engine-version-del", body)?.addEventListener("click", () => {
      const list = ensureParamPresets(space);
      const ver = activeEngineVersion(space);
      if (!ver || ver.builtin) return;
      if (!window.confirm(`删除参数版本「${ver.name}」？`)) return;
      const idx = list.findIndex((p) => p.id === ver.id);
      if (idx >= 0) list.splice(idx, 1);
      if (state.debugParamId === ver.id) state.debugParamId = "preset-current";
      state.engineVersionId = "preset-current";
      toast("已删除参数版本");
      renderSpaceConfig($("#content"));
    });
    $("#engine-version-apply", body)?.addEventListener("click", () => {
      saveActiveEngine(body, space);
      const ver = activeEngineVersion(space);
      if (!ver || ver.id === "preset-current") return;
      applyVersionToSpace(space, ver);
      state.engineVersionId = "preset-current";
      state.debugParamId = "preset-current";
      toast("已设为当前空间配置");
      renderSpaceConfig($("#content"));
    });

    const hideEmptyTypeAdd = () => {
      const addRow = body.querySelector(".type-card-add");
      if (!addRow || addRow.classList.contains("hidden")) return;
      const name = $("#ex-type-name-new", body)?.value.trim() || "";
      const desc = $("#ex-type-desc-new", body)?.value.trim() || "";
      if (!name && !desc) addRow.classList.add("hidden");
    };

    body._typeAddAbort?.abort();
    body._typeAddAbort = new AbortController();
    document.addEventListener(
      "pointerdown",
      (e) => {
        const addRow = body.querySelector(".type-card-add");
        if (!addRow || addRow.classList.contains("hidden")) return;
        if (addRow.contains(e.target) || e.target.closest("#ex-type-add")) return;
        hideEmptyTypeAdd();
      },
      { capture: true, signal: body._typeAddAbort.signal }
    );

    $("#ex-type-add", body)?.addEventListener("click", () => {
      const addRow = body.querySelector(".type-card-add");
      if (addRow?.classList.contains("hidden")) {
        addRow.classList.remove("hidden");
        $("#ex-type-name-new", body)?.focus();
        return;
      }
      const nameEl = $("#ex-type-name-new", body);
      const descEl = $("#ex-type-desc-new", body);
      const name = nameEl?.value.trim();
      if (!name) {
        toast("请填写类型名称");
        nameEl?.focus();
        return;
      }
      const list = $("#ex-type-list", body);
      const idx = list?.querySelectorAll(".type-card[data-type-idx]").length || 0;
      const row = document.createElement("div");
      row.className = "type-card";
      row.dataset.typeIdx = String(idx);
      row.innerHTML = `
        <div class="type-card-body">
          <input class="input cat-name" data-type-name value="${esc(name)}" placeholder="类型名称" />
          <input class="input cat-desc" data-type-desc value="${esc(descEl?.value.trim() || "")}" placeholder="类型说明" />
        </div>
        <button type="button" class="cat-del" data-type-del title="删除" aria-label="删除">×</button>`;
      const link = $("#ex-type-add", body);
      if (addRow) list.insertBefore(row, addRow);
      else if (link) list.insertBefore(row, link);
      else list?.appendChild(row);
      if (nameEl) nameEl.value = "";
      if (descEl) descEl.value = "";
      addRow?.classList.add("hidden");
      row.querySelector("[data-type-del]")?.addEventListener("click", () => row.remove());
    });

    $$("[data-type-del]", body).forEach((btn) => {
      btn.addEventListener("click", () => btn.closest(".type-card")?.remove());
    });
  }

  function collectExtractTypes(body) {
    return $$("#ex-type-list .type-card[data-type-idx]", body)
      .map((row) => ({
        name: row.querySelector("[data-type-name]")?.value.trim() || "",
        description: row.querySelector("[data-type-desc]")?.value.trim() || "",
      }))
      .filter((t) => t.name);
  }

  function saveExtract(body, space) {
    if (!writeExtractToConfig(body, space.config)) return;
    syncPresetCurrent(space);
  }

  function saveRetrieve(body, space) {
    if (!writeRetrieveToConfig(body, space.config)) return;
    syncPresetCurrent(space);
  }

  function saveGov(body, space) {
    if (!writeGovToConfig(body, space.config)) return;
    syncPresetCurrent(space);
  }

  function saveReflect(body, space) {
    if (!writeReflectToConfig(body, space.config)) return;
    syncPresetCurrent(space);
  }

  /* ---------- memories ---------- */
  function memoryStatsForUser(uid) {
    const all = allExtractedMemories(uid);
    const longList = all.filter((m) => m.tier === "long");
    const forgotten = forgetPoolMemories(uid);
    const mid = MEMORA_DATA.memories.mid.filter((m) => m.userId === uid);
    return {
      total: all.length,
      long: longList.length,
      forgotten: forgotten.length,
      sense: uid === "u-sarah" ? 2 : Math.min(mid.length, 2),
      work: uid === "u-sarah" ? 4 : Math.max(0, mid.length),
      emotion: uid === "u-sarah" ? 4 : 1,
      short: uid === "u-sarah" ? 2 : mid.length,
      implicit: uid === "u-sarah" ? 50 : 12,
      episodic: uid === "u-sarah" ? 56 : 18,
      explicit: uid === "u-sarah" ? 476 : 64,
      mid,
      longList,
      all,
      forgottenList: forgotten,
    };
  }

  function demoMemoryExtras(uid) {
    const catalog = {
      "u-sarah": [
        { id: "m-x-1", type: "偏好需求", content: "偏好周末白天场次，避开工作日晚高峰", createdAt: "2025-10-12T14:20:00", tier: "mid" },
        { id: "m-x-2", type: "生活事件", content: "上周末在布鲁克林参加小型 Livehouse", createdAt: "2025-10-10T21:05:00", tier: "mid" },
        { id: "m-x-3", type: "任务计划", content: "计划在巡演前完成酒店与交通预订", createdAt: "2025-10-15T09:40:00", tier: "mid" },
        { id: "m-x-4", type: "对话回复风格", content: "喜欢简洁列表式回答，少用冗长铺垫", createdAt: "2025-09-28T11:10:00", tier: "long" },
        { id: "m-x-5", type: "偏好需求", content: "对站票接受度低，优先有座位区域", createdAt: "2025-09-18T16:00:00", tier: "mid", risk: true, activation: 0.28, lastActiveAt: "2025-10-01T08:00:00" },
        { id: "m-x-6", type: "生活事件", content: "曾咨询过另一位艺人同城场次但未购票", createdAt: "2025-08-22T13:30:00", tier: "mid", risk: true, activation: 0.19, lastActiveAt: "2025-09-05T19:20:00" },
        { id: "m-x-7", type: "事实", content: "临时改看远区票价的一次询价", createdAt: "2025-08-10T17:07:00", tier: "mid", risk: true, activation: 0.12, lastActiveAt: "2025-08-21T10:00:00" },
        { id: "m-x-8", type: "偏好需求", content: "餐饮推荐偏好清淡，避开重油辣", createdAt: "2025-07-30T12:32:00", tier: "mid", risk: true, activation: 0.22, lastActiveAt: "2025-08-18T12:00:00" },
        { id: "m-x-9", type: "任务计划", content: "考虑拼车前往场馆但未最终确认", createdAt: "2025-07-12T09:00:00", tier: "mid", risk: true, activation: 0.15, lastActiveAt: "2025-07-28T15:40:00" },
        { id: "m-x-10", type: "生活事件", content: "查询过与本次演出无关的城市展览", createdAt: "2025-06-20T18:00:00", tier: "mid", risk: true, activation: 0.09, lastActiveAt: "2025-07-01T11:00:00" },
      ],
      "u-chen": [
        { id: "m-c-1", type: "任务计划", content: "计划连续休年假 5 天外出", createdAt: "2025-12-02T10:00:00", tier: "mid" },
        { id: "m-c-2", type: "事实", content: "已确认年假需提前 3 个工作日申请", createdAt: "2025-11-28T09:15:00", tier: "mid" },
        { id: "m-c-3", type: "偏好需求", content: "倾向线上提交请假，减少线下跑腿", createdAt: "2025-11-20T14:40:00", tier: "long" },
        { id: "m-c-4", type: "生活事件", content: "曾浏览过通用福利介绍但未继续", createdAt: "2025-10-08T16:20:00", tier: "mid", risk: true, activation: 0.18, lastActiveAt: "2025-10-20T09:00:00" },
        { id: "m-c-5", type: "事实", content: "一次过期的培训报名提醒", createdAt: "2025-09-14T11:00:00", tier: "mid", risk: true, activation: 0.11, lastActiveAt: "2025-09-30T08:30:00" },
        { id: "m-c-6", type: "偏好需求", content: "临时关注过跨部门轮岗但未跟进", createdAt: "2025-08-05T13:00:00", tier: "mid", risk: true, activation: 0.14, lastActiveAt: "2025-08-22T17:00:00" },
      ],
      "u-wang": [
        { id: "m-w-1", type: "偏好需求", content: "客户跟进偏好先发纪要再电话", createdAt: "2025-11-01T10:00:00", tier: "mid" },
        { id: "m-w-2", type: "任务计划", content: "本周需完成两家重点客户回访", createdAt: "2025-11-03T09:30:00", tier: "mid" },
        { id: "m-w-3", type: "事实", content: "过期的产品促销话术草稿", createdAt: "2025-09-10T15:00:00", tier: "mid", risk: true, activation: 0.16, lastActiveAt: "2025-09-25T12:00:00" },
      ],
    };
    return (catalog[uid] || catalog["u-sarah"]).map((m) => ({
      userId: uid,
      spaceId: null,
      source: "demo-extract",
      score: null,
      labels: [],
      ...m,
    }));
  }

  function allExtractedMemories(uid) {
    const mid = MEMORA_DATA.memories.mid
      .filter((m) => m.userId === uid)
      .map((m) => ({ ...m, tier: "mid", lastActiveAt: m.lastActiveAt || m.createdAt, activation: m.activation ?? 0.72 }));
    const long = MEMORA_DATA.memories.long
      .filter((m) => m.userId === uid)
      .map((m) => ({ ...m, tier: "long", lastActiveAt: m.lastActiveAt || m.createdAt, activation: m.activation ?? 0.88 }));
    const extras = demoMemoryExtras(uid);
    return [...mid, ...long, ...extras].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  function forgetPoolMemories(uid) {
    return allExtractedMemories(uid)
      .filter((m) => m.risk || (typeof m.activation === "number" && m.activation < 0.35))
      .sort((a, b) => (a.activation ?? 1) - (b.activation ?? 1));
  }

  function forgetCurveSeries(uid) {
    const pool = forgetPoolMemories(uid);
    const base = Math.max(4, pool.length);
    const points = [];
    for (let d = 0; d <= 30; d += 1) {
      const wave = Math.sin(d / 5) * 0.8 + Math.cos(d / 9) * 0.4;
      const count = Math.max(0, Math.round(base * (0.35 + d / 45) + wave + (uid === "u-sarah" ? 1 : 0)));
      points.push({ day: d, count });
    }
    return points;
  }

  function paginateList(list, page, pageSize = 6) {
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safe = Math.min(Math.max(1, page), pages);
    const start = (safe - 1) * pageSize;
    return { page: safe, pages, total, items: list.slice(start, start + pageSize), pageSize };
  }

  function renderMemCardItem(m, kind) {
    return `
      <button type="button" class="um-mem-item" data-view-mem="${esc(m.id)}" data-kind="${kind}">
        <p class="um-mem-text">${esc(m.content)}</p>
        <div class="um-mem-meta">
          <span class="mem-type-tag ${memTypeClass(m.type)}"><i class="mem-dot" aria-hidden="true"></i>${esc(m.type)}</span>
          <span class="um-mem-time">${esc(fmtMemTime(m.createdAt))}</span>
        </div>
      </button>`;
  }

  function bankPersona(uid) {
    const map = {
      "u-sarah": {
        count: 128,
        name: "Sarah Smith",
        gender: "女",
        title: "产品经理",
        rank: "P6",
        age: 29,
        tags: {
          general: ["外向", "计划导向", "细节控"],
          rd: ["需求分析", "原型协作", "A/B 实验"],
          office: ["周报结构化", "会议纪要"],
          business: ["演出票务", "场馆选座", "城市出行"],
        },
        wordCloud: [
          { w: "MSG", n: 5 },
          { w: "近台座位", n: 5 },
          { w: "Taylor Swift", n: 4 },
          { w: "布鲁克林", n: 4 },
          { w: "地铁", n: 3 },
          { w: "巡演", n: 3 },
          { w: "纽约", n: 3 },
          { w: "周末场", n: 2 },
          { w: "酒店", n: 2 },
          { w: "Livehouse", n: 2 },
          { w: "站票", n: 1 },
          { w: "清淡餐饮", n: 1 },
        ],
        identity: "演出常客",
        field: "现场娱乐 / 城市出行",
        activities: "看演出 / 选座 / 交通规划",
        personality:
          "决策偏具体、可执行。会反复确认座位位置与到达方式，偏好用明确地点和场次描述需求，而不是笼统的「随便看看」。",
        values: "重视现场体验与座位位置，在意出行是否省时、路线是否熟悉，愿意为靠近舞台付出额外规划。",
        recent: "正在安排 Taylor Swift 巡演纽约场，关注麦迪逊广场花园近台座位，并查过从布鲁克林出发的地铁路线。",
        recentTags: ["锁定 MSG 纽约场", "近台座位", "布鲁克林地铁", "巡演行程"],
        interests: [
          { name: "演唱会", pct: 34, color: "#2563eb" },
          { name: "座位偏好", pct: 22, color: "#7c3aed" },
          { name: "城市出行", pct: 20, color: "#0d9488" },
          { name: "巡演计划", pct: 14, color: "#f59e0b" },
          { name: "其他", pct: 10, color: "#94a3b8" },
        ],
        keywords: ["Taylor Swift", "MSG", "近台座位", "布鲁克林", "地铁", "巡演", "纽约"],
        changes: [
          { name: "近台座位", delta: "↑ 23%", up: true },
          { name: "巡演场次", delta: "↑ 18%", up: true },
          { name: "地铁出行", delta: "↑ 12%", up: true },
          { name: "其他演出", delta: "→ 2%", up: false },
        ],
        buckets: {
          new: ["东京/纽约场次确认", "近台座位筛选"],
          keep: ["麦迪逊广场花园", "舞台视线"],
          down: ["随机购票", "自驾前往"],
        },
        overview: "当前记忆主要集中在演出场次、座位偏好和城市交通。用户不是泛泛浏览，而是围绕一场确定的演出做连续决策。",
        findings: [
          "演出与场馆类记忆占比最高",
          "座位偏好已稳定为靠近舞台",
          "出行记忆与具体场馆强关联",
          "近期计划类记忆增长明显",
        ],
        behavior: "活跃提问集中在确定行程前后：先锁定演出与座位，再补交通。工作日偏向查询，临近演出时计划类记忆被反复强化。",
        growth: "长期关注现场演出体验。近期轨迹从「想看 Taylor Swift」→「锁定 MSG 纽约场」→「按近台座位与地铁路线落地」。",
      },
      "u-chen": {
        count: 54,
        name: "陈默",
        gender: "男",
        title: "人力资源专员",
        rank: "P5",
        age: 32,
        tags: {
          general: ["谨慎", "规则导向", "表达克制"],
          rd: ["制度检索", "流程核对"],
          office: ["请假审批", "考勤确认"],
          business: ["年假政策", "培训发展"],
        },
        wordCloud: [
          { w: "年假", n: 5 },
          { w: "考勤", n: 4 },
          { w: "审批", n: 4 },
          { w: "制度", n: 3 },
          { w: "培训", n: 2 },
          { w: "连续休假", n: 3 },
          { w: "线上申请", n: 2 },
          { w: "权益", n: 2 },
          { w: "流程", n: 2 },
          { w: "轮岗", n: 1 },
        ],
        identity: "企业员工",
        field: "人力资源 / 制度咨询",
        activities: "查制度 / 请假 / 政策确认",
        personality: "提问偏事实核对，习惯先确认规则边界，再决定个人安排。表达克制，少用情绪化描述。",
        values: "重视制度准确与个人权益边界，关注假期、流程是否可执行。",
        recent: "近期多次核对请假与考勤规则，并关联到个人行程安排。",
        recentTags: ["核对年假", "确认考勤", "关联行程"],
        interests: [
          { name: "制度条款", pct: 36, color: "#2563eb" },
          { name: "假期安排", pct: 24, color: "#0d9488" },
          { name: "流程办理", pct: 18, color: "#7c3aed" },
          { name: "培训发展", pct: 12, color: "#f59e0b" },
          { name: "其他", pct: 10, color: "#94a3b8" },
        ],
        keywords: ["假期", "考勤", "制度", "审批", "培训"],
        changes: [
          { name: "假期规则", delta: "↑ 16%", up: true },
          { name: "审批流程", delta: "↑ 9%", up: true },
          { name: "培训", delta: "→ 1%", up: false },
        ],
        buckets: { new: ["年假核算"], keep: ["考勤制度"], down: ["通用福利浏览"] },
        overview: "记忆集中在人事制度与个人假期，属于「先核对规则、再做安排」的模式。",
        findings: ["制度类记忆占比最高", "假期问题会反复强化", "个人行程与制度存在关联"],
        behavior: "工作日查询更集中，周末几乎不产生新的制度类记忆。",
        growth: "从泛问公司政策，逐步收束到与自己相关的假期和审批。",
      },
      "u-wang": {
        count: 28,
        name: "王琦",
        gender: "女",
        title: "客户经理",
        rank: "M1",
        age: 27,
        tags: {
          general: ["主动跟进", "结果导向"],
          rd: ["话术沉淀"],
          office: ["客户纪要", "回访清单"],
          business: ["重点客户", "产品促销", "合规话术"],
        },
        wordCloud: [
          { w: "客户回访", n: 5 },
          { w: "纪要", n: 4 },
          { w: "促销", n: 3 },
          { w: "合规", n: 3 },
          { w: "电话跟进", n: 2 },
          { w: "重点客户", n: 4 },
          { w: "话术", n: 2 },
        ],
        identity: "客户经理",
        field: "销售 / CRM",
        activities: "跟进 / 回访 / 话术",
        personality: "行动快，喜欢先列任务再沟通。",
        values: "重视转化与合规边界。",
        recent: "本周聚焦两家重点客户回访。",
        recentTags: ["回访", "纪要", "促销"],
        interests: [
          { name: "客户经营", pct: 40, color: "#2563eb" },
          { name: "产品话术", pct: 25, color: "#7c3aed" },
          { name: "合规", pct: 20, color: "#0d9488" },
          { name: "其他", pct: 15, color: "#94a3b8" },
        ],
        keywords: ["回访", "纪要", "促销", "合规"],
        changes: [{ name: "回访", delta: "↑ 12%", up: true }],
        buckets: { new: ["重点客户"], keep: ["合规话术"], down: ["过期促销"] },
        overview: "记忆围绕客户经营与话术沉淀。",
        findings: ["回访类记忆增长", "促销话术易衰减"],
        behavior: "工作日密集产生任务类记忆。",
        growth: "从泛话术浏览转向重点客户跟进。",
      },
    };
    return map[uid] || map["u-sarah"];
  }

  function renderBankNav(pane) {
    const ico = {
      about: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3"/><path d="M5 19a7 7 0 0114 0"/></svg>`,
      interest: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="8"/></svg>`,
      insight: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3 11v1h6v-1a6 6 0 00-3-11z"/></svg>`,
      evolve: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12a8 8 0 0114-5M20 12a8 8 0 01-14 5"/><path d="M16 3v4h4M8 21v-4H4"/></svg>`,
      forget: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M9 12h6"/></svg>`,
    };
    const items = [
      ["about", "关于我"],
      ["interest", "兴趣分布"],
      ["insight", "记忆洞察"],
      ["evolve", "记忆演化"],
      ["forget", "遗忘事件"],
    ];
    return `
      <nav class="um-subnav" aria-label="记忆库视图">
        ${items
          .map(([id, label]) => {
            const on =
              !state.bankOverlayClosed &&
              (pane === id ||
              (id === "evolve" && (pane === "evolve" || pane === "evolve-all")) ||
              (id === "forget" && pane === "forget"));
            return `<button type="button" class="um-nav-item ${on ? "active" : ""}" data-bank-pane="${id}">
              <span class="um-nav-ico" aria-hidden="true">${ico[id]}</span>
              <span>${label}</span>
            </button>`;
          })
          .join("")}
      </nav>`;
  }

  function renderEvolveMenuCard() {
    const forgetOn = state.bankPane === "forget";
    return `
      <aside class="um-overlay-card" id="um-overlay-card">
        <header class="um-overlay-hd">
          <h3>记忆演化事件</h3>
          <button type="button" class="icon-btn" data-overlay-close aria-label="关闭">×</button>
        </header>
        <div class="um-overlay-bd um-overlay-bd-menu">
          <button type="button" class="um-overlay-row ${forgetOn ? "" : "active"}" data-evolve-kind="reflect">
            <div class="um-overlay-row-text">
              <strong>反思事件</strong>
              <span>反思引擎迭代沉淀的认知记录</span>
            </div>
            <b class="um-overlay-count">51</b>
          </button>
          <button type="button" class="um-overlay-row ${forgetOn ? "active" : ""}" data-evolve-kind="forget">
            <div class="um-overlay-row-text">
              <strong>遗忘事件</strong>
              <span>人工遗忘与引擎淘汰的留痕</span>
            </div>
            <b class="um-overlay-count">0</b>
          </button>
        </div>
        <footer class="um-overlay-ft">
          <button type="button" class="btn um-overlay-all" data-bank-pane="evolve-all">查看全部事件</button>
        </footer>
      </aside>`;
  }

  function wrapOverlayCard(title, bodyHtml, { closable = true } = {}) {
    return `
      <aside class="um-overlay-card um-overlay-card-scroll" id="um-overlay-card">
        <header class="um-overlay-hd">
          <h3>${esc(title)}</h3>
          ${closable ? `<button type="button" class="icon-btn" data-overlay-close aria-label="关闭">×</button>` : ""}
        </header>
        <div class="um-overlay-bd">${bodyHtml}</div>
      </aside>`;
  }

  function renderBankOverlay(pane, uid) {
    if (state.bankOverlayClosed) return "";
    const p = bankPersona(uid);
    if (pane === "evolve") return renderEvolveMenuCard();
    if (pane === "about") {
      return wrapOverlayCard(
        "关于我",
        `<p class="um-overlay-sub">基于 ${p.count} 条记忆生成 · 最近更新 2 小时前</p>
        <div class="about-id">
          <span class="about-avatar" aria-hidden="true">${esc((p.identity || "用").slice(0, 1))}</span>
          <div>
            <span>用户身份</span>
            <strong>${esc(p.identity)}</strong>
          </div>
        </div>
        <div class="about-meta">
          <div><span>职业领域</span><b>${esc(p.field)}</b></div>
          <div><span>主要活动</span><b>${esc(p.activities)}</b></div>
        </div>
        <section class="um-pane-block"><h4>性格特点</h4><p>${esc(p.personality)}</p></section>
        <section class="um-pane-block"><h4>核心价值观</h4><p>${esc(p.values)}</p></section>
        <section class="um-pane-block"><h4>近期状态</h4>
          <div class="about-tags">${(p.recentTags || []).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
        </section>`
      );
    }
    if (pane === "interest") {
      let acc = 0;
      const stops = p.interests
        .map((it) => {
          const start = acc;
          acc += it.pct;
          return `${it.color} ${start}% ${acc}%`;
        })
        .join(", ");
      return wrapOverlayCard(
        "兴趣分布",
        `<p class="um-overlay-sub">由长期记忆中的主题词归纳，不是手工标签。</p>
        <div class="interest-layout interest-layout-compact">
          <div class="interest-donut" style="background: conic-gradient(${stops})"></div>
          <ul class="interest-legend">
            ${p.interests
              .map(
                (it) =>
                  `<li><i style="background:${it.color}"></i><span>${esc(it.name)}</span><b>${it.pct}%</b></li>`
              )
              .join("")}
          </ul>
        </div>
        <section class="um-pane-block"><h4>兴趣关键词</h4>
          <div class="interest-tags">${p.keywords.map((k) => `<span>${esc(k)}</span>`).join("")}</div>
        </section>
        <section class="um-pane-block"><h4>近期兴趣变化</h4>
          <ul class="interest-changes">
            ${p.changes
              .map(
                (c) =>
                  `<li><span>${esc(c.name)}</span><b class="${c.up ? "is-up" : ""}">${esc(c.delta)}</b></li>`
              )
              .join("")}
          </ul>
        </section>`
      );
    }
    if (pane === "insight") {
      return wrapOverlayCard(
        "记忆洞察",
        `<section class="um-pane-block"><h4>总体概述</h4><p>${esc(p.overview)}</p></section>
        <section class="um-pane-block"><h4>关键发现</h4>
          <ul class="insight-findings">${p.findings.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        </section>
        <section class="um-pane-block"><h4>行为模式</h4><p>${esc(p.behavior)}</p></section>
        <section class="um-pane-block"><h4>成长轨迹</h4><p>${esc(p.growth)}</p></section>`
      );
    }
    if (pane === "forget") {
      const rows = [
        ["10/21 17:07", "一次未成交的远区票价询价", "超时过期"],
        ["10/21 17:07", "临时改看其他艺人的念头", "超过保留周期"],
        ["10/20 12:32", "与本次演出无关的餐饮推荐", "低相关性"],
      ];
      return wrapOverlayCard(
        "遗忘事件",
        `<p class="um-overlay-sub">过期或低相关记忆可恢复，而不是直接删除。</p>
        <div class="um-overlay-stats">
          <div><span>总遗忘</span><strong>18</strong></div>
          <div><span>可恢复</span><strong>18</strong></div>
        </div>
        <ul class="um-overlay-list">
          ${rows
            .map(
              (r) =>
                `<li>
                  <div><strong>${esc(r[1])}</strong><span>${esc(r[0])} · ${esc(r[2])}</span></div>
                  <button type="button" class="btn btn-secondary forget-restore">恢复</button>
                </li>`
            )
            .join("")}
        </ul>
        <button type="button" class="btn um-overlay-all" data-bank-pane="evolve" style="margin-top:12px">返回演化事件</button>`
      );
    }
    if (pane === "evolve-all") {
      return wrapOverlayCard("全部演化事件", renderEvolvePane());
    }
    return "";
  }

  function renderAboutPane(p) {
    return `
      <div class="um-pane">
        <header class="um-pane-hd">
          <h3>关于我</h3>
          <p>基于 ${p.count} 条记忆生成 · 最近更新 2 小时前</p>
        </header>
        <section class="um-pane-block">
          <h4>基本画像</h4>
          <dl class="um-kv">
            <div><dt>用户身份</dt><dd>${esc(p.identity)}</dd></div>
            <div><dt>职业领域</dt><dd>${esc(p.field)}</dd></div>
            <div><dt>主要活动</dt><dd>${esc(p.activities)}</dd></div>
          </dl>
        </section>
        <section class="um-pane-block">
          <h4>性格特点</h4>
          <p>${esc(p.personality)}</p>
        </section>
        <section class="um-pane-block">
          <h4>核心价值观</h4>
          <p>${esc(p.values)}</p>
        </section>
        <section class="um-pane-block">
          <h4>近期状态</h4>
          <p>${esc(p.recent)}</p>
        </section>
      </div>`;
  }

  function renderInterestPane(p) {
    let acc = 0;
    const stops = p.interests
      .map((it) => {
        const start = acc;
        acc += it.pct;
        return `${it.color} ${start}% ${acc}%`;
      })
      .join(", ");
    return `
      <div class="um-pane">
        <header class="um-pane-hd">
          <h3>兴趣分布</h3>
          <p>由长期记忆中的主题词归纳，不是手工标签。</p>
        </header>
        <div class="interest-layout">
          <div class="interest-donut" style="background: conic-gradient(${stops})"></div>
          <ul class="interest-legend">
            ${p.interests
              .map(
                (it) =>
                  `<li><i style="background:${it.color}"></i><span>${esc(it.name)}</span><b>${it.pct}%</b></li>`
              )
              .join("")}
          </ul>
        </div>
        <section class="um-pane-block">
          <h4>兴趣关键词</h4>
          <div class="interest-tags">
            ${p.keywords.map((k) => `<span>${esc(k)}</span>`).join("")}
          </div>
        </section>
        <section class="um-pane-block">
          <h4>近期兴趣变化</h4>
          <ul class="interest-changes">
            ${p.changes
              .map(
                (c) =>
                  `<li><span>${esc(c.name)}</span><b class="${c.up ? "is-up" : ""}">${esc(c.delta)}</b></li>`
              )
              .join("")}
          </ul>
        </section>
        <section class="um-pane-block">
          <h4>兴趣变化</h4>
          <div class="interest-buckets">
            <div><span>近期新增</span>${p.buckets.new.map((x) => `<p>${esc(x)}</p>`).join("")}</div>
            <div><span>持续关注</span>${p.buckets.keep.map((x) => `<p>${esc(x)}</p>`).join("")}</div>
            <div><span>兴趣下降</span>${p.buckets.down.map((x) => `<p>${esc(x)}</p>`).join("")}</div>
          </div>
        </section>
      </div>`;
  }

  function renderInsightCards(p) {
    return `
      <div class="insight-cards">
        <section class="um-pane-block">
          <h4>总体概述</h4>
          <p>${esc(p.overview)}</p>
        </section>
        <section class="um-pane-block">
          <h4>关键发现</h4>
          <ul class="insight-findings">
            ${p.findings.map((f) => `<li>${esc(f)}</li>`).join("")}
          </ul>
        </section>
        <section class="um-pane-block">
          <h4>行为模式</h4>
          <p>${esc(p.behavior)}</p>
        </section>
        <section class="um-pane-block">
          <h4>成长轨迹</h4>
          <p>${esc(p.growth)}</p>
        </section>
      </div>`;
  }

  function renderEvolvePane() {
    const events = [
      { date: "10/17", type: "新增", text: "计划参加 Taylor Swift 巡演纽约场" },
      { date: "10/17", type: "强化", text: "近台座位偏好被再次确认" },
      { date: "10/17", type: "更新", text: "出行方式明确为布鲁克林地铁" },
      { date: "10/20", type: "关联", text: "近台座位 ↔ MSG 纽约场" },
      { date: "11/02", type: "遗忘", text: "一次过期的票价询价未再被召回" },
    ];
    return `
      <p class="um-overlay-sub">记忆如何被新增、强化、更新、关联与遗忘。</p>
      <div class="evo-stats evo-stats-compact">
        <div><span>新增</span><strong>32</strong></div>
        <div><span>强化</span><strong>18</strong></div>
        <div><span>更新</span><strong>12</strong></div>
        <div><span>遗忘</span><strong>5</strong></div>
      </div>
      <section class="um-pane-block">
        <h4>记忆时间线</h4>
        <ol class="evo-timeline">
          ${events
            .map(
              (e) =>
                `<li><time>${esc(e.date)}</time><span class="evo-type">${esc(e.type)}</span><p>${esc(e.text)}</p></li>`
            )
            .join("")}
        </ol>
      </section>
      <button type="button" class="btn um-overlay-all" data-bank-pane="evolve">返回演化事件</button>`;
  }

  function renderForgetPane() {
    const rows = [
      ["10/21 17:07", "一次未成交的远区票价询价", "对话片段", "超时过期"],
      ["10/21 17:07", "临时改看其他艺人的念头", "来源陈述", "超过保留周期"],
      ["10/20 12:32", "与本次演出无关的餐饮推荐", "对话片段", "低相关性"],
    ];
    return `
      <div class="um-pane">
        <header class="um-pane-hd">
          <h3>遗忘事件</h3>
          <p>遗忘是记忆生命周期的一部分，过期或低相关记忆可恢复，而不是直接删除。</p>
        </header>
        <div class="evo-stats">
          <div><span>总遗忘数</span><strong>18</strong></div>
          <div><span>自动遗忘</span><strong>18</strong></div>
          <div><span>手动遗忘</span><strong>0</strong></div>
          <div><span>可恢复</span><strong>18</strong></div>
        </div>
        <div class="forget-table-wrap">
          <table class="forget-table">
            <thead><tr><th>时间</th><th>记忆内容</th><th>类型</th><th>原因</th><th>操作</th></tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) =>
                    `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td><button type="button" class="btn btn-secondary forget-restore">恢复</button></td></tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function layoutWordCloud(words) {
    const colors = ["#5b5fc7", "#2563eb", "#0d9488", "#d46b08", "#c9344e", "#7c3aed", "#0891b2"];
    const sorted = [...words].sort((a, b) => b.n - a.n);
    const maxN = Math.max(1, ...sorted.map((w) => w.n));
    return sorted.map((word, i) => ({
      text: word.w,
      size: 13 + Math.round((word.n / maxN) * 11),
      color: colors[i % colors.length],
    }));
  }

  function renderPortraitPanel(user, persona) {
    const tags = persona.tags || { general: [], rd: [], office: [], business: [] };
    const cloud = persona.wordCloud || [];
    const tagBlock = (label, list) => `
      <div class="up-tag-block">
        <span class="up-tag-label">${label}</span>
        <div class="up-tags">${(list || []).map((t) => `<span>${esc(t)}</span>`).join("") || `<em class="up-empty">暂无</em>`}</div>
      </div>`;
    return `
      <aside class="up-panel">
        <div class="up-hero">
          <span class="up-avatar" aria-hidden="true">${esc(user?.avatar || (persona.name || "?").slice(0, 1))}</span>
          <div>
            <h3>${esc(user?.name || persona.name || "用户")}</h3>
            <p>${esc(persona.title || persona.identity || "记忆主体")}</p>
          </div>
        </div>
        <ul class="up-attrs">
          <li><span>性别</span><b>${esc(persona.gender || "—")}</b></li>
          <li><span>岗位</span><b>${esc(persona.title || "—")}</b></li>
          <li><span>职级</span><b>${esc(persona.rank || "—")}</b></li>
          <li><span>年龄</span><b>${persona.age != null ? `${persona.age} 岁` : "—"}</b></li>
        </ul>
        <div class="up-tags-section">
          ${tagBlock("通用标签", tags.general)}
          ${tagBlock("研发标签", tags.rd)}
          ${tagBlock("办公标签", tags.office)}
          ${tagBlock("业务标签", tags.business)}
        </div>
        <div class="up-cloud-block">
          <span class="up-tag-label">记忆高频词云</span>
          <div class="up-cloud" aria-label="记忆高频词云">
            ${layoutWordCloud(cloud)
              .map(
                (w) =>
                  `<span class="up-cloud-word" style="font-size:${w.size}px;color:${w.color}">${esc(w.text)}</span>`
              )
              .join("")}
          </div>
        </div>
      </aside>`;
  }

  function forgetWeekStats(uid) {
    const seed = uid === "u-sarah" ? 1 : uid === "u-chen" ? 2 : 3;
    const forgottenBase = [2, 1, 3, 2, 4, 3, 2];
    const addedBase = [4, 3, 5, 2, 6, 4, 3];
    const points = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const idx = 6 - i;
      const forgotten = forgottenBase[idx] + ((seed + idx) % 2);
      const added = addedBase[idx] + (seed % 3);
      points.push({
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        forgotten,
        added,
        ratio: forgotten ? added / forgotten : added,
      });
    }
    return points;
  }

  function renderMiniLineChart(points, { yKey, color, fillId, aria, formatY }) {
    const w = 420;
    const h = 156;
    const padL = 36;
    const padR = 12;
    const padT = 14;
    const padB = 28;
    const vals = points.map((p) => Number(p[yKey]) || 0);
    const maxV = Math.max(0.01, ...vals);
    const xy = (i, v) => {
      const x = padL + (points.length <= 1 ? 0 : i / (points.length - 1)) * (w - padL - padR);
      const y = padT + (1 - Math.max(0, v) / maxV) * (h - padT - padB);
      return { x, y };
    };
    const line = points
      .map((p, i) => {
        const { x, y } = xy(i, Number(p[yKey]) || 0);
        return `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    const first = xy(0, Number(points[0]?.[yKey]) || 0);
    const last = xy(points.length - 1, Number(points[points.length - 1]?.[yKey]) || 0);
    const area = `${line} L ${last.x.toFixed(1)} ${(h - padB).toFixed(1)} L ${first.x.toFixed(1)} ${(h - padB).toFixed(1)} Z`;
    const yTicks = [0, maxV / 2, maxV];
    const fmt = formatY || ((v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)));
    return `
      <svg class="um-forget-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(aria)}">
        <defs>
          <linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        ${yTicks
          .map((t) => {
            const y = xy(0, t).y;
            return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="#eef0f4"/>
              <text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" fill="#86909c" font-size="10">${fmt(t)}</text>`;
          })
          .join("")}
        ${points
          .map((p, i) => {
            const x = xy(i, 0).x;
            return `<text x="${x.toFixed(1)}" y="${h - 8}" text-anchor="middle" fill="#86909c" font-size="10">${esc(p.label)}</text>`;
          })
          .join("")}
        <path d="${area}" fill="url(#${fillId})"/>
        <path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        ${points
          .map((p, i) => {
            const { x, y } = xy(i, Number(p[yKey]) || 0);
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#fff" stroke="${color}" stroke-width="1.6"/>`;
          })
          .join("")}
      </svg>`;
  }

  function renderPager(prefix, page, pages) {
    return `
      <div class="um-pager">
        <button type="button" class="btn btn-secondary btn-sm" data-page-nav="${prefix}" data-dir="-1" ${page <= 1 ? "disabled" : ""}>上一页</button>
        <span>${page} / ${pages}</span>
        <button type="button" class="btn btn-secondary btn-sm" data-page-nav="${prefix}" data-dir="1" ${page >= pages ? "disabled" : ""}>下一页</button>
      </div>`;
  }

  function renderUmCardDetail(view, uid, stats) {
    if (view === "total") {
      const pageData = paginateList(stats.all, state.umListPage, 8);
      return `
        <section class="um-detail-panel">
          <header class="um-detail-hd">
            <div>
              <h3>记忆总量</h3>
              <p>用户全部已提取记忆 · 共 ${pageData.total} 条</p>
            </div>
          </header>
          <div class="um-table-wrap">
            <table class="um-table">
              <thead>
                <tr><th>记忆类型</th><th>记忆内容</th><th>记忆 ID</th><th>提取时间</th></tr>
              </thead>
              <tbody>
                ${
                  pageData.items.length
                    ? pageData.items
                        .map(
                          (m) => `<tr data-view-mem="${esc(m.id)}" data-kind="${m.tier === "long" ? "long" : "mid"}">
                            <td><span class="mem-type-tag ${memTypeClass(m.type)}"><i class="mem-dot" aria-hidden="true"></i>${esc(m.type)}</span></td>
                            <td class="um-td-content">${esc(m.content)}</td>
                            <td class="um-td-id">${esc(m.id)}</td>
                            <td>${esc(fmtMemTime(m.createdAt))}</td>
                          </tr>`
                        )
                        .join("")
                    : `<tr><td colspan="4" class="um-empty-cell">暂无提取记忆</td></tr>`
                }
              </tbody>
            </table>
          </div>
          ${renderPager("list", pageData.page, pageData.pages)}
        </section>`;
    }

    if (view === "forget") {
      const week = forgetWeekStats(uid);
      const pageData = paginateList(stats.forgottenList, state.umForgetPage, 6);
      return `
        <section class="um-detail-panel um-forget-panel">
          <header class="um-detail-hd">
            <div>
              <h3>遗忘记忆</h3>
              <p>左侧是面临遗忘风险的记忆池，右侧是近 7 天遗忘数量与新增/遗忘比率</p>
            </div>
          </header>
          <div class="um-forget-split">
            <div class="um-forget-pool">
              <div class="um-forget-pool-hd">
                <strong>遗忘池</strong>
                <span>共 ${pageData.total} 条风险记忆</span>
              </div>
              <div class="um-table-wrap">
                <table class="um-table">
                  <thead>
                    <tr><th>记忆内容</th><th>记忆类型</th><th>最后激活时间</th><th>当前激活值</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    ${
                      pageData.items.length
                        ? pageData.items
                            .map(
                              (m) => `<tr>
                                <td class="um-td-content">${esc(m.content)}</td>
                                <td><span class="mem-type-tag ${memTypeClass(m.type)}"><i class="mem-dot" aria-hidden="true"></i>${esc(m.type)}</span></td>
                                <td>${esc(fmtMemTime(m.lastActiveAt || m.createdAt))}</td>
                                <td><b class="um-act ${Number(m.activation) < 0.2 ? "is-low" : ""}">${Number(m.activation ?? 0).toFixed(2)}</b></td>
                                <td><button type="button" class="btn btn-secondary btn-sm forget-restore">复习干预</button></td>
                              </tr>`
                            )
                            .join("")
                        : `<tr><td colspan="5" class="um-empty-cell">暂无遗忘风险记忆</td></tr>`
                    }
                  </tbody>
                </table>
              </div>
              ${renderPager("forget", pageData.page, pageData.pages)}
            </div>
            <div class="um-forget-curves">
              <div class="um-forget-chart-card">
                <div class="um-forget-chart-hd">
                  <strong>近 7 天遗忘数量</strong>
                  <span>纵轴：遗忘记忆条数</span>
                </div>
                ${renderMiniLineChart(week, {
                  yKey: "forgotten",
                  color: "#5b5fc7",
                  fillId: "um-forget-fill-count",
                  aria: "近7天遗忘记忆数量变化",
                  formatY: (v) => String(Math.round(v)),
                })}
              </div>
              <div class="um-forget-chart-card">
                <div class="um-forget-chart-hd">
                  <strong>近 7 天新增 / 遗忘比率</strong>
                  <span>纵轴：新增记忆 ÷ 遗忘记忆</span>
                </div>
                ${renderMiniLineChart(week, {
                  yKey: "ratio",
                  color: "#0d9488",
                  fillId: "um-forget-fill-ratio",
                  aria: "近7天新增记忆与遗忘记忆比率",
                  formatY: (v) => Number(v).toFixed(1),
                })}
              </div>
            </div>
          </div>
        </section>`;
    }

    const pageData = paginateList(stats.longList, state.umListPage, 8);
    return `
      <section class="um-detail-panel">
        <header class="um-detail-hd">
          <div>
            <h3>长期记忆</h3>
            <p>已沉淀的稳定认知与画像记忆 · 共 ${pageData.total} 条</p>
          </div>
        </header>
        <div class="um-table-wrap">
          <table class="um-table">
            <thead>
              <tr><th>记忆类型</th><th>记忆内容</th><th>记忆 ID</th><th>提取时间</th></tr>
            </thead>
            <tbody>
              ${
                pageData.items.length
                  ? pageData.items
                      .map(
                        (m) => `<tr data-view-mem="${esc(m.id)}" data-kind="long">
                          <td><span class="mem-type-tag ${memTypeClass(m.type)}"><i class="mem-dot" aria-hidden="true"></i>${esc(m.type)}</span></td>
                          <td class="um-td-content">${esc(m.content)}</td>
                          <td class="um-td-id">${esc(m.id)}</td>
                          <td>${esc(fmtMemTime(m.createdAt))}</td>
                        </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="4" class="um-empty-cell">暂无长期记忆</td></tr>`
              }
            </tbody>
          </table>
        </div>
        ${renderPager("list", pageData.page, pageData.pages)}
      </section>`;
  }

  function renderUserMemoryBoard(root, uid, { showUserPicker = false, showSettings = false } = {}) {
    const spaces = accessibleSpaces();
    const spaceId = state.spaceId || spaces[0]?.id;
    state.spaceId = spaceId;
    const user = userById(uid);
    const persona = bankPersona(uid);
    const userMode = state.viewMode === "user";
    // 顶部工具栏：与人员列表页一致的 bank-toolbar 样式；记忆空间切换已按需求移除。
    // 用户端整体简化：不展示顶部面包屑工具栏
    if (userMode) {
      setPageTitle("", "");
    } else {
      setPageTitle(
        "",
        `<div class="bank-toolbar is-full">
          ${
            showSettings
              ? `<button type="button" class="btn btn-secondary btn-sm" id="um-back-bank">← 返回上一级</button>`
              : `<span class="bank-crumb">个人记忆</span>`
          }
          <div class="bank-toolbar-right">
            <div class="bank-crumb">${esc(spaceById(spaceId)?.name || "")} · ${esc(user?.name || "")} · 记忆详情</div>
          </div>
        </div>`
      );
    }
    const tab = state.umTab || "list";
    const portraitOpen = state.umPortraitOpen !== false;
    const graphReady = userGraph(uid, spaceId).nodes.length > 0;

    const userPicker = showUserPicker
      ? `<div class="um-user-strip">
          ${MEMORA_DATA.users
            .filter((u) => u.role === "user")
            .map(
              (u) =>
                `<button type="button" class="chip ${u.id === uid ? "active" : ""}" data-uid="${u.id}">${esc(u.name)}</button>`
            )
            .join("")}
        </div>`
      : "";

    const portraitHtml = `
          <aside class="um-portrait-panel ${portraitOpen ? "is-open" : "is-collapsed"}" id="um-portrait-panel">
            <button type="button" class="um-portrait-toggle" data-um-portrait-toggle title="${portraitOpen ? "收起画像" : "展开画像"}" aria-label="${portraitOpen ? "收起画像" : "展开画像"}">${portraitOpen ? (userMode ? "‹" : "›") : (userMode ? "›" : "‹")}</button>
            <div class="um-portrait-inner">${renderPortraitPanel(user, persona)}</div>
          </aside>`;
    const tabsHtml = `
        <div class="um-tabs" role="tablist" aria-label="记忆详情视图">
          <button type="button" class="um-tab ${tab === "list" ? "active" : ""}" data-um-tab="list" role="tab" aria-selected="${tab === "list"}">记忆列表</button>
          <button type="button" class="um-tab ${tab === "graph" ? "active" : ""}" data-um-tab="graph" role="tab" aria-selected="${tab === "graph"}">记忆关系图谱</button>
        </div>`;
    // 用户端：Tab 收进「全部记忆」卡片头部；管理端：Tab 保持在卡片上方的板级位置
    const contentHtml = userMode
      ? `
          <section class="um-content-panel">
            ${renderUmTabbedCard(uid, spaceId, tab)}
          </section>`
      : `
          <section class="um-content-panel">
            ${tab === "list" ? renderUmMemList(uid, spaceId) : renderUmGraphStage(uid, spaceId)}
          </section>`;

    root.innerHTML = `
      <div class="um-board um-board-split ${userMode ? "um-board-usermode" : ""}">
        ${userPicker}
        ${userMode ? "" : tabsHtml}
        <div class="um-split-body ${portraitOpen ? "" : "portrait-collapsed"}">
          ${userMode ? portraitHtml + contentHtml : contentHtml + portraitHtml}
        </div>
      </div>`;

    $$("[data-uid]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedUserId = btn.dataset.uid;
        state.umListPage = 1;
        state.umForgetPage = 1;
        renderPage();
      });
    });

    $$("[data-um-tab]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.umTab = btn.dataset.umTab;
        renderPage();
      });
    });

    // 记忆列表筛选（仅对列表生效）
    $("#um-f-time", root)?.addEventListener("change", (e) => {
      state.umFTime = e.target.value;
      state.umListPage = 1;
      renderPage();
    });
    $("#um-f-type", root)?.addEventListener("change", (e) => {
      state.umFType = e.target.value;
      state.umListPage = 1;
      renderPage();
    });
    $("#um-f-agent", root)?.addEventListener("change", (e) => {
      state.umFAgent = e.target.value;
      state.umListPage = 1;
      renderPage();
    });
    $("#um-f-reset", root)?.addEventListener("click", () => {
      state.umFTime = "all";
      state.umFType = "all";
      state.umFAgent = "all";
      state.umListPage = 1;
      renderPage();
    });

    // 图谱来源智能体筛选（仅对图谱生效）
    $("#um-graph-agent", root)?.addEventListener("change", (e) => {
      state.umGraphAgent = e.target.value;
      renderPage();
    });

    // 画像卡：仅切换类名，不整页重渲染（避免图谱 canvas 重建）；收起时另一卡自动占满整行
    $("[data-um-portrait-toggle]", root)?.addEventListener("click", (e) => {
      state.umPortraitOpen = !state.umPortraitOpen;
      const umUserMode = state.viewMode === "user";
      const panel = $("#um-portrait-panel", root);
      panel?.classList.toggle("is-open", state.umPortraitOpen);
      panel?.classList.toggle("is-collapsed", !state.umPortraitOpen);
      $(".um-split-body", root)?.classList.toggle("portrait-collapsed", !state.umPortraitOpen);
      e.currentTarget.textContent = state.umPortraitOpen ? (umUserMode ? "‹" : "›") : (umUserMode ? "›" : "‹");
      e.currentTarget.title = state.umPortraitOpen ? "收起画像" : "展开画像";
      e.currentTarget.setAttribute("aria-label", state.umPortraitOpen ? "收起画像" : "展开画像");
      requestAnimationFrame(() => state.graphInstance?._resize?.());
    });

    $$("[data-page-nav]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        const dir = Number(btn.dataset.dir) || 0;
        if (btn.dataset.pageNav === "forget") state.umForgetPage = Math.max(1, state.umForgetPage + dir);
        else state.umListPage = Math.max(1, state.umListPage + dir);
        renderPage();
      });
    });

    // 记忆列表分页：与监控看板卡片一致的全数字页码分页
    $$('[data-mnav="umlist"]', root).forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = Number(btn.dataset.mpage);
        if (!Number.isFinite(target) || target < 1) return;
        state.umListPage = target;
        renderPage();
      });
    });

    root.addEventListener("click", (e) => {
      const view = e.target.closest("[data-view-mem]");
      if (view) openMemoryModal(view.dataset.viewMem, view.dataset.kind, true);
    });

    $$("[data-um-edit]", root).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toast("编辑记忆（演示）");
      });
    });
    $$("[data-um-del]", root).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toast("已删除该条记忆（演示）");
      });
    });
    $$("[data-um-detail-demo]", root).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toast("查看记忆详情（演示）");
      });
    });

    // 工具栏在 root（#content）之外，必须全局查询
    $("#um-back-bank")?.addEventListener("click", () => {
      state.bankDetailUserId = null;
      renderChrome();
      renderPage();
    });

    requestAnimationFrame(() => {
      if (tab === "graph" && graphReady) {
        initMemoryGraph();
        requestAnimationFrame(() => state.graphInstance?._resize?.());
      } else if (state.graphInstance) {
        try {
          state.graphInstance.destroy();
        } catch (_) {}
        state.graphInstance = null;
      }
    });
  }

  // 记忆详情：列表模式的数据行（真实记忆优先，否则生成演示记忆）
  function userMemoryRows(uid, spaceId) {
    const real = allExtractedMemories(uid)
      .filter((m) => m.spaceId === spaceId || m.tier === "long" || !m.spaceId)
      .map((m) => ({
        id: m.id,
        content: m.content,
        labels: m.labels || [],
        type: m.type,
        spaceName: m.spaceId
          ? spaceById(m.spaceId)?.name || "—"
          : m.tier === "long"
          ? "跨空间"
          : spaceById(spaceId)?.name || "—",
        createdAt: m.createdAt,
        updatedAt: m.lastActiveAt || m.createdAt,
        agent: m.agentName || umAgentFor(`real-${m.id}`),
        kind: m.tier === "long" ? "long" : "mid",
        real: true,
      }));
    if (real.length) return real;
    return demoUserMemories(uid, spaceId);
  }

  // 为无真实记忆的用户生成稳定的演示记忆列表（演示分页用）
  function demoUserMemories(uid, spaceId) {
    const spaceName = spaceById(spaceId)?.name || "—";
    const types = ["偏好需求", "生活事件", "任务计划", "对话回复风格", "事实", "稳定偏好"];
    const topics = ["代码评审", "客户跟进", "年假申请", "差旅预订", "知识库检索", "权限审批", "报销流程", "培训报名"];
    const contents = [
      "偏好在{}相关场景使用简洁直接的沟通方式",
      "近期关注{}领域的政策更新与办理流程",
      "计划在本季度完成{}相关事项的梳理与归档",
      "对{}类问题倾向先查制度再给结论",
      "常就{}咨询操作细节，关注合规边界",
      "在{}场景中积累了稳定的处理偏好",
      "记录过一次{}相关的异常事件与处置",
      "对{}的答复质量较为敏感，注重准确性",
    ];
    const labelsPool = [["偏好", "沟通"], ["事件", "生活"], ["计划", "任务"], ["事实", "制度"], ["稳定", "画像"], ["合规", "边界"]];
    const n = 12 + (bankSeedNum(`${uid}|${spaceId}|n`) % 13); // 12..24
    const base = Date.now() - 172 * 86400000; // 近 172 天内分布，保证近 7/30/90 天筛选都有数据
    const rows = [];
    const pad = (x) => String(x).padStart(2, "0");
    for (let i = 0; i < n; i++) {
      const s = bankSeedNum(`${uid}|${spaceId}|m${i}`);
      const type = types[s % types.length];
      const topic = topics[(s >>> 3) % topics.length];
      const content = contents[(s >>> 5) % contents.length].replace("{}", topic);
      const created = new Date(base + (s % 172) * 86400000 - (i % 24) * 3600000);
      const createdIso = `${created.getFullYear()}-${pad(created.getMonth() + 1)}-${pad(created.getDate())}T${pad(created.getHours())}:${pad(created.getMinutes())}:00`;
      const upd = new Date(created.getTime() + (1 + (s % 9)) * 86400000);
      const updatedIso = `${upd.getFullYear()}-${pad(upd.getMonth() + 1)}-${pad(upd.getDate())}T${pad(upd.getHours())}:${pad(upd.getMinutes())}:00`;
      const labels = labelsPool[(s >>> 7) % labelsPool.length];
      rows.push({ id: `m-demo-${uid}-${i}`, content, labels, type, spaceName, agent: UM_AGENT_OPTIONS[(s >>> 11) % UM_AGENT_OPTIONS.length], createdAt: createdIso, updatedAt: updatedIso, kind: "mid", real: false });
    }
    return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // 记忆列表卡片（默认视图）：记忆原文 / 标签 / 类型 / 来源智能体 / 创建 / 更新 / 操作
  // 卡片头部下方提供筛选（时间范围 / 记忆类型 / 来源智能体），仅对记忆列表生效
  function umFilterRows(rows) {
    const fTime = state.umFTime || "all";
    const fType = state.umFType || "all";
    const fAgent = state.umFAgent || "all";
    const minTs = fTime === "all" ? 0 : Date.now() - (fTime === "7d" ? 7 : fTime === "30d" ? 30 : 90) * 86400000;
    return rows.filter((r) => {
      if (minTs && new Date(r.createdAt).getTime() < minTs) return false;
      if (fType !== "all" && r.type !== fType) return false;
      if (fAgent !== "all" && r.agent !== fAgent) return false;
      return true;
    });
  }

  function umMemCount(uid, spaceId) {
    const all = userMemoryRows(uid, spaceId);
    const shown = umFilterRows(all);
    return { all: all.length, shown: shown.length, filtered: shown.length !== all.length };
  }

  // 记忆列表主体（筛选条 + 表格 + 分页），不含卡片外壳与头部；管理端与用户端复用
  function umMemListBody(uid, spaceId) {
    const allRows = userMemoryRows(uid, spaceId);
    const rows = umFilterRows(allRows);
    const pg = paginateList(rows, state.umListPage || 1, 8);
    const typeOptions = [...new Set(allRows.map((r) => r.type))];
    const fTime = state.umFTime || "all";
    const fType = state.umFType || "all";
    const fAgent = state.umFAgent || "all";
    const filtered = rows.length !== allRows.length;
    return `
        <div class="um-filters" role="group" aria-label="记忆列表筛选">
          <label class="um-filter-item">
            <span>时间范围</span>
            <select id="um-f-time" class="um-filter-select">
              <option value="all" ${fTime === "all" ? "selected" : ""}>全部时间</option>
              <option value="7d" ${fTime === "7d" ? "selected" : ""}>近 7 天</option>
              <option value="30d" ${fTime === "30d" ? "selected" : ""}>近 30 天</option>
              <option value="90d" ${fTime === "90d" ? "selected" : ""}>近 90 天</option>
            </select>
          </label>
          <label class="um-filter-item">
            <span>记忆类型</span>
            <select id="um-f-type" class="um-filter-select">
              <option value="all" ${fType === "all" ? "selected" : ""}>全部类型</option>
              ${typeOptions.map((t) => `<option value="${esc(t)}" ${fType === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
            </select>
          </label>
          <label class="um-filter-item">
            <span>来源智能体</span>
            <select id="um-f-agent" class="um-filter-select">
              <option value="all" ${fAgent === "all" ? "selected" : ""}>全部</option>
              ${UM_AGENT_OPTIONS.map((a) => `<option value="${esc(a)}" ${fAgent === a ? "selected" : ""}>${esc(a)}</option>`).join("")}
            </select>
          </label>
          ${
            filtered
              ? `<button type="button" class="um-filter-reset" id="um-f-reset">重置筛选</button>`
              : ``
          }
        </div>
        ${
          rows.length
            ? `<div class="um-table-wrap um-mem-table-wrap">
          <table class="um-mem-table">
            <thead>
              <tr>
                <th>记忆原文</th>
                <th>记忆标签</th>
                <th>记忆类型</th>
                <th>来源智能体</th>
                <th>创建时间</th>
                <th>更新时间</th>
                <th class="um-th-action">操作</th>
              </tr>
            </thead>
            <tbody>
              ${pg.items
                .map(
                  (r) => `<tr>
                    <td class="um-mem-text-cell" title="${esc(r.content)}">${esc(r.content)}</td>
                    <td class="um-mem-tags">${
                      r.labels && r.labels.length
                        ? r.labels.map((t) => `<span class="um-tag">${esc(t)}</span>`).join("")
                        : `<span class="um-tag-empty">—</span>`
                    }</td>
                    <td><span class="mem-type-tag ${memTypeClass(r.type)}"><i class="mem-dot" aria-hidden="true"></i>${esc(r.type)}</span></td>
                    <td>${esc(r.agent || r.spaceName)}</td>
                    <td class="um-mem-time">${esc(fmtMemTime(r.createdAt))}</td>
                    <td class="um-mem-time">${esc(fmtMemTime(r.updatedAt))}</td>
                    <td class="um-td-action">
                      ${
                        r.real
                          ? `<button type="button" class="mon-link-btn" data-view-mem="${esc(r.id)}" data-kind="${esc(r.kind)}">详情</button>`
                          : `<button type="button" class="mon-link-btn" data-um-detail-demo="${esc(r.id)}">详情</button>`
                      }
                      <button type="button" class="um-icon-btn" data-um-edit="${esc(r.id)}" title="编辑">✎</button>
                      <button type="button" class="um-icon-btn um-danger" data-um-del="${esc(r.id)}" title="删除">🗑</button>
                    </td>
                  </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <div class="um-list-foot">${monitorPager("umlist", pg.page, pg.pages, rows.length)}</div>`
            : `<div class="um-filter-empty">当前筛选条件下暂无记忆</div>`
        }`;
  }

  function renderUmMemList(uid, spaceId) {
    const allRows = userMemoryRows(uid, spaceId);
    if (!allRows.length) {
      return `<div class="um-card um-list-card"><div class="empty-state">该用户在当前记忆空间暂无记忆</div></div>`;
    }
    const c = umMemCount(uid, spaceId);
    return `
      <div class="um-card um-list-card">
        <div class="um-card-hd">
          <h3>全部记忆 <span class="um-card-count">${c.filtered ? `${c.shown}/${c.all}` : c.all}</span></h3>
          <span class="um-card-sub">${esc(spaceById(spaceId)?.name || "")}</span>
        </div>
        ${umMemListBody(uid, spaceId)}
      </div>`;
  }

  // 用户端：记忆列表 / 关系图谱以 Tab 形式收进「全部记忆」卡片
  function renderUmTabbedCard(uid, spaceId, tab) {
    const allRows = userMemoryRows(uid, spaceId);
    const c = umMemCount(uid, spaceId);
    const body = !allRows.length
      ? `<div class="empty-state">该用户在当前记忆空间暂无记忆</div>`
      : tab === "list"
        ? umMemListBody(uid, spaceId)
        : `<div class="um-filters um-tabbed-graph-filter" role="group" aria-label="图谱筛选">${umGraphAgentFilter()}</div>` + umGraphStageInner(uid, spaceId);
    return `
      <div class="um-card um-list-card um-tabbed-card">
        <div class="um-card-hd">
          <h3>全部记忆 <span class="um-card-count">${c.filtered ? `${c.shown}/${c.all}` : c.all}</span></h3>
          <div class="um-tabs um-card-tabs" role="tablist" aria-label="记忆详情视图">
            <button type="button" class="um-tab ${tab === "list" ? "active" : ""}" data-um-tab="list" role="tab" aria-selected="${tab === "list"}">记忆列表</button>
            <button type="button" class="um-tab ${tab === "graph" ? "active" : ""}" data-um-tab="graph" role="tab" aria-selected="${tab === "graph"}">记忆关系图谱</button>
          </div>
        </div>
        ${body}
      </div>`;
  }

  function umGraphAgentFilter() {
    const gAgent = state.umGraphAgent || "all";
    return `<label class="um-filter-item um-graph-agent">
              <span>来源智能体</span>
              <select id="um-graph-agent" class="um-filter-select">
                <option value="all" ${gAgent === "all" ? "selected" : ""}>全部</option>
                ${UM_AGENT_OPTIONS.map((a) => `<option value="${esc(a)}" ${gAgent === a ? "selected" : ""}>${esc(a)}</option>`).join("")}
              </select>
            </label>`;
  }

  // 图谱舞台主体（画布 + 图例），不含卡片外壳
  function umGraphStageInner(uid, spaceId) {
    const gAgent = state.umGraphAgent || "all";
    const graph = filterGraphByAgent(userGraph(uid, spaceId), gAgent);
    const graphReady = graph.nodes.length > 0;
    const catColor = {};
    graph.nodes.forEach((n) => {
      if (n.category) catColor[n.category] = n.color || catColor[n.category];
    });
    const legendHtml = Object.keys(catColor).length
      ? Object.entries(catColor)
          .map(([c, color]) => `<span><i style="background:${color}"></i>${esc(c)}</span>`)
          .join("")
      : `<span class="um-graph-legend-empty">暂无类别</span>`;
    return `
        <div class="um-graph-stage" id="um-graph-stage">
          ${
            graphReady
              ? `<canvas id="mem-kg-canvas"></canvas>`
              : `<div class="um-graph-empty">当前筛选条件下暂无图谱</div>`
          }
          <div class="um-graph-legend">${legendHtml}</div>
        </div>`;
  }

  // 记忆关系图谱卡片（管理端 tab 切换视图）；支持按来源智能体筛选（仅对图谱生效）
  function renderUmGraphStage(uid, spaceId) {
    return `
      <div class="um-card um-graph-card">
        <div class="um-card-hd">
          <h3>记忆关系图谱</h3>
          <span class="um-card-hd-tools">
            <span class="um-card-sub">${esc(spaceById(spaceId)?.name || "")}</span>
            ${umGraphAgentFilter()}
          </span>
        </div>
        ${umGraphStageInner(uid, spaceId)}
      </div>`;
  }

  function syncUmPanels(root = document) {
    const portrait = $("#um-portrait-panel", root);
    const content = $("#um-content-panel", root);
    const leftOpen = state.umPortraitOpen === true;
    const rightOpen = !!state.umRightOpen;
    portrait?.classList.toggle("is-open", leftOpen);
    portrait?.classList.toggle("is-collapsed", !leftOpen);
    content?.classList.toggle("is-open", rightOpen);
    content?.classList.toggle("is-collapsed", !rightOpen);
    $(".um-split-body", root)?.classList.toggle("portrait-collapsed", !leftOpen);
    requestAnimationFrame(() => state.graphInstance?._resize?.());
  }

  function renderMemories(root) {
    const isUserView = state.page === "my-memories" || state.viewMode === "user";
    if (isUserView) {
      setPageTitle("", "");
      state.selectedUserId =
        state.user.role === "user"
          ? state.user.id
          : state.selectedUserId || "u-sarah";
      if (state.user.role === "user") state.selectedUserId = state.user.id;
      renderUserMemoryBoard(root, state.selectedUserId, { showUserPicker: false });
      return;
    }

    if (state.bankDetailUserId) {
      setPageTitle("", "");
      state.selectedUserId = state.bankDetailUserId;
      renderUserMemoryBoard(root, state.bankDetailUserId, { showUserPicker: false, showSettings: true });
      return;
    }

    if (state.bankAgentId) {
      setPageTitle("", "");
      renderAgentUsers(root);
      return;
    }

    renderMemoryBank(root);
  }

  function managedSpaceList() {
    return accessibleSpaces();
  }

  function bankUserEntries(spaceFilter) {
    const spaces = managedSpaceList();
    const spaceIds = new Set(spaces.map((s) => s.id));
    const filter = spaceFilter && spaceFilter !== "all" ? spaceFilter : null;
    const users = MEMORA_DATA.users.filter((u) => u.role === "user");
    const entries = [];
    users.forEach((u) => {
      const used = (u.usedSpaces || []).filter((id) => spaceIds.has(id));
      const targets = filter ? used.filter((id) => id === filter) : used;
      targets.forEach((sid) => {
        const space = spaceById(sid);
        if (!space) return;
        const mid = MEMORA_DATA.memories.mid.filter(
          (m) => m.userId === u.id && m.spaceId === sid
        );
        const long = MEMORA_DATA.memories.long.filter((m) => m.userId === u.id);
        const realCount = mid.length + long.length;
        const capacity = 2000;
        // 记忆数量：以 uid|sid 为种子生成稳定的演示值，避免每次渲染跳动
        const seed = bankSeedNum(`${u.id}|${sid}`);
        const count = realCount > 0 ? Math.max(realCount, 12 + (seed % 957)) : 12 + (seed % 957);
        const pct = Math.min(100, Math.round((count / capacity) * 1000) / 10 || Math.max(5, count * 8));
        // 最新记忆时间：优先真实记录，否则用种子生成近期日期
        const stamps = [...mid, ...long].map((m) => m.createdAt).filter(Boolean).sort();
        const lastMemoryAt = stamps.length ? stamps[stamps.length - 1] : bankSeedDate(seed);
        entries.push({
          user: u,
          space,
          count,
          capacity,
          pct,
          displayId: bankDisplayId(u.id, sid),
          lastMemoryAt,
          tags: space.tags || [],
          engine: `默认配置 · ${space.name}`,
        });
      });
    });
    return entries;
  }

  // 稳定的伪随机种子（FNV-1a + LCG），用于记忆库人员列表的演示计数 / 日期
  function bankSeedNum(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let x = (h >>> 0) || 1;
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return x;
  }

  function bankSeedDate(seed) {
    const base = Date.parse("2025-08-01T00:00:00");
    const d = new Date(base + (seed % 230) * 86400000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(seed % 24)}:${pad(seed % 60)}:00`;
  }

  function bankDisplayId(uid, sid) {
    let h = 2166136261;
    const raw = `${uid}:${sid}`;
    for (let i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const parts = [];
    let x = h >>> 0;
    for (let i = 0; i < 4; i++) {
      parts.push((x ^ (i * 2654435761)).toString(16).padStart(8, "0"));
      x = Math.imul(x, 1597334677) >>> 0;
    }
    return `${parts[0]}${parts[1].slice(0, 4)}-${parts[1].slice(4)}-${parts[2].slice(0, 4)}-${parts[2].slice(4)}-${parts[3]}${parts[0].slice(0, 4)}`;
  }

  function bankAvatarTone(name) {
    const tones = ["tone-ink", "tone-blue", "tone-violet", "tone-teal"];
    let h = 0;
    for (const ch of name || "") h = (h + ch.charCodeAt(0)) % tones.length;
    return tones[h];
  }

  // ---------- 第一层：智能体记忆库卡片 ----------
  function renderMemoryBank(root) {
    const spaces = managedSpaceList();
    const platformFilter = state.bankPlatformFilter || "all";
    const q = (state.bankSearch || "").trim().toLowerCase();
    let agents = spaces.slice();
    if (platformFilter !== "all") agents = agents.filter((s) => s.platform === platformFilter);
    if (q) {
      agents = agents.filter((s) =>
        [s.name, s.id, s.agentId, s.platform, s.desc || "", ...(s.tags || [])]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    const ownerNames = (s) =>
      (s.owners || []).map((uid) => MEMORA_DATA.users.find((u) => u.id === uid)?.name || uid).join("、") || "—";
    const fmtDate = (t) => (t || "").slice(0, 10);

    setPageTitle(
      "",
      `<div class="bank-toolbar">
        <div class="page-search ${state.bankSearch ? "is-open" : ""}" id="bank-search">
          <button type="button" class="page-search-btn" id="bank-search-btn" title="搜索" aria-label="搜索">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
          </button>
          <input type="search" class="page-search-input" id="bank-search-input" placeholder="搜索智能体…" value="${esc(state.bankSearch || "")}" />
          <button type="button" class="page-search-clear" id="bank-search-clear" title="关闭">×</button>
        </div>
        <label class="bank-filter">
          <span>来源平台</span>
          <select id="bank-platform-filter" class="select">
            <option value="all" ${platformFilter === "all" ? "selected" : ""}>全部平台</option>
            ${[...new Set(spaces.map((s) => s.platform))]
              .map((p) => `<option value="${esc(p)}" ${platformFilter === p ? "selected" : ""}>${esc(p)}</option>`)
              .join("")}
          </select>
        </label>
      </div>`
    );

    root.innerHTML = agents.length
      ? `<div class="agent-cards">${agents.map((s) => agentCardHtml(s, ownerNames, fmtDate)).join("")}</div>`
      : `<div class="empty-state">${q || platformFilter !== "all" ? "未找到匹配的智能体记忆库" : "暂无智能体记忆库"}</div>`;

    $("#bank-platform-filter")?.addEventListener("change", (e) => {
      state.bankPlatformFilter = e.target.value;
      renderPage();
    });

    const searchWrap = $("#bank-search");
    const searchBtn = $("#bank-search-btn");
    const searchInput = $("#bank-search-input");
    const searchClear = $("#bank-search-clear");
    searchBtn?.addEventListener("click", () => {
      searchWrap?.classList.add("is-open");
      searchInput?.focus();
    });
    searchClear?.addEventListener("click", () => {
      state.bankSearch = "";
      renderPage();
    });
    searchInput?.addEventListener("input", (e) => {
      state.bankSearch = e.target.value;
      const pos = e.target.selectionStart;
      renderPage();
      const next = $("#bank-search-input");
      if (next) {
        next.focus();
        try {
          next.setSelectionRange(pos, pos);
        } catch (_) {}
      }
    });

    $$("[data-agent-copy]", root).forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(btn.dataset.agentCopy || "");
          toast("已复制空间 ID");
        } catch (_) {}
      });
    });
    $$("[data-agent-more]", root).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toast("更多操作（演示）");
      });
    });

    $$(".agent-card", root).forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-agent-copy], [data-agent-more]")) return;
        state.bankAgentId = card.dataset.agent;
        state.bankDetailUserId = null;
        state.bankUserView = "card";
        state.bankPage = 1;
        renderChrome();
        renderPage();
      });
    });
  }

  function agentCardHtml(s, ownerNames, fmtDate) {
    const types = s.config?.extract?.types || [];
    return `
      <article class="agent-card" data-agent="${esc(s.id)}">
        <div class="agent-card-hd">
          <h4 class="agent-card-title">${esc(s.name)}</h4>
          <button type="button" class="agent-more" data-agent-more title="更多" aria-label="更多">···</button>
        </div>
        <span class="agent-badge">${types.length} 种</span>
        <p class="agent-desc">${esc(s.desc || "—")}</p>
        <div class="agent-kv">
          <span class="agent-kv-key">空间ID：</span>
          <span class="agent-kv-val">${esc(s.id)}</span>
          <button type="button" class="bank-copy" data-agent-copy="${esc(s.id)}" title="复制空间 ID">⧉</button>
        </div>
        <div class="agent-kv"><span class="agent-kv-key">来源平台：</span><span class="agent-kv-val">${esc(s.platform || "—")}</span></div>
        <div class="agent-kv"><span class="agent-kv-key">负责人：</span><span class="agent-kv-val">${esc(ownerNames(s))}</span></div>
        <div class="agent-card-foot">
          <span>创建 ${esc(fmtDate(s.createdAt))}</span>
          <span>更新 ${esc(fmtDate(s.updatedAt))}</span>
        </div>
      </article>`;
  }

  // ---------- 第二层：智能体下的人员记忆（卡片 / 表格切换，返回在最左） ----------
  function renderAgentUsers(root) {
    const space = spaceById(state.bankAgentId);
    if (!space) {
      state.bankAgentId = null;
      renderMemoryBank(root);
      return;
    }
    const view = state.bankUserView || "card";
    const q = (state.bankUserSearch || "").trim().toLowerCase();
    let entries = bankUserEntries(space.id);
    if (q) {
      entries = entries.filter((e) =>
        [e.user.name, e.user.id, e.user.username]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(q))
      );
    }
    // 默认按记忆数量从高到低
    entries.sort((a, b) => b.count - a.count);
    const total = entries.length;
    const pg = paginateList(entries, state.bankPage || 1, 6);
    const items = pg.items;
    const bankIconCard =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';

    setPageTitle(
      "",
      `<div class="bank-toolbar is-full">
        <button type="button" class="btn btn-secondary btn-sm" id="bank-back">← 返回上一级</button>
        <div class="bank-toolbar-right">
          <div class="page-search ${state.bankUserSearch ? "is-open" : ""}" id="bank-user-search">
            <button type="button" class="page-search-btn" id="bank-user-search-btn" title="搜索" aria-label="搜索">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
            </button>
            <input type="search" class="page-search-input" id="bank-user-search-input" placeholder="搜索用户名 / ID…" value="${esc(state.bankUserSearch || "")}" />
            <button type="button" class="page-search-clear" id="bank-user-search-clear" title="关闭">×</button>
          </div>
          <div class="bank-crumb">${esc(space.name)} · 人员记忆（${total}）</div>
          <div class="mon-view-seg" id="bank-view-seg" role="group" aria-label="展示形式">
            <button type="button" data-v="card" class="${view === "card" ? "active" : ""}" title="卡片" aria-label="卡片">${bankIconCard}</button>
            <button type="button" data-v="table" class="${view === "table" ? "active" : ""}" title="列表" aria-label="列表">${MON_ICON_LIST}</button>
          </div>
        </div>
      </div>`
    );

    if (!total) {
      root.innerHTML = `<div class="empty-state">${q ? "未找到匹配的人员" : "该智能体下暂无人员记忆"}</div>`;
    } else if (view === "card") {
      root.innerHTML = `<div class="member-cards">${items.map((e) => memberCard(e)).join("")}</div>`;
    } else {
      root.innerHTML = `
        <div class="mon-table-wrap">
          <table class="mon-table">
            <thead>
              <tr><th>用户名</th><th>ID</th><th>记忆数量</th><th>最新记忆时间</th><th class="mon-th-action">查看</th></tr>
            </thead>
            <tbody>
              ${items
                .map(
                  (e) => `<tr class="mon-row-click" data-bank-user="${esc(e.user.id)}" data-bank-space="${esc(e.space.id)}">
                    <td class="bank-td-user">
                      <span class="member-avatar sm ${bankAvatarTone(e.user.name)}" aria-hidden="true">${esc((e.user.name || "?").trim().charAt(0))}</span>
                      ${esc(e.user.name)}
                    </td>
                    <td class="mon-td-id">${esc(e.user.id)}</td>
                    <td class="mon-td-num">${e.count.toLocaleString()} 条</td>
                    <td>${esc(memberTime(e.lastMemoryAt))}</td>
                    <td class="mon-td-action"><button type="button" class="mon-link-btn" data-bank-open="${esc(e.user.id)}|${esc(e.space.id)}">查看</button></td>
                  </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>`;
    }

    // 分页（与监控卡片一致：点击具体页码 / 首尾页）
    if (total) {
      root.insertAdjacentHTML(
        "beforeend",
        `<div class="bank-list-foot">${monitorPager("bank", pg.page, pg.pages, pg.total)}</div>`
      );
    }

    // 返回上一级（最左侧）
    $("#bank-back")?.addEventListener("click", () => {
      state.bankAgentId = null;
      state.bankDetailUserId = null;
      renderChrome();
      renderPage();
    });

    // 注意：工具栏在 root（#content）之外，必须全局查询
    $$("#bank-view-seg button").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.bankUserView = btn.dataset.v;
        state.bankPage = 1;
        renderPage();
      });
    });

    // 人员搜索（工具栏，全局绑定）
    const uSearchWrap = $("#bank-user-search");
    const uSearchBtn = $("#bank-user-search-btn");
    const uSearchInput = $("#bank-user-search-input");
    const uSearchClear = $("#bank-user-search-clear");
    uSearchBtn?.addEventListener("click", () => {
      uSearchWrap?.classList.add("is-open");
      uSearchInput?.focus();
    });
    uSearchClear?.addEventListener("click", () => {
      state.bankUserSearch = "";
      state.bankPage = 1;
      renderPage();
    });
    uSearchInput?.addEventListener("input", (e) => {
      state.bankUserSearch = e.target.value;
      const pos = e.target.selectionStart;
      state.bankPage = 1;
      renderPage();
      const next = $("#bank-user-search-input");
      if (next) {
        next.focus();
        try {
          next.setSelectionRange(pos, pos);
        } catch (_) {}
      }
    });

    // 分页点击
    $$("[data-mnav]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = Number(btn.dataset.mpage);
        if (!Number.isFinite(target) || target < 1) return;
        state.bankPage = target;
        renderPage();
      });
    });

    // 人员卡片「更多」仅提示（演示）
    $$("[data-bank-more]", root).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toast("更多操作（演示）");
      });
    });

    const openUser = (uid, sid) => {
      state.bankDetailUserId = uid;
      state.selectedUserId = uid;
      state.spaceId = sid;
      state.bankPane = null;
      state.bankOverlayClosed = true;
      state.umPortraitOpen = true;
      state.umRightOpen = false;
      state.umCardView = null;
      state.umTab = "list";
      state.umListPage = 1;
      state.umForgetPage = 1;
      state.umFTime = "all";
      state.umFType = "all";
      state.umFAgent = "all";
      state.umGraphAgent = "all";
      renderPage();
    };
    $$(".member-card", root).forEach((card) => {
      card.addEventListener("click", () => openUser(card.dataset.bankUser, card.dataset.bankSpace));
    });
    $$(".mon-row-click", root).forEach((row) => {
      row.addEventListener("click", () => openUser(row.dataset.bankUser, row.dataset.bankSpace));
    });
    $$("[data-bank-open]", root).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const [uid, sid] = btn.dataset.bankOpen.split("|");
        openUser(uid, sid);
      });
    });
  }

  // 最新记忆时间：2025-10-17 05:56
  function memberTime(iso) {
    if (!iso) return "—";
    const t = String(iso);
    return `${t.slice(0, 10)} ${t.slice(11, 16)}`;
  }

  // 人员卡片：只保留 用户名 / ID / 记忆数量 / 最新记忆时间
  function memberCard(e) {
    const initial = (e.user.name || "?").trim().charAt(0);
    return `
      <article class="member-card" data-bank-user="${esc(e.user.id)}" data-bank-space="${esc(e.space.id)}">
        <div class="member-card-hd">
          <span class="member-avatar ${bankAvatarTone(e.user.name)}" aria-hidden="true">${esc(initial)}</span>
          <div class="member-card-title-wrap">
            <h4 class="member-name">${esc(e.user.name)}</h4>
            <div class="member-id">${esc(e.user.id)}</div>
          </div>
          <button type="button" class="member-more" data-bank-more title="更多" aria-label="更多">···</button>
        </div>
        <div class="member-metrics">
          <div class="member-metric">
            <span>记忆数量</span>
            <b>${e.count.toLocaleString()}<i>条</i></b>
          </div>
          <div class="member-metric">
            <span>最新记忆</span>
            <b>${esc(memberTime(e.lastMemoryAt))}</b>
          </div>
        </div>
      </article>`;
  }

  function memoryWorkspace() {
    // legacy helper retained for modal space lists; board replaced render path
    return "";
  }

  function memoryTable() {
    return "";
  }

  function bindMemoryWorkspace() {}

  function initMemoryGraph() {
    const canvas = $("#mem-kg-canvas");
    if (!canvas) return;
    if (state.graphInstance) {
      try {
        state.graphInstance.destroy();
      } catch (_) {}
      state.graphInstance = null;
    }
    const g = filterGraphByAgent(userGraph(state.selectedUserId, state.spaceId), state.umGraphAgent || "all");
    state.graphInstance = new MemoryGraph(canvas, {
      onSelect: (sel) => openGraphDetail(sel),
      onFullscreen: () => {
        const host = canvas.closest(".insight-graph") || canvas.parentElement;
        if (document.fullscreenElement) document.exitFullscreen?.();
        else host?.requestFullscreen?.();
      },
    });
    state.graphInstance.setData(g);
  }

  function openMemoryModal(id, kind = "mid", readOnly = false) {
    const uid = state.selectedUserId || state.bankDetailUserId;
    const fromAll = id && uid ? allExtractedMemories(uid).find((m) => m.id === id) : null;
    const list = kind === "long" ? MEMORA_DATA.memories.long : MEMORA_DATA.memories.mid;
    const mem = fromAll || (id ? list.find((m) => m.id === id) : null);
    if (mem?.tier === "long") kind = "long";
    const spaces = accessibleSpaces();
    const host = $("#modal-host");
    host.innerHTML = `
      <div class="modal-backdrop" id="mem-modal">
        <div class="modal">
          <div class="modal-hd">
            <h3>${readOnly ? "查看" : mem ? "编辑" : "新增"}${kind === "long" ? "长期" : "中期"}记忆</h3>
            <button type="button" class="icon-btn" id="modal-x">×</button>
          </div>
          <div class="modal-bd form-grid">
            <label class="field"><span>内容</span>
              <textarea class="textarea" id="m-content" rows="3" ${readOnly ? "readonly" : ""}>${esc(mem?.content || "")}</textarea>
            </label>
            <div class="form-grid cols-2">
              <label class="field"><span>类型</span>
                ${
                  kind === "long"
                    ? `<select class="select" id="m-type" ${readOnly ? "disabled" : ""}>
                        <option ${mem?.type === "身份画像" ? "selected" : ""}>身份画像</option>
                        <option ${mem?.type === "稳定偏好" ? "selected" : ""}>稳定偏好</option>
                        <option ${mem?.type === "对话回复风格" ? "selected" : ""}>对话回复风格</option>
                        <option ${mem?.type === "偏好需求" ? "selected" : ""}>偏好需求</option>
                      </select>`
                    : `<input class="input" id="m-type" value="${esc(mem?.type || "偏好")}" ${readOnly ? "readonly" : ""} />`
                }
              </label>
              ${
                kind === "mid"
                  ? `<label class="field"><span>所属空间</span>
                      <select class="select" id="m-space" ${readOnly ? "disabled" : ""}>
                        ${spaces
                          .map(
                            (s) =>
                              `<option value="${s.id}" ${(mem?.spaceId || state.spaceId) === s.id ? "selected" : ""}>${s.name}</option>`
                          )
                          .join("")}
                      </select>
                    </label>`
                  : `<label class="field"><span>作用域</span><input class="input" value="跨空间 · 用户唯一" disabled /></label>`
              }
            </div>
            <label class="field"><span>来源</span>
              <input class="input" id="m-source" value="${esc(mem?.source || "manual")}" ${readOnly ? "readonly" : ""} />
            </label>
          </div>
          <div class="modal-ft">
            <button type="button" class="btn btn-secondary" id="modal-cancel">取消</button>
            ${readOnly ? "" : `<button type="button" class="btn btn-primary" id="modal-save">保存</button>`}
          </div>
        </div>
      </div>`;

    const close = () => (host.innerHTML = "");
    $("#modal-x").onclick = close;
    $("#modal-cancel").onclick = close;
    $("#mem-modal").addEventListener("click", (e) => {
      if (e.target.id === "mem-modal") close();
    });
    $("#modal-save")?.addEventListener("click", () => {
      const payload = {
        content: $("#m-content").value.trim(),
        type: $("#m-type").value,
        source: $("#m-source").value.trim() || "manual",
        createdAt: mem?.createdAt || new Date().toISOString(),
        userId: state.selectedUserId,
        spaceId: kind === "mid" ? $("#m-space").value : null,
        labels: mem?.labels || ["manual"],
      };
      if (!payload.content) return toast("请填写内容");
      if (mem) Object.assign(mem, payload);
      else {
        list.push({ ...payload, id: `${kind}-${Date.now()}` });
      }
      toast("记忆已保存");
      close();
      renderPage();
    });
  }

  /* ---------- permissions ---------- */
  function renderPermissions(root) {
    setPageTitle("", `<button type="button" class="btn btn-primary" id="btn-add-perm">分配权限</button>`);
    const admins = MEMORA_DATA.users.filter((u) => u.role === "admin" || u.role === "user");
    root.innerHTML = `
      <div class="page-header page-header-plain">
        <p>超管可为用户分配智能体记忆空间权限：运维（只调配置）、审计（只读+留痕）、内容（CRUD）。</p>
      </div>
      <div class="panel" style="margin-bottom:14px">
        <div class="panel-hd"><h3>权限矩阵</h3></div>
        <div class="panel-bd">
          <div class="perm-matrix">
            <div class="perm-row head">
              <span>用户 / 空间</span><span>空间运维</span><span>记忆审计</span><span>记忆内容</span>
            </div>
            ${MEMORA_DATA.permissions
              .map((p) => {
                const u = userById(p.userId);
                const s = spaceById(p.spaceId);
                return `<div class="perm-row">
                  <div><strong>${u?.name}</strong><br/><small style="color:var(--ink-muted)">${s?.name}</small></div>
                  <label><input type="checkbox" data-perm="${p.userId}|${p.spaceId}|ops" ${p.ops ? "checked" : ""} /> 只调配置</label>
                  <label><input type="checkbox" data-perm="${p.userId}|${p.spaceId}|audit" ${p.audit ? "checked" : ""} /> 只读+留痕</label>
                  <label><input type="checkbox" data-perm="${p.userId}|${p.spaceId}|content" ${p.content ? "checked" : ""} /> CRUD</label>
                </div>`;
              })
              .join("")}
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-hd"><h3>操作审计日志</h3></div>
        <div class="panel-bd">
          <div class="timeline">
            ${MEMORA_DATA.auditLogs
              .map(
                (a) => `
              <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                  <time>${fmtTime(a.at)}</time>
                  <strong>${esc(a.actor)}</strong> · ${esc(a.action)}
                  <div style="color:var(--ink-soft);margin-top:2px">${esc(a.detail)}</div>
                </div>
              </div>`
              )
              .join("")}
          </div>
        </div>
      </div>`;

    $$("[data-perm]", root).forEach((cb) => {
      cb.addEventListener("change", () => {
        const [uid, sid, key] = cb.dataset.perm.split("|");
        const row = MEMORA_DATA.permissions.find((p) => p.userId === uid && p.spaceId === sid);
        if (row) row[key] = cb.checked;
        const admin = userById(uid);
        if (admin?.spacePerms?.[sid]) admin.spacePerms[sid][key] = cb.checked;
        MEMORA_DATA.auditLogs.unshift({
          id: "aud-" + Date.now(),
          at: new Date().toISOString(),
          actor: state.user.name,
          action: "更新权限",
          detail: `${admin?.name} · ${spaceById(sid)?.name} · ${key}=${cb.checked}`,
        });
        toast("权限已更新");
      });
    });

    $("#btn-add-perm")?.addEventListener("click", () => {
      const host = $("#modal-host");
      host.innerHTML = `
        <div class="modal-backdrop" id="perm-modal">
          <div class="modal">
            <div class="modal-hd"><h3>分配记忆空间权限</h3><button type="button" class="icon-btn" id="modal-x">×</button></div>
            <div class="modal-bd form-grid">
              <label class="field"><span>用户</span>
                <select class="select" id="p-user">${admins.map((u) => `<option value="${u.id}">${u.name}（${ROLE_LABEL[u.role]}）</option>`).join("")}</select>
              </label>
              <label class="field"><span>智能体记忆空间</span>
                <select class="select" id="p-space">${MEMORA_DATA.spaces.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}</select>
              </label>
              <div class="chip-row">
                <label class="badge"><input type="checkbox" id="p-ops" checked /> 空间运维</label>
                <label class="badge"><input type="checkbox" id="p-audit" /> 记忆审计</label>
                <label class="badge"><input type="checkbox" id="p-content" checked /> 记忆内容</label>
              </div>
            </div>
            <div class="modal-ft">
              <button type="button" class="btn btn-secondary" id="modal-cancel">取消</button>
              <button type="button" class="btn btn-primary" id="modal-save">确认分配</button>
            </div>
          </div>
        </div>`;
      const close = () => (host.innerHTML = "");
      $("#modal-x").onclick = close;
      $("#modal-cancel").onclick = close;
      $("#modal-save").onclick = () => {
        const userId = $("#p-user").value;
        const spaceId = $("#p-space").value;
        const row = {
          userId,
          spaceId,
          ops: $("#p-ops").checked,
          audit: $("#p-audit").checked,
          content: $("#p-content").checked,
        };
        const exist = MEMORA_DATA.permissions.findIndex(
          (p) => p.userId === userId && p.spaceId === spaceId
        );
        if (exist >= 0) MEMORA_DATA.permissions[exist] = row;
        else MEMORA_DATA.permissions.push(row);
        const u = userById(userId);
        if (u) {
          u.role = u.role === "user" ? "admin" : u.role;
          u.managedSpaces = [...new Set([...(u.managedSpaces || []), spaceId])];
          u.spacePerms = u.spacePerms || {};
          u.spacePerms[spaceId] = {
            ops: row.ops,
            audit: row.audit,
            content: row.content,
          };
        }
        MEMORA_DATA.auditLogs.unshift({
          id: "aud-" + Date.now(),
          at: new Date().toISOString(),
          actor: state.user.name,
          action: "分配权限",
          detail: `为 ${u?.name} 授予「${spaceById(spaceId)?.name}」权限`,
        });
        toast("权限已分配");
        close();
        renderPage();
      };
    });
  }

  /* ---------- sharing ---------- */
  function renderSharing(root) {
    setPageTitle("", `<button type="button" class="btn btn-primary" id="btn-new-share">发起订阅</button>`);
    const canApproveSuper = state.user.role === "super";
    root.innerHTML = `
      <div class="page-header page-header-plain">
        <p>智能体记忆空间可订阅其他空间中用户的记忆，需对方空间管理者与超级管理员双审批。</p>
      </div>
      <div class="panel">
        <div class="table-wrap"><table class="data">
          <thead><tr>
            <th>订阅方</th><th>被订阅方</th><th>发起人</th><th>说明</th><th>审批进度</th><th>状态</th><th>操作</th>
          </tr></thead>
          <tbody>
            ${MEMORA_DATA.shareRequests
              .map((r) => {
                const from = spaceById(r.fromSpaceId);
                const to = spaceById(r.toSpaceId);
                const st =
                  r.status === "approved"
                    ? '<span class="badge badge-green">已通过</span>'
                    : r.status === "rejected"
                      ? '<span class="badge badge-danger">已拒绝</span>'
                      : '<span class="badge badge-warn">待审批</span>';
                return `<tr>
                  <td>${from?.name}</td>
                  <td>${to?.name}</td>
                  <td>${esc(r.requester)}</td>
                  <td>${esc(r.note)}</td>
                  <td>
                    <span class="badge ${r.approvals.spaceOwner ? "badge-green" : "badge-warn"}">空间管理者 ${r.approvals.spaceOwner ? "✓" : "…"}</span>
                    <span class="badge ${r.approvals.superAdmin ? "badge-green" : "badge-warn"}">超管 ${r.approvals.superAdmin ? "✓" : "…"}</span>
                  </td>
                  <td>${st}</td>
                  <td>
                    ${
                      r.status === "pending"
                        ? `<button type="button" class="btn btn-sm btn-secondary" data-approve="${r.id}" data-as="owner">管理者同意</button>
                           ${canApproveSuper ? `<button type="button" class="btn btn-sm btn-primary" data-approve="${r.id}" data-as="super">超管同意</button>` : ""}
                           <button type="button" class="btn btn-sm btn-danger" data-reject="${r.id}">拒绝</button>`
                        : "—"
                    }
                  </td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table></div>
      </div>`;

    root.addEventListener("click", (e) => {
      const ap = e.target.closest("[data-approve]");
      const rj = e.target.closest("[data-reject]");
      if (ap) {
        const req = MEMORA_DATA.shareRequests.find((x) => x.id === ap.dataset.approve);
        if (!req) return;
        if (ap.dataset.as === "owner") req.approvals.spaceOwner = true;
        if (ap.dataset.as === "super") req.approvals.superAdmin = true;
        if (req.approvals.spaceOwner && req.approvals.superAdmin) {
          req.status = "approved";
          const from = spaceById(req.fromSpaceId);
          if (from && !from.subscribers.includes(req.toSpaceId)) {
            from.subscribers.push(req.toSpaceId);
          }
        }
        toast("审批已记录");
        renderPage();
      }
      if (rj) {
        const req = MEMORA_DATA.shareRequests.find((x) => x.id === rj.dataset.reject);
        if (req) {
          req.status = "rejected";
          toast("已拒绝共享请求");
          renderPage();
        }
      }
    });

    $("#btn-new-share")?.addEventListener("click", () => {
      const spaces = accessibleSpaces();
      const host = $("#modal-host");
      host.innerHTML = `
        <div class="modal-backdrop" id="share-modal">
          <div class="modal">
            <div class="modal-hd"><h3>发起记忆空间订阅</h3><button type="button" class="icon-btn" id="modal-x">×</button></div>
            <div class="modal-bd form-grid">
              <label class="field"><span>本空间（订阅方）</span>
                <select class="select" id="sh-from">${spaces.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}</select>
              </label>
              <label class="field"><span>目标空间（被订阅）</span>
                <select class="select" id="sh-to">${MEMORA_DATA.spaces.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}</select>
              </label>
              <label class="field"><span>说明</span>
                <textarea class="textarea" id="sh-note" rows="2" placeholder="说明订阅用途"></textarea>
              </label>
            </div>
            <div class="modal-ft">
              <button type="button" class="btn btn-secondary" id="modal-cancel">取消</button>
              <button type="button" class="btn btn-primary" id="modal-save">提交</button>
            </div>
          </div>
        </div>`;
      const close = () => (host.innerHTML = "");
      $("#modal-x").onclick = close;
      $("#modal-cancel").onclick = close;
      $("#modal-save").onclick = () => {
        const fromSpaceId = $("#sh-from").value;
        const toSpaceId = $("#sh-to").value;
        if (fromSpaceId === toSpaceId) return toast("不能订阅自身空间");
        MEMORA_DATA.shareRequests.unshift({
          id: "shr-" + Date.now(),
          fromSpaceId,
          toSpaceId,
          requester: state.user.name,
          status: "pending",
          createdAt: new Date().toISOString(),
          note: $("#sh-note").value || "无说明",
          approvals: { spaceOwner: false, superAdmin: false },
        });
        toast("订阅请求已提交");
        close();
        renderPage();
      };
    });
  }

  /* ---------- monitor / verify stubs ---------- */
  /* ---------- 监控看板 ---------- */
  const MONITOR_SCENES = [
    { id: "all", label: "全部" },
    { id: "jhzx", label: "交行知道" },
    { id: "code", label: "代码助手" },
    { id: "personal", label: "个人智能体" },
  ];

  const MONITOR_RETRIEVE_METRICS = [
    { id: "total", label: "总耗时", color: "#5b5fc7", base: 182 },
    { id: "embedding", label: "Embedding 耗时", color: "#0fc6c2", base: 46 },
    { id: "vector", label: "向量检索耗时", color: "#ff7d00", base: 78 },
    { id: "rerank", label: "重排耗时", color: "#f53f3f", base: 54 },
  ];

  const MONITOR_EXTRACT_METRICS = [
    { id: "extract", label: "记忆提取耗时", color: "#5b5fc7", base: 428 },
    { id: "entity", label: "实体抽取耗时", color: "#00b42a", base: 265 },
  ];

  const MONITOR_SCENE_FACTOR = {
    all: { vol: 1, lat: 1, jit: 0.22, calls: 12400 },
    jhzx: { vol: 0.44, lat: 1.1, jit: 0.26, calls: 5460 },
    code: { vol: 0.32, lat: 0.85, jit: 0.18, calls: 3980 },
    personal: { vol: 0.18, lat: 0.93, jit: 0.3, calls: 2260 },
  };

  // 日期面板快捷选项：days 为「往前推的天数」，0 表示仅当天
  const MONITOR_QUICK_RANGES = [
    { id: "today", label: "今天", days: 0 },
    { id: "7d", label: "近 7 天", days: 6 },
    { id: "30d", label: "近 30 天", days: 29 },
  ];
  const MONITOR_DATE_KEYS = ["vol", "retrieve", "extract"];

  function monitorTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function monitorShiftStr(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // 展示用：2026/08/08
  function monitorDateLabel(s) {
    return s ? s.replace(/-/g, "/") : "";
  }

  function monitorDateRange(key) {
    const d = state.monitorDates?.[key];
    const today = monitorTodayStr();
    if (d?.start && d?.end) {
      return d.start <= d.end ? { start: d.start, end: d.end } : { start: d.end, end: d.start };
    }
    return { start: today, end: today };
  }

  function monitorSeed(...parts) {
    let h = 2166136261;
    const s = parts.join("|");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // 确定性伪随机：同一场景+指标每次渲染数据一致
  function monitorRand(seed) {
    let s = seed || 1;
    return () => {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  // 作息曲线：凌晨低谷、午后高峰
  function monitorDayCurve(h) {
    const bell = Math.exp(-Math.pow(h - 14, 2) / 46);
    const trough = h <= 6 ? 0.52 + h * 0.06 : 1;
    return (0.62 + 0.5 * bell) * trough;
  }

  // 时间切片：24h 按小时，7d / 30d 按天
  // 按日期区间生成时间切片：单日 → 24 小时点；跨日 → 每日点（上限 90）
  function monitorSeriesCtx(key) {
    const { start, end } = monitorDateRange(key);
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(`${end}T00:00:00`);
    let days = Math.round((e - s) / 86400000) + 1;
    if (!Number.isFinite(days) || days < 1) days = 1;
    days = Math.min(days, 90);
    const hourly = days === 1;
    const slots = [];
    if (hourly) {
      for (let h = 0; h < 24; h++) {
        slots.push({ label: `${String(h).padStart(2, "0")}:00`, hour: h, dow: s.getDay() });
      }
    } else {
      for (let i = 0; i < days; i++) {
        const d = new Date(s.getTime() + i * 86400000);
        slots.push({
          label: `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
          hour: 14,
          dow: d.getDay(),
        });
      }
    }
    return { slots, hourly, days, start, end };
  }

  // 切片量级：周末走低；小时维度走作息曲线，日维度带缓慢增长
  function monitorSlotWeight(ctx, i) {
    const slot = ctx.slots[i];
    const weekend = slot.dow === 0 || slot.dow === 6 ? 0.78 : 1;
    if (ctx.hourly) return weekend * monitorDayCurve(slot.hour);
    return weekend * (1 + (i / Math.max(1, ctx.slots.length - 1)) * 0.18);
  }

  function monitorLatencySeries(scene, metricId, key) {
    const metric =
      MONITOR_RETRIEVE_METRICS.find((m) => m.id === metricId) ||
      MONITOR_EXTRACT_METRICS.find((m) => m.id === metricId);
    if (!metric) return [];
    const f = MONITOR_SCENE_FACTOR[scene] || MONITOR_SCENE_FACTOR.all;
    const ctx = monitorSeriesCtx(key);
    const rnd = monitorRand(monitorSeed("lt", scene, metricId, ctx.start, ctx.end));
    return ctx.slots.map((slot, i) => {
      const noise = 1 + (rnd() - 0.5) * f.jit;
      const v = metric.base * f.lat * monitorSlotWeight(ctx, i) * noise;
      return { label: slot.label, value: Math.round(v * 10) / 10 };
    });
  }

  function monitorVolumeSeries(scene, key) {
    const f = MONITOR_SCENE_FACTOR[scene] || MONITOR_SCENE_FACTOR.all;
    const ctx = monitorSeriesCtx(key);
    const rnd = monitorRand(monitorSeed("vol", scene, ctx.start, ctx.end));
    // 单日切片按小时均摊，跨日切片即整日量
    const base = ctx.hourly ? f.calls / 24 : f.calls;
    return ctx.slots.map((slot, i) => {
      const noise = 1 + (rnd() - 0.5) * 0.34;
      return { label: slot.label, value: Math.round(base * monitorSlotWeight(ctx, i) * noise) };
    });
  }

  function monitorStats(points) {
    const sorted = points.map((p) => p.value).sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      total: Math.round(sum),
      avg: Math.round((sum / sorted.length) * 10) / 10,
      p95: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] * 10) / 10,
      max: Math.round(sorted[sorted.length - 1] * 10) / 10,
    };
  }

  let monitorChartSeq = 0;
  function monitorTrendChart(points, { color, unit, aria, w = 460, h = 168 }) {
    const padL = 44;
    const padR = 14;
    const padT = 14;
    const padB = 26;
    const maxV = Math.max(0.01, ...points.map((p) => p.value)) * 1.18;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const coords = points.map((p, i) => ({
      x: padL + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW),
      y: padT + (1 - p.value / maxV) * innerH,
    }));
    const uid = `mcgrad${++monitorChartSeq}`;
    const line = coords.map((c, i) => `${i ? "L" : "M"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
    const area = `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${padT + innerH} L ${coords[0].x.toFixed(1)} ${padT + innerH} Z`;
    const fmt = (v) => (v >= 10000 ? `${(v / 1000).toFixed(0)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v * 10) / 10));
    const yTicks = [0, 1, 2, 3].map((i) => (maxV / 3) * i);
    const step = Math.max(1, Math.ceil(points.length / 6));
    return `
      <div class="mc-wrap"
           data-points='${esc(JSON.stringify(points.map((p) => ({ label: p.label, value: p.value }))))}'
           data-coords='${JSON.stringify(coords)}'
           data-unit="${esc(unit || "")}">
        <svg class="mc-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(aria)}">
          <defs>
            <linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.26"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
            </linearGradient>
          </defs>
          ${yTicks
            .map((t) => {
              const y = padT + (1 - t / maxV) * innerH;
              return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="#eef0f4"/>
                <text x="${padL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="#86909c" font-size="10">${fmt(t)}</text>`;
            })
            .join("")}
          ${coords
            .map((c, i) =>
              i % step === 0 || i === coords.length - 1
                ? `<text x="${c.x.toFixed(1)}" y="${h - 8}" text-anchor="middle" fill="#86909c" font-size="10">${esc(points[i].label)}</text>`
                : ""
            )
            .join("")}
          <path d="${area}" fill="url(#${uid})"/>
          <path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          ${coords
            .map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.4" fill="#fff" stroke="${color}" stroke-width="1.5"/>`)
            .join("")}
          <line class="mc-cursor" x1="0" y1="${padT}" x2="0" y2="${padT + innerH}" stroke="${color}" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
          <circle class="mc-dot" cx="0" cy="0" r="4.5" fill="${color}" stroke="#fff" stroke-width="2" opacity="0"/>
        </svg>
        <div class="mc-tip"></div>
      </div>`;
  }

  const MON_ICON_CHART =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 4 5-7 4 5"/></svg>';
  const MON_ICON_LIST =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>';

  // 列表视图：分页查询（最新在上），带环比
  // 请求级明细：折线图是聚合均值，表格是每一次请求的真实记录
  // 明细围绕对应时间片的均值波动，因此与折线趋势一致
  function monitorDetailRows(points, key, { hourly, integer = false, tag = "" }) {
    const seedSrc = `${key}|${tag}|${hourly}|${points.length}|${points[0]?.label || ""}|${points[points.length - 1]?.label || ""}`;
    const rnd = monitorRand(monitorSeed("dtl", seedSrc));
    const hex = "0123456789abcdef";
    const randId = () => {
      let s = "";
      for (let i = 0; i < 8; i++) s += hex[Math.floor(rnd() * 16)];
      return `req-${s}`;
    };
    const rows = [];
    points.forEach((p) => {
      const n = 6 + Math.floor(rnd() * 6); // 每个时间片 6~11 条
      for (let k = 0; k < n; k++) {
        const jitter = 1 + (rnd() - 0.5) * 0.62;
        const raw = p.value * jitter;
        const value = integer ? Math.max(1, Math.round(raw)) : Math.round(raw * 10) / 10;
        const mm = String(Math.floor(rnd() * 60)).padStart(2, "0");
        const ss = String(Math.floor(rnd() * 60)).padStart(2, "0");
        const time = hourly ? `${p.label.slice(0, 2)}:${mm}:${ss}` : `${p.label} ${String(Math.floor(rnd() * 24)).padStart(2, "0")}:${mm}:${ss}`;
        rows.push({
          id: randId(),
          time,
          sortTime: `${p.label} ${hourly ? mm : time.slice(6)}:${ss}`,
          value,
        });
      }
    });
    return rows;
  }

  // 通用分页：首页 / 上一页 / 页码 / 下一页 / 末页 + 总数
  function monitorPager(key, page, pages, total) {
    const win = 5;
    let start = Math.max(1, page - 2);
    let finish = Math.min(pages, start + win - 1);
    start = Math.max(1, finish - win + 1);
    const nums = [];
    for (let i = start; i <= finish; i++) nums.push(i);
    const btn = (mpage, text, disabled, label, active) =>
      `<button type="button" class="mon-pg${active ? " active" : ""}" data-mnav="${key}" data-mpage="${mpage}"${disabled ? " disabled" : ""}${label ? ` aria-label="${label}"` : ""}>${text}</button>`;
    return `
      <div class="mon-pager">
        ${btn(1, "\u00ab", page <= 1, "首页")}
        ${btn(page - 1, "\u2039", page <= 1, "上一页")}
        ${start > 1 ? `<span class="mon-pg-gap">\u2026</span>` : ""}
        ${nums.map((n) => btn(n, n, false, "", n === page)).join("")}
        ${finish < pages ? `<span class="mon-pg-gap">\u2026</span>` : ""}
        ${btn(page + 1, "\u203a", page >= pages, "下一页")}
        ${btn(pages, "\u00bb", page >= pages, "末页")}
        <span class="mon-pg-total">共 ${total} 条</span>
      </div>`;
  }

  // 排序 + 分页切片（两种表格共用）
  function monitorSortPage(list, key, timeOf, valueOf) {
    const sort = state.monitorSort?.[key] || { field: "time", dir: "desc" };
    const sorted = list.slice().sort((a, b) => {
      const r =
        sort.field === "value" ? valueOf(a) - valueOf(b) : timeOf(a) < timeOf(b) ? -1 : timeOf(a) > timeOf(b) ? 1 : 0;
      return sort.dir === "asc" ? r : -r;
    });
    return { sort, pg: paginateList(sorted, state.monitorPage?.[key] || 1, 6) };
  }

  function monitorSortHead(key, sort, fields) {
    return fields
      .map((f) => {
        const caret =
          sort.field === f.field ? `<i class="mon-sort-caret">${sort.dir === "asc" ? "\u2191" : "\u2193"}</i>` : "";
        return `<th data-msort="${f.field}" data-mkey="${key}" class="${sort.field === f.field ? "sorted" : ""}">${esc(f.text)}${caret}</th>`;
      })
      .join("");
  }

  // 明细列表：请求 ID / 请求时间 / 耗时（检索 & 提取耗时卡片）
  function monitorDetailTable(rows, { unit, label, timeLabel = "请求时间", key }) {
    const { sort, pg } = monitorSortPage(rows, key, (r) => r.sortTime, (r) => r.value);
    return `
      <div class="mon-table-wrap">
        <table class="mon-table">
          <thead>
            <tr>
              <th>请求 ID</th>
              ${monitorSortHead(key, sort, [
                { field: "time", text: timeLabel },
                { field: "value", text: label },
              ])}
            </tr>
          </thead>
          <tbody>
            ${pg.items
              .map(
                (r) => `<tr>
                  <td class="mon-td-id">${esc(r.id)}</td>
                  <td>${esc(r.time)}</td>
                  <td class="mon-td-num">${r.value.toLocaleString()}${unit ? ` ${esc(unit)}` : ""}</td>
                </tr>`
              )
              .join("")}
            ${pg.items.length ? "" : `<tr><td colspan="3" class="mon-td-empty">暂无数据</td></tr>`}
          </tbody>
        </table>
      </div>
      ${monitorPager(key, pg.page, pg.pages, pg.total)}`;
  }

  // 聚合列表：时间片 / 数值 / 环比（记忆提取总量卡片，按小时或按天）
  function monitorAggTable(points, { unit, label, timeLabel = "时间", key }) {
    const rows = points.map((p, i) => {
      const prev = i > 0 ? points[i - 1].value : 0;
      let trend = `<span class="mon-trend flat">—</span>`;
      if (prev > 0) {
        const d = ((p.value - prev) / prev) * 100;
        if (Math.abs(d) < 0.5) trend = `<span class="mon-trend flat">—</span>`;
        else if (d > 0) trend = `<span class="mon-trend up">↑ ${d.toFixed(1)}%</span>`;
        else trend = `<span class="mon-trend down">↓ ${Math.abs(d).toFixed(1)}%</span>`;
      }
      return { label: p.label, value: p.value, trend, idx: i };
    });
    const { sort, pg } = monitorSortPage(rows, key, (r) => String(r.idx).padStart(4, "0"), (r) => r.value);
    return `
      <div class="mon-table-wrap">
        <table class="mon-table">
          <thead>
            <tr>
              ${monitorSortHead(key, sort, [
                { field: "time", text: timeLabel },
                { field: "value", text: label },
              ])}
              <th>环比</th>
            </tr>
          </thead>
          <tbody>
            ${pg.items
              .map(
                (r) => `<tr>
                  <td>${esc(r.label)}</td>
                  <td class="mon-td-num">${r.value.toLocaleString()}${unit ? ` ${esc(unit)}` : ""}</td>
                  <td>${r.trend}</td>
                </tr>`
              )
              .join("")}
            ${pg.items.length ? "" : `<tr><td colspan="3" class="mon-td-empty">暂无数据</td></tr>`}
          </tbody>
        </table>
      </div>
      ${monitorPager(key, pg.page, pg.pages, pg.total)}`;
  }

  function bindMonitorCharts(root) {
    $$(".mc-wrap", root).forEach((wrap) => {
      const svg = $(".mc-svg", wrap);
      const tip = $(".mc-tip", wrap);
      if (!svg || !tip) return;
      const pts = JSON.parse(wrap.dataset.points || "[]");
      const coords = JSON.parse(wrap.dataset.coords || "[]");
      const unit = wrap.dataset.unit || "";
      const vb = svg.getAttribute("viewBox").split(" ").map(Number);
      const vbW = vb[2] || 780;
      const vbH = vb[3] || 232;
      const cursor = svg.querySelector(".mc-cursor");
      const dot = svg.querySelector(".mc-dot");
      svg.addEventListener("mousemove", (e) => {
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        const vx = ((e.clientX - rect.left) / rect.width) * vbW;
        let idx = 0;
        let best = Infinity;
        coords.forEach((c, i) => {
          const d = Math.abs(c.x - vx);
          if (d < best) {
            best = d;
            idx = i;
          }
        });
        const c = coords[idx];
        const p = pts[idx];
        if (!c || !p) return;
        cursor?.setAttribute("x1", c.x);
        cursor?.setAttribute("x2", c.x);
        cursor?.setAttribute("opacity", "0.5");
        dot?.setAttribute("cx", c.x);
        dot?.setAttribute("cy", c.y);
        dot?.setAttribute("opacity", "1");
        tip.innerHTML = `<span class="mc-tip-x">${esc(p.label)}</span><b>${p.value.toLocaleString()}${unit ? ` ${esc(unit)}` : ""}</b>`;
        tip.style.left = `${(c.x / vbW) * rect.width}px`;
        tip.style.top = `${(c.y / vbH) * rect.height}px`;
        tip.classList.add("show");
      });
      svg.addEventListener("mouseleave", () => {
        tip.classList.remove("show");
        cursor?.setAttribute("opacity", "0");
        dot?.setAttribute("opacity", "0");
      });
    });
  }

  let monitorDocBound = false;

  function renderMonitor(root) {
    // 监控看板不显示页面标题栏（含分割线）
    document.querySelector(".page-head")?.classList.add("hidden");

    const scene = state.monitorScene;
    const sceneLabel = (MONITOR_SCENES.find((s) => s.id === scene) || MONITOR_SCENES[0]).label;
    const factor = MONITOR_SCENE_FACTOR[scene] || MONITOR_SCENE_FACTOR.all;

    // 三张卡片各自独立的时间上下文
    const volCtx = monitorSeriesCtx("vol");
    const rCtx = monitorSeriesCtx("retrieve");
    const eCtx = monitorSeriesCtx("extract");

    const volPts = monitorVolumeSeries(scene, "vol");
    const volStat = monitorStats(volPts);
    const half = Math.floor(volPts.length / 2);
    const earlier = volPts.slice(0, half).reduce((a, b) => a + b.value, 0);
    const later = volPts.slice(half).reduce((a, b) => a + b.value, 0);
    const delta = earlier ? ((later - earlier) / earlier) * 100 : 0;
    const peak = volPts.reduce((a, b) => (b.value > a.value ? b : a), volPts[0]);

    const rm = MONITOR_RETRIEVE_METRICS.find((m) => m.id === state.monitorRetrieveMetric) || MONITOR_RETRIEVE_METRICS[0];
    const rPts = monitorLatencySeries(scene, rm.id, "retrieve");
    const rStat = monitorStats(rPts);

    const em = MONITOR_EXTRACT_METRICS.find((m) => m.id === state.monitorExtractMetric) || MONITOR_EXTRACT_METRICS[0];
    const ePts = monitorLatencySeries(scene, em.id, "extract");
    const eStat = monitorStats(ePts);

    // 请求级明细（列表视图用），与折线的聚合均值同趋势；总量卡片直接用聚合序列
    const rRows = monitorDetailRows(rPts, "retrieve", { hourly: rCtx.hourly, tag: rm.id });
    const eRows = monitorDetailRows(ePts, "extract", { hourly: eCtx.hourly, tag: em.id });

    const view = state.monitorView;

    // 卡片头部的视图切换（图标按钮），三个卡片共用同一 state
    const viewSeg = `
      <div class="mon-view-seg" role="group" aria-label="展示形式">
        <button type="button" data-view="chart" class="${view === "chart" ? "active" : ""}" title="图表" aria-label="图表">${MON_ICON_CHART}</button>
        <button type="button" data-view="table" class="${view === "table" ? "active" : ""}" title="列表" aria-label="列表">${MON_ICON_LIST}</button>
      </div>`;

    // 日期区间触发器 + 下拉面板（每卡片独立）
    const datePicker = (key) => {
      const { start, end } = monitorDateRange(key);
      return `
        <button type="button" class="mon-date-btn" data-range="${key}" aria-haspopup="true" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>
          <span>${esc(monitorDateLabel(start))} - ${esc(monitorDateLabel(end))}</span>
        </button>
        <div class="mon-date-pop hidden" data-pop="${key}">
          <div class="mon-date-row">
            <label class="mon-date-input"><span>开始</span><input type="date" data-dstart="${key}" value="${esc(start)}" /></label>
            <label class="mon-date-input"><span>结束</span><input type="date" data-dend="${key}" value="${esc(end)}" /></label>
          </div>
          <div class="mon-date-quick">
            ${MONITOR_QUICK_RANGES.map(
              (q) => `<button type="button" data-quick="${q.days}" data-quick-key="${key}">${esc(q.label)}</button>`
            ).join("")}
          </div>
          <div class="mon-date-foot">
            <button type="button" class="btn btn-sm btn-secondary" data-dact="cancel">取消</button>
            <button type="button" class="btn btn-sm btn-primary" data-dact="apply" data-apply="${key}">确定</button>
          </div>
        </div>`;
    };

    const grainOf = (ctx) => (ctx.hourly ? "小时" : "日");
    const callsOf = (ctx) => factor.calls * (ctx.hourly ? 1 : ctx.days);

    root.innerHTML = `
      <div class="mon-app-bar">
        <label class="mon-app-field">
          <span>智能体应用</span>
          <select class="select" id="mon-scene-select" aria-label="智能体应用">
            ${MONITOR_SCENES.map(
              (s) => `<option value="${s.id}"${s.id === scene ? " selected" : ""}>${esc(s.label)}</option>`
            ).join("")}
          </select>
        </label>
      </div>
      <div class="mon-grid">
        <section class="panel mon-panel">
          <div class="panel-hd">
            <h3>记忆提取总量</h3>
            <div class="mon-hd-right">
              ${datePicker("vol")}
              ${viewSeg}
            </div>
          </div>
          <div class="panel-bd">
            <div class="mon-metrics">
              <div class="mon-metric"><span>总提取量</span><b>${volStat.total.toLocaleString()}<i>条</i></b></div>
              <div class="mon-metric"><span>环比</span><b class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}%</b></div>
              <div class="mon-metric"><span>峰值量</span><b>${peak.value.toLocaleString()}<i>条</i></b></div>
              <div class="mon-metric"><span>${grainOf(volCtx)}均</span><b>${Math.round(volStat.avg).toLocaleString()}<i>条</i></b></div>
            </div>
            ${view === "chart"
              ? monitorTrendChart(volPts, {
                  color: "#5b5fc7",
                  unit: "条",
                  aria: `${sceneLabel} 记忆提取总量趋势`,
                  w: 460,
                  h: 138,
                })
              : monitorAggTable(volPts, {
                  unit: "条",
                  label: `${grainOf(volCtx)}提取量`,
                  timeLabel: volCtx.hourly ? "时间" : "日期",
                  key: "vol",
                })}
          </div>
        </section>

        <section class="panel mon-panel">
          <div class="panel-hd">
            <h3>记忆检索接口耗时</h3>
            <div class="mon-hd-right">
              ${datePicker("retrieve")}
              <select class="select" id="mon-retrieve-select" aria-label="检索耗时口径">
                ${MONITOR_RETRIEVE_METRICS.map(
                  (m) => `<option value="${m.id}"${m.id === rm.id ? " selected" : ""}>${esc(m.label)}</option>`
                ).join("")}
              </select>
              ${viewSeg}
            </div>
          </div>
          <div class="panel-bd">
            <div class="mon-metrics">
              <div class="mon-metric"><span>平均耗时</span><b>${rStat.avg}<i>ms</i></b></div>
              <div class="mon-metric"><span>P95 耗时</span><b>${rStat.p95}<i>ms</i></b></div>
              <div class="mon-metric"><span>峰值耗时</span><b>${rStat.max}<i>ms</i></b></div>
              <div class="mon-metric"><span>调用量</span><b>${callsOf(rCtx).toLocaleString()}<i>次</i></b></div>
            </div>
            ${view === "chart"
              ? monitorTrendChart(rPts, {
                  color: rm.color,
                  unit: "ms",
                  aria: `${sceneLabel} ${rm.label}趋势`,
                  w: 460,
                  h: 138,
                })
              : monitorDetailTable(rRows, {
                  unit: "ms",
                  label: rm.label,
                  timeLabel: "请求时间",
                  key: "retrieve",
                })}
          </div>
        </section>

        <section class="panel mon-panel">
          <div class="panel-hd">
            <h3>记忆提取接口耗时</h3>
            <div class="mon-hd-right">
              ${datePicker("extract")}
              <select class="select" id="mon-extract-select" aria-label="提取耗时口径">
                ${MONITOR_EXTRACT_METRICS.map(
                  (m) => `<option value="${m.id}"${m.id === em.id ? " selected" : ""}>${esc(m.label)}</option>`
                ).join("")}
              </select>
              ${viewSeg}
            </div>
          </div>
          <div class="panel-bd">
            <div class="mon-metrics">
              <div class="mon-metric"><span>平均耗时</span><b>${eStat.avg}<i>ms</i></b></div>
              <div class="mon-metric"><span>P95 耗时</span><b>${eStat.p95}<i>ms</i></b></div>
              <div class="mon-metric"><span>峰值耗时</span><b>${eStat.max}<i>ms</i></b></div>
              <div class="mon-metric"><span>调用量</span><b>${callsOf(eCtx).toLocaleString()}<i>次</i></b></div>
            </div>
            ${view === "chart"
              ? monitorTrendChart(ePts, {
                  color: em.color,
                  unit: "ms",
                  aria: `${sceneLabel} ${em.label}趋势`,
                  w: 460,
                  h: 138,
                })
              : monitorDetailTable(eRows, {
                  unit: "ms",
                  label: em.label,
                  timeLabel: "请求时间",
                  key: "extract",
                })}
          </div>
        </section>
      </div>`;

    // ---- 日期区间交互 ----
    $$(".mon-date-btn", root).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.dataset.range;
        const pop = $(`.mon-date-pop[data-pop="${key}"]`, root);
        const willOpen = pop?.classList.contains("hidden");
        $$(".mon-date-pop", root).forEach((p) => p.classList.add("hidden"));
        if (willOpen) {
          pop.classList.remove("hidden");
          btn.setAttribute("aria-expanded", "true");
        }
      });
    });
    $$("[data-quick]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        const days = Number(btn.dataset.quick);
        const pop = btn.closest(".mon-date-pop");
        const sIn = pop?.querySelector("[data-dstart]");
        const eIn = pop?.querySelector("[data-dend]");
        if (sIn) sIn.value = monitorShiftStr(days);
        if (eIn) eIn.value = monitorTodayStr();
      });
    });
    $$("[data-dact='cancel']", root).forEach((btn) => {
      btn.addEventListener("click", () => btn.closest(".mon-date-pop")?.classList.add("hidden"));
    });
    $$("[data-apply]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.apply;
        const pop = btn.closest(".mon-date-pop");
        const s = pop?.querySelector("[data-dstart]")?.value;
        const e = pop?.querySelector("[data-dend]")?.value;
        if (!s || !e) {
          toast("请选择完整的开始与结束日期");
          return;
        }
        state.monitorDates[key] = { start: s, end: e };
        state.monitorPage = { vol: 1, retrieve: 1, extract: 1 };
        renderMonitor(root);
      });
    });
    // 点击面板外关闭（全局只绑一次，避免递归渲染重复绑定）
    if (!monitorDocBound) {
      monitorDocBound = true;
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".mon-date-pop") && !e.target.closest(".mon-date-btn")) {
          document.querySelectorAll(".mon-date-pop").forEach((p) => p.classList.add("hidden"));
          document.querySelectorAll(".mon-date-btn").forEach((b) => b.setAttribute("aria-expanded", "false"));
        }
      });
    }

    $("#mon-scene-select", root)?.addEventListener("change", (e) => {
      state.monitorScene = e.target.value;
      renderMonitor(root);
    });
    $("#mon-retrieve-select", root)?.addEventListener("change", (e) => {
      state.monitorRetrieveMetric = e.target.value;
      renderMonitor(root);
    });
    $("#mon-extract-select", root)?.addEventListener("change", (e) => {
      state.monitorExtractMetric = e.target.value;
      renderMonitor(root);
    });
    $$(".mon-view-seg button", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.monitorView = btn.dataset.view;
        state.monitorPage = { vol: 1, retrieve: 1, extract: 1 };
        renderMonitor(root);
      });
    });
    // 列表分页：点击具体页码 / 首尾页
    $$("[data-mnav]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.mnav;
        const target = Number(btn.dataset.mpage);
        if (!Number.isFinite(target) || target < 1) return;
        state.monitorPage[key] = target;
        renderMonitor(root);
      });
    });
    // 表头排序
    $$("[data-msort]", root).forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.mkey;
        const field = th.dataset.msort;
        const cur = state.monitorSort?.[key] || { field: "time", dir: "desc" };
        state.monitorSort[key] =
          cur.field === field
            ? { field, dir: cur.dir === "asc" ? "desc" : "asc" }
            : { field, dir: field === "time" ? "desc" : "asc" };
        state.monitorPage[key] = 1;
        renderMonitor(root);
      });
    });
    bindMonitorCharts(root);
  }

  function renderVerify(root) {
    setPageTitle("记忆验证", `<button class="btn btn-primary btn-sm" id="btn-run-verify">运行验证</button>`);
    root.innerHTML = `
      <div class="panel" style="margin-bottom:14px">
        <div class="panel-hd"><h3>验证配置</h3></div>
        <div class="panel-bd">
          <label class="field"><span>参数配置</span>
            <select class="select" id="vf-cfg">
              <option>当前生效配置</option>
              <option>草稿配置 v2</option>
            </select>
          </label>
          <label class="field"><span>验证范围</span>
            <select class="select" id="vf-scope">
              <option>全部记忆主体</option>
              <option>仅近期变更</option>
            </select>
          </label>
        </div>
      </div>
      <div class="panel">
        <div class="panel-hd"><h3>验证结果</h3></div>
        <div class="panel-bd">
          <div class="empty-state" style="padding:40px 0">
            <p style="color:var(--ink-3)">点击「运行验证」开始检测</p>
          </div>
        </div>
      </div>`;
    $("#btn-run-verify")?.addEventListener("click", () => toast("验证任务已提交（演示）"));
  }

  /* ---------- graph detail panel ---------- */
  function clearGraphDetailPanel() {
    const panel = $("#graph-detail-panel");
    if (panel) {
      panel.innerHTML = "";
      panel.classList.add("hidden");
      panel.setAttribute("aria-hidden", "true");
    }
    const wrap = panel?.closest(".pg-graph-body");
    wrap?.classList.remove("has-detail");
    const um = $("#um-detail-panel");
    if (um) {
      um.innerHTML = `<div class="um-detail-empty">点击图谱中的实体或关系查看详情</div>`;
    }
    hideGraphFloat();
    requestAnimationFrame(() => state.graphInstance?._resize?.());
  }

  function hideGraphFloat() {
    const tip = $("#graph-float");
    if (tip) tip.classList.add("hidden");
  }

  function fillDetailHtml(sel) {
    if (sel.kind === "node") {
      const n = sel.data;
      const cat = n.category || LEGACY_TYPE_MAP[n.type] || n.type;
      const meta = ENTITY_TYPE_META.find((t) => t.id === cat);
      const keywords =
        n.props?.keywords ||
        n.keywords ||
        (n.label === "Taylor Swift"
          ? ["Taylor Swift", "演出", "MSG", "演唱会"]
          : [n.label, n.type].filter(Boolean));
      const kw = Array.isArray(keywords) ? keywords.join(", ") : String(keywords);
      const entityType =
        n.props?.entityType ||
        n.props?.风格 ||
        (n.label === "Taylor Swift" ? "歌手" : n.type || "—");
      const desc =
        n.summary ||
        n.description ||
        (n.label === "Taylor Swift"
          ? "美国著名流行音乐歌手，计划在麦迪逊广场花园举办演唱会。"
          : "—");
      return `
        <div class="graph-detail-hd">
          <h3>实体详情</h3>
          <span class="entity-type-pill">${esc(cat)}</span>
        </div>
        <div class="entity-hero">
          <span class="entity-hero-ico" style="background:${meta?.color || "#2563eb"}" aria-hidden="true"></span>
          <div>
            <div class="graph-detail-title">${esc(n.label)}</div>
          </div>
        </div>
        <div class="graph-detail-rows">
          <div class="detail-row"><span class="k">UUID</span><span class="v mono">${esc(n.uuid || n.id)}</span></div>
          <div class="detail-row"><span class="k">创建时间</span><span class="v">${esc(fmtStamp(n.createdAt, true))}</span></div>
          <div class="detail-row"><span class="k">实体类型</span><span class="v">${esc(entityType)}</span></div>
          <div class="detail-row"><span class="k">关键词</span><span class="v">${esc(kw)}</span></div>
        </div>
        <div class="graph-detail-summary">
          <div class="k">描述</div>
          <p>${esc(desc)}</p>
        </div>`;
    }
    const e = sel.data;
    return `
      <div class="graph-detail-hd">
        <h3>关系详情</h3>
        <span class="chip active">${esc(e.label)}</span>
      </div>
      <div class="graph-detail-rows">
        <div class="detail-row"><span class="k">UUID</span><span class="v mono">${esc(e.uuid || e.id)}</span></div>
        <div class="detail-row"><span class="k">描述</span><span class="v">${esc(e.description || "—")}</span></div>
        <div class="detail-row"><span class="k">创建时间</span><span class="v">${esc(fmtStamp(e.createdAt, true))}</span></div>
        <div class="detail-row"><span class="k">失效时间</span><span class="v">${e.expiresAt ? esc(fmtStamp(e.expiresAt, true)) : "永久有效"}</span></div>
      </div>`;
  }

  function openGraphDetail(sel) {
    if (!sel || sel.kind === "clear") {
      clearGraphDetailPanel();
      closeDrawer();
      return;
    }

    const umPanel = $("#um-detail-panel");
    if (umPanel) {
      umPanel.innerHTML = fillDetailHtml(sel);
      state.umRightOpen = true;
      syncUmPanels();
      closeDrawer();
      return;
    }

    const panel = $("#graph-detail-panel");
    if (panel) {
      panel.innerHTML = fillDetailHtml(sel);
      panel.classList.remove("hidden");
      panel.setAttribute("aria-hidden", "false");
      panel.closest(".pg-graph-body")?.classList.add("has-detail");
      requestAnimationFrame(() => state.graphInstance?._resize?.());
      closeDrawer();
      return;
    }

    const drawer = $("#detail-drawer");
    const body = $("#drawer-body");
    const title = $("#drawer-title");
    $("#drawer-backdrop").classList.remove("hidden");
    drawer.classList.remove("hidden");
    drawer.setAttribute("aria-hidden", "false");
    body.innerHTML = fillDetailHtml(sel);
    title.textContent = sel.kind === "node" ? "实体详情" : "关系详情";
  }

  function closeDrawer() {
    $("#detail-drawer").classList.add("hidden");
    $("#drawer-backdrop").classList.add("hidden");
    $("#detail-drawer").setAttribute("aria-hidden", "true");
  }

  function destroyGraph() {
    if (state.graphFullscreen) exitGraphFullscreen();
    if (state._closeEntityFilter) {
      document.removeEventListener("click", state._closeEntityFilter);
      state._closeEntityFilter = null;
    }
    if (state._graphFsEsc) {
      document.removeEventListener("keydown", state._graphFsEsc);
      state._graphFsEsc = null;
    }
    clearGraphDetailPanel();
    if (state.graphInstance) {
      state.graphInstance.destroy();
      state.graphInstance = null;
    }
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* icons */
  function iconLayers() {
    return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/></svg>`;
  }
  function iconTune() {
    return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h10M18 7h2M12 17h8M4 17h4"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>`;
  }
  function iconDatabase() {
    return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>`;
  }
  function iconShield() {
    return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>`;
  }
  function iconShare() {
    return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 11l7.4-4M8.3 13l7.4 4"/></svg>`;
  }
  function iconChart() {
    return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5M4 19h16"/><path d="M8 15v-4M12 15V8M16 15v-6"/></svg>`;
  }
  function iconBook() {
    return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 00-3 3V4z"/><path d="M5 20a3 3 0 013-3h12"/></svg>`;
  }
  function iconEngine() {
    return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></svg>`;
  }
  function iconActivity() {
    return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
  }
  function iconCheck() {
    return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6L9 17l-5-5"/></svg>`;
  }

  function ensureEngineBaseline(space) {
    if (!space) return null;
    if (!state.engineBaselineBySpace) state.engineBaselineBySpace = {};
    if (!state.engineBaselineBySpace[space.id]) {
      state.engineBaselineBySpace[space.id] = cloneConfig(space.config);
    }
    return state.engineBaselineBySpace[space.id];
  }

  function defaultForgetDraft(space) {
    const presets = {
      "sp-concert": { lambdaTime: 0.08, lambdaMem: 0.05, threshold: 0.35, intervalHours: 6 },
      "sp-travel": { lambdaTime: 0.12, lambdaMem: 0.06, threshold: 0.4, intervalHours: 12 },
      "sp-hr": { lambdaTime: 0.05, lambdaMem: 0.04, threshold: 0.28, intervalHours: 24 },
    };
    const saved = space?.config?.forget || {};
    return {
      enabled: true,
      lambdaTime: 0.08,
      lambdaMem: 0.05,
      offset: 0.15,
      decayCoef: 1.5,
      maxHistory: 50,
      threshold: 0.35,
      minUnvisitedDays: 7,
      useLlm: true,
      maxMergeNodes: 8,
      intervalHours: 6,
      ...(presets[space?.id] || {}),
      ...saved,
    };
  }

  function defaultReflectDraft(space) {
    const presets = {
      "sp-concert": { model: "reflect-pro", period: "daily", scope: "recent" },
      "sp-travel": { model: "reflect-lite", period: "6h", scope: "incremental" },
      "sp-hr": { model: "reflect-pro", period: "weekly", scope: "high", baseline: "topic" },
    };
    const saved = space?.config?.reflect || {};
    return {
      enabled: true,
      model: "reflect-pro",
      period: "daily",
      scope: "recent",
      baseline: "chrono",
      qualityAssess: true,
      memoryAudit: true,
      ...(presets[space?.id] || {}),
      ...saved,
    };
  }

  function defaultRetrieveDraft(space) {
    const r = space?.config?.retrieve || {};
    return {
      enabled: r.enabled !== false,
      model: r.model || "mem-extract-pro",
      mode: "realtime",
      topK: Number(r.topK) || 8,
      sim: Number(r.similarity) || 0.62,
      vectorWeight: Number(r.vectorWeight) ?? 70,
    };
  }

  function ensureEngineDraft(space) {
    const spaceId = space?.id || state.spaceId || "_";
    if (!state.engineDraftBySpace) state.engineDraftBySpace = {};
    if (!state.engineDraftBySpace[spaceId]) {
      state.engineDraftBySpace[spaceId] = {
        retrieve: defaultRetrieveDraft(space),
        forget: defaultForgetDraft(space),
        reflect: defaultReflectDraft(space),
      };
    }
    const draft = state.engineDraftBySpace[spaceId];
    normalizeReflectDraft(draft);
    return draft;
  }

  function normalizeReflectDraft(draft) {
    const r = draft?.reflect;
    if (!r) return;
    if (!r.period) {
      const hours = Number(r.interval) || 24;
      r.period = hours <= 1 ? "hourly" : hours <= 6 ? "6h" : hours <= 24 ? "daily" : "weekly";
    }
    if (!r.scope) r.scope = "recent";
    if (!r.baseline) r.baseline = "chrono";
    if (typeof r.qualityAssess !== "boolean") r.qualityAssess = true;
    if (typeof r.memoryAudit !== "boolean") r.memoryAudit = true;
    if (!r.model) r.model = "reflect-pro";
    if (typeof r.enabled !== "boolean") r.enabled = true;
  }

  function engineActionIcon(kind) {
    if (kind === "reset") {
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 0115.5-6.4"/><path d="M21 3v6h-6"/><path d="M21 12a9 9 0 01-15.5 6.4"/><path d="M3 21v-6h6"/></svg>`;
    }
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`;
  }

  function confirmEngineAction({ title, desc, confirmLabel, danger = false, onConfirm }) {
    const host = $("#modal-host");
    if (!host) return;
    host.innerHTML = `
      <div class="modal-backdrop" id="engine-confirm-modal">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="engine-confirm-title">
          <div class="modal-hd">
            <h3 id="engine-confirm-title">${esc(title)}</h3>
            <button type="button" class="icon-btn" id="modal-x" aria-label="关闭">×</button>
          </div>
          <div class="modal-bd">
            <p class="modal-desc">${esc(desc)}</p>
          </div>
          <div class="modal-ft">
            <button type="button" class="btn btn-secondary" id="modal-cancel">取消</button>
            <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" id="modal-confirm">${esc(confirmLabel)}</button>
          </div>
        </div>
      </div>`;
    const close = () => {
      host.innerHTML = "";
    };
    $("#modal-x", host).onclick = close;
    $("#modal-cancel", host).onclick = close;
    $("#engine-confirm-modal", host).addEventListener("click", (e) => {
      if (e.target.id === "engine-confirm-modal") close();
    });
    $("#modal-confirm", host).onclick = () => {
      close();
      onConfirm?.();
    };
  }

  function renderProdEngineForm(tab, space, locked) {
    const cfg = space.config;
    ensureReflect(cfg);
    ensureRetrieve(cfg);
    const meta =
      tab === "extract"
        ? ["萃取引擎", "配置生产环境提取提示词、模型与记忆类型"]
        : ["检索引擎", "配置生产环境召回数量、相似度阈值与多路检索权重"];
    const body = tab === "extract" ? renderExtractForm(cfg, locked) : renderRetrieveForm(cfg, locked);
    return `
      <div class="params-grid params-grid-single engine-prod-grid">
        <section class="params-card">
          <header class="params-card-hd params-card-hd-engine">
            <div class="params-card-hd-text">
              <h3>${meta[0]}</h3>
              <p>${meta[1]}</p>
            </div>
            <span class="badge badge-green">生产生效中</span>
          </header>
          ${body}
        </section>
      </div>`;
  }

  function renderEngineParams(root) {
    const spaces = accessibleSpaces();
    const space = spaceById(state.spaceId) || spaces[0];
    if (!space) {
      root.innerHTML = `<div class="empty-state">请先选择记忆空间</div>`;
      return;
    }
    state.spaceId = space.id;
    ensureEngineBaseline(space);
    let tab = state.engineTab || "extract";
    if (!["extract", "retrieve", "forget", "reflect"].includes(tab)) tab = "extract";
    state.engineTab = tab;
    const d = ensureEngineDraft(space);
    const opsLocked = !canManageOps(space.id);
    const tabs = [
      ["extract", "萃取引擎"],
      ["retrieve", "检索引擎"],
      ["forget", "遗忘引擎"],
      ["reflect", "反思引擎"],
    ];
    const isProdForm = tab === "extract" || tab === "retrieve";
    setPageTitle("", "");
    const pane = isProdForm
      ? renderProdEngineForm(tab, space, opsLocked)
      : tab === "forget"
        ? renderForgetEngine(d.forget)
        : renderReflectEngine(d.reflect);
    const spaceOptions = spaces
      .map((s) => `<option value="${esc(s.id)}" ${s.id === space.id ? "selected" : ""}>${esc(s.name)}</option>`)
      .join("");
    root.innerHTML = `
      <div class="engine-page">
        <div class="engine-space-bar">
          <label class="engine-space-pick" for="engine-space-select">
            <span>记忆空间</span>
            <select id="engine-space-select" class="select engine-space-select" title="切换当前配置所属记忆空间">
              ${spaceOptions}
            </select>
          </label>
          <p class="engine-space-hint">不同记忆空间的引擎参数相互独立，切换后将加载该空间的配置。</p>
        </div>
        <div class="engine-tabs-row">
          <div class="engine-tabs" role="tablist">
            ${tabs
              .map(
                ([id, label]) =>
                  `<button type="button" class="engine-tab ${tab === id ? "active" : ""}" data-engine-tab="${id}" role="tab" aria-selected="${tab === id}">${label}</button>`
              )
              .join("")}
          </div>
          <div class="engine-tabs-actions">
            <button type="button" class="btn btn-secondary engine-act-btn" id="engine-reset" ${opsLocked ? "disabled" : ""}>
              ${engineActionIcon("reset")}
              恢复默认
            </button>
            <button type="button" class="btn btn-primary engine-act-btn" id="engine-save" ${opsLocked ? "disabled" : ""}>
              ${engineActionIcon("save")}
              保存并下发
            </button>
          </div>
        </div>
        ${
          isProdForm
            ? `<div class="engine-prod-body">${opsLocked ? `<p class="badge badge-warn">当前账号仅可查看，无空间运维权限</p>` : ""}${pane}</div>`
            : `<div class="engine-split">
                <section class="engine-form">${pane}</section>
                <aside class="engine-preview">${renderEnginePreview(tab, d)}</aside>
              </div>`
        }
      </div>`;

    $("#engine-space-select", root)?.addEventListener("change", (e) => {
      state.spaceId = e.target.value;
      renderPage();
    });

    $$("[data-engine-tab]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.engineTab = btn.dataset.engineTab;
        renderPage();
      });
    });

    if (isProdForm) {
      bindConfigForms(root, space, opsLocked);
    } else {
      root.querySelectorAll("[data-eng]").forEach((el) => {
        const key = el.dataset.eng;
        const apply = () => {
          const cur = d[tab];
          if (el.type === "checkbox") cur[key] = el.checked;
          else if (el.type === "range" || el.type === "number") cur[key] = Number(el.value);
          else cur[key] = el.value;
          const em = el.closest(".fg-row, .engine-switch")?.querySelector("em");
          if (el.type === "checkbox" && em) em.textContent = el.checked ? "已启用" : "已关闭";
          const lab = root.querySelector(`[data-eng-val="${key}"]`);
          if (lab) lab.textContent = formatEngVal(key, cur[key]);
          if (tab === "reflect" && key === "enabled") {
            const badge = root.querySelector(".engine-form .engine-hd .badge");
            if (badge) {
              badge.className = `badge ${cur.enabled ? "badge-green" : "badge-warn"}`;
              badge.textContent = cur.enabled ? "生效中" : "未启用";
            }
          }
          const preview = root.querySelector(".engine-preview");
          if (preview) preview.innerHTML = renderEnginePreview(tab, d);
        };
        el.addEventListener("input", apply);
        el.addEventListener("change", apply);
      });
    }

    $("#engine-reset")?.addEventListener("click", () => {
      if (opsLocked) return;
      const label = tabs.find(([id]) => id === tab)?.[1] || "引擎";
      confirmEngineAction({
        title: `恢复${label}默认参数？`,
        desc: `将丢弃「${space.name}」当前未保存的修改，恢复为该引擎的默认生产参数。恢复后需再点击「保存并下发」才会写入生产环境。`,
        confirmLabel: "恢复默认",
        danger: true,
        onConfirm: () => {
          if (isProdForm) {
            const baseline = ensureEngineBaseline(space);
            if (tab === "extract" && baseline?.extract) {
              space.config.extract = cloneConfig(baseline.extract);
            } else if (tab === "retrieve" && baseline?.retrieve) {
              space.config.retrieve = cloneConfig(baseline.retrieve);
            }
            syncPresetCurrent(space);
          } else if (tab === "forget") {
            const next = defaultForgetDraft({ id: space.id, config: {} });
            d.forget = { ...next };
            delete space.config.forget;
          } else if (tab === "reflect") {
            const next = defaultReflectDraft({ id: space.id, config: {} });
            d.reflect = { ...next };
            delete space.config.reflect;
          }
          toast(`已恢复「${space.name}」${label}默认参数`);
          renderPage();
        },
      });
    });

    $("#engine-save")?.addEventListener("click", () => {
      if (opsLocked) return;
      const label = tabs.find(([id]) => id === tab)?.[1] || "引擎";
      const effectHint =
        tab === "extract"
          ? `确认后参数将写入「${space.name}」的生产萃取引擎配置并立即下发生效，影响线上记忆抽取。`
          : tab === "retrieve"
            ? `确认后参数将写入「${space.name}」的生产检索引擎配置并立即下发生效，影响线上记忆检索。`
            : `确认后将保存并下发「${space.name}」的${label}生产参数。`;
      confirmEngineAction({
        title: `保存并下发${label}？`,
        desc: effectHint,
        confirmLabel: "保存并下发",
        onConfirm: () => {
          if (isProdForm) {
            const ok =
              tab === "extract"
                ? writeExtractToConfig(root, space.config)
                : writeRetrieveToConfig(root, space.config);
            if (!ok) {
              toast("保存失败，请检查表单");
              return;
            }
            syncPresetCurrent(space);
            space.updatedAt = new Date().toISOString();
          } else if (tab === "forget") {
            space.config.forget = { ...d.forget };
            space.updatedAt = new Date().toISOString();
          } else if (tab === "reflect") {
            space.config.reflect = { ...d.reflect };
            space.updatedAt = new Date().toISOString();
          }
          toast(`「${space.name}」${label}参数已保存并下发`);
          renderPage();
        },
      });
    });
  }

  function formatEngVal(key, val) {
    if (["sim", "threshold", "lambdaTime", "lambdaMem", "offset"].includes(key)) return Number(val).toFixed(2);
    if (key === "decayCoef") return Number(val).toFixed(1);
    if (key === "vectorWeight") return `向量 ${val}%`;
    return String(val);
  }

  function forgetWeight(f, day, profile) {
    const offset = Math.min(0.9, Math.max(0, Number(f.offset) || 0));
    const span = 1 - offset;
    let lambda;
    if (profile === "fast") lambda = 0.25;
    else if (profile === "slow") lambda = 0.02;
    else {
      const coef = Number(f.decayCoef) || 1.5;
      lambda =
        (Number(f.lambdaTime) || 0.08) * (coef / 1.5) + (Number(f.lambdaMem) || 0.05) * 0.6;
    }
    return Math.max(0, Math.min(1.08, offset + span * Math.exp(-lambda * day)));
  }

  function forgetCrossDay(f) {
    const limit = Number(f.threshold) || 0.35;
    for (let d = 1; d <= 60; d++) {
      if (forgetWeight(f, d) < limit) return d;
    }
    return null;
  }

  function forgetChartGeom() {
    return { padL: 40, padR: 16, padT: 22, padB: 36, w: 360, h: 220, maxDay: 30, maxW: 1.15 };
  }

  function forgetXy(day, weight, g = forgetChartGeom()) {
    const plotW = g.w - g.padL - g.padR;
    const plotH = g.h - g.padT - g.padB;
    const x = g.padL + (day / g.maxDay) * plotW;
    const y = g.padT + (1 - Math.min(g.maxW, Math.max(0, weight)) / g.maxW) * plotH;
    return { x, y };
  }

  function forgetCurvePath(fn, g = forgetChartGeom()) {
    const pts = [];
    for (let d = 0; d <= g.maxDay; d += 0.5) {
      const { x, y } = forgetXy(d, fn(d), g);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }

  function forgetAreaPath(fn, g = forgetChartGeom()) {
    const base = g.h - g.padB;
    const start = forgetXy(0, fn(0), g);
    let d = `M ${start.x.toFixed(1)} ${base.toFixed(1)} L ${start.x.toFixed(1)} ${start.y.toFixed(1)}`;
    for (let day = 0.5; day <= g.maxDay; day += 0.5) {
      const p = forgetXy(day, fn(day), g);
      d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
    const end = forgetXy(g.maxDay, fn(g.maxDay), g);
    d += ` L ${end.x.toFixed(1)} ${base.toFixed(1)} Z`;
    return d;
  }

  function renderRetrieveEngine(c) {
    return `
      <header class="engine-hd">
        <div>
          <h3>检索引擎</h3>
          <p>控制记忆召回的模型、数量与相似度。</p>
        </div>
        <span class="badge badge-green">v2.4.1 生效中</span>
      </header>
      <label class="engine-switch">
        <span>启用检索引擎</span>
        <input type="checkbox" data-eng="enabled" ${c.enabled ? "checked" : ""} />
        <em>${c.enabled ? "已启用" : "已关闭"}</em>
      </label>
      <label class="field"><span>记忆抽取模型</span>
        <select class="select" data-eng="model">
          ${["mem-extract-lite", "mem-extract-v2", "mem-extract-pro"]
            .map((m) => `<option ${m === c.model ? "selected" : ""} value="${m}">${m}${m === "mem-extract-pro" ? "（高精度）" : ""}</option>`)
            .join("")}
        </select>
      </label>
      <label class="field"><span>抽取模式</span>
        <select class="select" data-eng="mode">
          <option value="realtime" ${c.mode === "realtime" ? "selected" : ""}>实时抽取</option>
          <option value="batch" ${c.mode === "batch" ? "selected" : ""}>批量抽取</option>
        </select>
      </label>
      ${engineSlider("召回 Top-K", "每次检索返回的记忆条数", "topK", c.topK, 1, 20, 1)}
      ${engineSlider("相似度阈值", "低于该值的记忆不进入结果", "sim", c.sim, 0, 1, 0.01)}
      ${engineSlider("混合检索权重", "向量检索在混合召回中的占比", "vectorWeight", c.vectorWeight, 0, 100, 1)}
    `;
  }

  function renderForgetEngine(c) {
    const dis = "";
    const slider = (key, val, min, max, step) => `
      <div class="fg-slider">
        <b data-eng-val="${key}">${formatEngVal(key, val)}</b>
        <input type="range" data-eng="${key}" min="${min}" max="${max}" step="${step}" value="${val}" ${dis} />
      </div>`;
    const num = (key, val, min, max, step) =>
      `<input class="input fg-num" type="number" data-eng="${key}" min="${min}" max="${max}" step="${step}" value="${val}" ${dis} />`;
    const row = (title, hint, ctrl) => `
      <div class="fg-row">
        <div class="fg-meta"><strong>${title}</strong><span>${hint}</span></div>
        <div class="fg-ctrl">${ctrl}</div>
      </div>`;
    return `
      <header class="engine-hd">
        <div>
          <h3>遗忘引擎</h3>
          <p>模拟人类遗忘规律，通过衰减权重和阈值清理低权重、过期记忆。</p>
        </div>
        <span class="badge badge-warn">模拟运行中</span>
      </header>
      <div class="forget-form">
        ${row("时间衰减率 λ_time", "控制随时间自然衰减的速度，数值越大衰减越快", slider("lambdaTime", c.lambdaTime, 0.01, 0.4, 0.01))}
        ${row("记忆提取率 λ_mem", "访问越频繁，记忆强度越高，衰减越慢", slider("lambdaMem", c.lambdaMem, 0.01, 0.3, 0.01))}
        ${row("偏移量 Offset", "保留下限，避免重要记忆被完全清零", slider("offset", c.offset, 0, 0.5, 0.01))}
        ${row("衰减常数", "决定曲线形态，越大前期下降越陡", num("decayCoef", c.decayCoef, 0.2, 5, 0.1))}
        ${row("访问历史最大长度", "计算行为强度时保留的历史访问条数", num("maxHistory", c.maxHistory, 5, 200, 1))}
        ${row("遗忘阈值", "权重低于该值的记忆进入清理或降级", slider("threshold", c.threshold, 0.05, 0.9, 0.01))}
        ${row("最小未访问天数", "未访问达到该天数后才开始按曲线衰减", num("minUnvisitedDays", c.minUnvisitedDays, 0, 90, 1))}
        ${row(
          "使用 LLM 生成摘要",
          "压缩长对话并抽取核心意图，便于长期管理",
          `<label class="fg-switch"><input type="checkbox" data-eng="useLlm" ${c.useLlm ? "checked" : ""} /><em>${c.useLlm ? "已启用" : "已关闭"}</em></label>`
        )}
        ${row("单次最大融合节点数", "限制单次融合规模，避免语义丢失和上下文溢出", num("maxMergeNodes", c.maxMergeNodes, 1, 32, 1))}
        ${row(
          "遗忘周期间隔",
          "周期任务的执行频率，用于控制计算开销",
          `<select class="select fg-select" data-eng="intervalHours">
            ${[1, 6, 12, 24]
              .map((h) => `<option value="${h}" ${Number(c.intervalHours) === h ? "selected" : ""}>${h} 小时</option>`)
              .join("")}
          </select>`
        )}
      </div>`;
  }

  function reflectPeriodLabel(period) {
    return { hourly: "每小时", "6h": "每 6 小时", daily: "每日", weekly: "每周" }[period] || "每日";
  }

  function reflectScopeLabel(scope) {
    return { recent: "仅近期记忆", incremental: "仅新增记忆", all: "全部记忆", high: "仅高权重记忆" }[scope] || "仅近期记忆";
  }

  function reflectBaselineLabel(baseline) {
    return { chrono: "基于时间顺序", topic: "基于主题聚类", event: "基于事件关联" }[baseline] || "基于时间顺序";
  }

  function renderReflectEngine(c) {
    const row = (title, hint, ctrl) => `
      <div class="fg-row">
        <div class="fg-meta"><strong>${title}</strong><span>${hint}</span></div>
        <div class="fg-ctrl">${ctrl}</div>
      </div>`;
    const toggle = (key, on) =>
      `<label class="fg-switch"><input type="checkbox" data-eng="${key}" ${on ? "checked" : ""} /><em>${on ? "已启用" : "已关闭"}</em></label>`;
    return `
      <header class="engine-hd">
        <div>
          <h3>反思引擎</h3>
          <p>将碎片化经验整合为长期稳定的结构化认知。</p>
        </div>
        <span class="badge ${c.enabled ? "badge-green" : "badge-warn"}">${c.enabled ? "生效中" : "未启用"}</span>
      </header>
      <div class="forget-form reflect-form">
        ${row("启用反思引擎", "汇总增量记忆、提炼核心事实、过滤低价值内容", toggle("enabled", c.enabled))}
        ${row(
          "反思模型",
          "决定归纳深度与推理能力，强推理适合复杂认知沉淀",
          `<select class="select fg-select" data-eng="model">
            <option value="reflect-lite" ${c.model === "reflect-lite" ? "selected" : ""}>reflect-lite（轻量）</option>
            <option value="reflect-pro" ${c.model === "reflect-pro" ? "selected" : ""}>reflect-pro（强推理）</option>
          </select>`
        )}
        ${row(
          "迭代周期",
          "较短周期更新更频繁，但资源消耗更高",
          `<select class="select fg-select" data-eng="period">
            <option value="hourly" ${c.period === "hourly" ? "selected" : ""}>每小时</option>
            <option value="6h" ${c.period === "6h" ? "selected" : ""}>每 6 小时</option>
            <option value="daily" ${c.period === "daily" ? "selected" : ""}>每日</option>
            <option value="weekly" ${c.period === "weekly" ? "selected" : ""}>每周</option>
          </select>`
        )}
        ${row(
          "反思范围",
          "限定参与归纳的记忆集合，缩小范围可降低算力",
          `<select class="select fg-select" data-eng="scope">
            <option value="recent" ${c.scope === "recent" ? "selected" : ""}>仅近期记忆</option>
            <option value="incremental" ${c.scope === "incremental" ? "selected" : ""}>仅新增记忆</option>
            <option value="high" ${c.scope === "high" ? "selected" : ""}>仅高权重记忆</option>
            <option value="all" ${c.scope === "all" ? "selected" : ""}>全部记忆</option>
          </select>`
        )}
        ${row(
          "反思基线",
          "决定记忆如何重组（按时间、主题或事件）",
          `<select class="select fg-select" data-eng="baseline">
            <option value="chrono" ${c.baseline === "chrono" ? "selected" : ""}>基于时间顺序</option>
            <option value="topic" ${c.baseline === "topic" ? "selected" : ""}>基于主题聚类</option>
            <option value="event" ${c.baseline === "event" ? "selected" : ""}>基于事件关联</option>
          </select>`
        )}
        ${row("启用质量评估", "评估准确性、完整性与时效性", toggle("qualityAssess", c.qualityAssess))}
        ${row("启用记忆审核", "执行合规与安全检查，防止预测内容写入长期记忆", toggle("memoryAudit", c.memoryAudit))}
      </div>`;
  }

  function engineSlider(title, hint, key, val, min, max, step) {
    return `
      <div class="engine-slider">
        <div class="engine-slider-hd">
          <div><strong>${title}</strong><span>${hint}</span></div>
          <b data-eng-val="${key}">${formatEngVal(key, val)}</b>
        </div>
        <input type="range" data-eng="${key}" min="${min}" max="${max}" step="${step}" value="${val}" />
      </div>`;
  }

  function renderEnginePreview(tab, d) {
    if (tab === "forget") {
      const f = d.forget;
      const g = forgetChartGeom();
      const w = (day, profile) => forgetWeight(f, day, profile);
      const thresh = Number(f.threshold) || 0.35;
      const day7 = w(7);
      const day30 = w(30);
      const cross = forgetCrossDay(f);
      const p7 = forgetXy(7, day7, g);
      const p30 = forgetXy(30, day30, g);
      const plotL = g.padL;
      const plotR = g.w - g.padR;
      const plotB = g.h - g.padB;
      const plotT = g.padT;
      const threshY = forgetXy(0, thresh, g).y;
      const threshTagY = Math.max(plotT + 2, Math.min(plotB - 20, threshY - 14));
      const yTicks = [0, 0.5, 1.0, 1.15];
      const xTicks = [0, 7, 14, 21, 30];
      const fastPath = forgetCurvePath((day) =>
        forgetWeight({ ...f, lambdaTime: 0.25, lambdaMem: 0, decayCoef: 1.5, offset: f.offset }, day, "fast")
      );
      const slowPath = forgetCurvePath((day) => forgetWeight(f, day, "slow"));
      const nowPath = forgetCurvePath((day) => w(day));
      const nowArea = forgetAreaPath((day) => w(day));
      const gridY = yTicks
        .map((t) => {
          const y = forgetXy(0, t, g).y;
          return `<line class="fgc-grid" x1="${plotL}" y1="${y.toFixed(1)}" x2="${plotR}" y2="${y.toFixed(1)}" />
            <text class="fgc-tick" x="${plotL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end">${t.toFixed(2)}</text>`;
        })
        .join("");
      const gridX = xTicks
        .map((t) => {
          const x = forgetXy(t, 0, g).x;
          return `<line class="fgc-grid-v" x1="${x.toFixed(1)}" y1="${plotT}" x2="${x.toFixed(1)}" y2="${plotB}" />
            <text class="fgc-tick" x="${x.toFixed(1)}" y="${plotB + 16}" text-anchor="middle">${t === 0 ? "0" : `${t}天`}</text>`;
        })
        .join("");
      return `
        <div class="fg-preview">
          <header class="fg-preview-hd">
            <div>
              <h3>遗忘衰减曲线</h3>
              <p>权重随未访问天数变化 · λ_time ${Number(f.lambdaTime).toFixed(2)}</p>
            </div>
          </header>
          <div class="fg-chart-card">
            <svg class="fg-chart" viewBox="0 0 ${g.w} ${g.h}" role="img" aria-label="遗忘衰减曲线">
              <defs>
                <linearGradient id="fg-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#5b5fc7" stop-opacity="0.28"/>
                  <stop offset="100%" stop-color="#5b5fc7" stop-opacity="0.02"/>
                </linearGradient>
                <linearGradient id="fg-zone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#ff7d00" stop-opacity="0"/>
                  <stop offset="100%" stop-color="#ff7d00" stop-opacity="0.08"/>
                </linearGradient>
              </defs>
              <rect class="fgc-plot" x="${plotL}" y="${plotT}" width="${plotR - plotL}" height="${plotB - plotT}" rx="8"/>
              ${gridY}
              ${gridX}
              <rect x="${plotL}" y="${threshY}" width="${plotR - plotL}" height="${Math.max(0, plotB - threshY)}" fill="url(#fg-zone)"/>
              <line class="fgc-thresh" x1="${plotL}" y1="${threshY.toFixed(1)}" x2="${plotR}" y2="${threshY.toFixed(1)}" />
              <rect class="fgc-thresh-tag" x="${plotL + 8}" y="${threshTagY.toFixed(1)}" width="72" height="16" rx="4"/>
              <text class="fgc-thresh-label" x="${plotL + 44}" y="${(threshTagY + 11).toFixed(1)}" text-anchor="middle">阈值 ${thresh.toFixed(2)}</text>
              <polyline class="fgc-line fgc-fast" points="${fastPath}" />
              <polyline class="fgc-line fgc-slow" points="${slowPath}" />
              <path class="fgc-area" d="${nowArea}" />
              <polyline class="fgc-line fgc-now" points="${nowPath}" />
              <circle class="fgc-dot" cx="${p7.x.toFixed(1)}" cy="${p7.y.toFixed(1)}" r="3.5"/>
              <circle class="fgc-dot" cx="${p30.x.toFixed(1)}" cy="${p30.y.toFixed(1)}" r="3.5"/>
            </svg>
            <div class="fg-legend">
              <span><i class="lg-fast"></i>快速衰减 λ0.25</span>
              <span><i class="lg-now"></i>当前配置</span>
              <span><i class="lg-slow"></i>慢速衰减 λ0.02</span>
            </div>
          </div>
          <div class="fg-metric-grid">
            <div class="fg-metric">
              <span>7 天未访问</span>
              <b>${day7.toFixed(2)}</b>
            </div>
            <div class="fg-metric">
              <span>30 天未访问</span>
              <b>${day30.toFixed(2)}</b>
            </div>
            <div class="fg-metric">
              <span>跌破阈值</span>
              <b>${cross ? `第 ${cross} 天` : "未跌破"}</b>
            </div>
          </div>
        </div>`;
    }
    if (tab === "reflect") {
      const r = d.reflect;
      const periodFactor = { hourly: 1.8, "6h": 1.3, daily: 1, weekly: 0.55 }[r.period] || 1;
      const scopeFactor = { recent: 1, incremental: 0.7, high: 0.85, all: 1.6 }[r.scope] || 1;
      const modelFactor = r.model === "reflect-pro" ? 1.35 : 1;
      const gateFactor = (r.qualityAssess ? 1.08 : 1) * (r.memoryAudit ? 1.06 : 1);
      const compute = (18.6 * periodFactor * scopeFactor * modelFactor * gateFactor).toFixed(1);
      const consume = (7.2 * periodFactor * scopeFactor * modelFactor).toFixed(1);
      const computePct = Math.min(100, Math.round((Number(compute) / 40) * 100));
      const consumePct = Math.min(100, Math.round((Number(consume) / 20) * 100));
      return `
        <div class="engine-impact engine-impact-solo">
          <h3>变更影响评估</h3>
          <p class="fg-impact-note">${r.enabled ? "保存并下发后，将按周期生成结构化认知并写入长期记忆。" : "当前关闭，不会产生新的反思记忆。"}</p>
          <ul class="fg-bars">
            <li><div><span>影响主体</span><b>82</b></div><i style="width:42%"></i></li>
            <li><div><span>涉及记忆</span><b>${r.scope === "all" ? "2.08M" : r.scope === "incremental" ? "0.68M" : "1.24M"}</b></div><i style="width:${r.scope === "all" ? 92 : r.scope === "incremental" ? 48 : 78}%"></i></li>
            <li><div><span>预计算力</span><b>${r.enabled ? `${compute}k` : "0"}</b></div><i style="width:${r.enabled ? computePct : 4}%"></i></li>
            <li><div><span>预计消耗</span><b>${r.enabled ? `${consume}k` : "0"}</b></div><i style="width:${r.enabled ? consumePct : 4}%"></i></li>
          </ul>
          <p>质量评估 ${r.qualityAssess ? "已开" : "已关"} · 记忆审核 ${r.memoryAudit ? "已开" : "已关"}。参数在下一次迭代周期生效。</p>
        </div>`;
    }
    const kw = 100 - Number(d.retrieve.vectorWeight);
    return `
      <h3>检索效果预估</h3>
      <ul class="engine-stats">
        <li><span>Top-K</span><b>${d.retrieve.topK}</b></li>
        <li><span>相似度</span><b>${Number(d.retrieve.sim).toFixed(2)}</b></li>
        <li><span>向量 / 关键词</span><b>${d.retrieve.vectorWeight}% / ${kw}%</b></li>
      </ul>
      <div class="engine-impact"><h4>变更影响预估</h4><p>模型 ${esc(d.retrieve.model)}，${d.retrieve.mode === "realtime" ? "实时" : "批量"}抽取。提高阈值会减少召回条数、提高精度。</p></div>`;
  }

  /* ---------- boot ---------- */
  function boot() {
    initLogin();
    $("#drawer-close").addEventListener("click", closeDrawer);
    $("#drawer-backdrop").addEventListener("click", closeDrawer);

    $("#sidebar-toggle")?.addEventListener("click", () => {
      state.sidebarExpanded = !state.sidebarExpanded;
      renderChrome();
    });
    $("#topbar-sidebar-toggle")?.addEventListener("click", () => {
      state.sidebarExpanded = !state.sidebarExpanded;
      renderChrome();
    });
    $("#topbar-bell")?.addEventListener("click", () => toast("暂无新通知"));

    $("#topbar-view-switch").addEventListener("click", (e) => {
      const btn = e.target.closest("#topbar-view-switch");
      if (!btn || state.user.role === "user") return;
      const target = btn.dataset.targetView || (state.viewMode === "admin" ? "user" : "admin");
      state.viewMode = target;
      state.page = "memories";
      renderChrome();
      renderPage();
    });

    const superUser = MEMORA_DATA.users.find((u) => u.role === "super");
    state.engineBaselineBySpace = Object.fromEntries(
      (MEMORA_DATA.spaces || []).map((s) => [s.id, cloneConfig(s.config)])
    );
    enterAs(superUser, { silent: true });
  }

  boot();
})();
