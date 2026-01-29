export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_PROXY_URL?: string;
  OPENAI_PROXY_BASE_URL?: string;
  WORKER_VERSION?: string;
  VERIFY_TOKEN?: string;
}

type Locale = "zh" | "en" | "ja" | "ko" | "fr" | "de" | "es" | "id" | "th";

function normLocale(v: unknown): Locale {
  const s = String(v || "").toLowerCase();
  if (s.startsWith("zh")) return "zh";
  if (s.startsWith("ja")) return "ja";
  if (s.startsWith("ko")) return "ko";
  if (s.startsWith("fr")) return "fr";
  if (s.startsWith("de")) return "de";
  if (s.startsWith("es")) return "es";
  if (s.startsWith("id")) return "id";
  if (s.startsWith("th")) return "th";
  return "en";
}

function corsHeaders(origin?: string) {
  const o = origin || "*";
  return {
    "Access-Control-Allow-Origin": o === "null" ? "*" : o,
    "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function localeFromHeader(value: string | null): Locale {
  return normLocale(value || "");
}

function t(locale: Locale, key: string): string {
  const dict: Record<Locale, Record<string, string>> = {
    zh: {
      NOT_STOOL: "这张图片看起来不是大便，请重新拍摄或选择正确图片。",
      LOW_QUALITY: "图片质量不够清晰（可能太暗/模糊/距离太远），请重新拍摄：靠近、对焦、光线更好。",
      SERVER_ERROR: "服务繁忙，请稍后重试。",
    },
    en: {
      NOT_STOOL: "This image doesn't look like stool. Please select or take a stool photo.",
      LOW_QUALITY: "Image quality is too low (dark/blurry/too far). Please retake with better lighting and focus.",
      SERVER_ERROR: "Server is busy. Please try again later.",
    },
    ja: {
      NOT_STOOL: "この画像は便ではない可能性があります。便の写真を撮影または選択してください。",
      LOW_QUALITY: "画像が不鮮明です（暗い/ぼやけ/遠い）。明るくピントを合わせて再撮影してください。",
      SERVER_ERROR: "サーバーが混雑しています。しばらくしてから再試行してください。",
    },
    ko: {
      NOT_STOOL: "이 이미지는 대변이 아닌 것 같습니다. 대변 사진을 촬영하거나 선택해 주세요.",
      LOW_QUALITY: "이미지가 너무 흐리거나 어둡습니다. 더 밝고 선명하게 다시 촬영해 주세요.",
      SERVER_ERROR: "서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.",
    },
    fr: {
      NOT_STOOL: "Cette image ne ressemble pas à des selles. Veuillez sélectionner ou prendre une photo de selles.",
      LOW_QUALITY: "Qualité d'image insuffisante (sombre/floue/trop loin). Reprenez avec une meilleure lumière et mise au point.",
      SERVER_ERROR: "Serveur occupé. Veuillez réessayer plus tard.",
    },
    de: {
      NOT_STOOL: "Dieses Bild sieht nicht nach Stuhl aus. Bitte wähle oder mache ein Stuhl-Foto.",
      LOW_QUALITY: "Bildqualität zu niedrig (dunkel/unscharf/zu weit). Bitte mit besserem Licht und Fokus erneut aufnehmen.",
      SERVER_ERROR: "Server ausgelastet. Bitte später erneut versuchen.",
    },
    es: {
      NOT_STOOL: "Esta imagen no parece ser heces. Selecciona o toma una foto de heces.",
      LOW_QUALITY: "La calidad de la imagen es baja (oscura/borrosa/lejos). Vuelve a tomarla con mejor luz y enfoque.",
      SERVER_ERROR: "Servidor ocupado. Inténtalo de nuevo más tarde.",
    },
    id: {
      NOT_STOOL: "Gambar ini tampaknya bukan feses. Silakan pilih atau ambil foto feses.",
      LOW_QUALITY: "Kualitas gambar terlalu rendah (gelap/buram/terlalu jauh). Ambil ulang dengan cahaya dan fokus lebih baik.",
      SERVER_ERROR: "Server sedang sibuk. Coba lagi nanti.",
    },
    th: {
      NOT_STOOL: "รูปนี้ดูเหมือนไม่ใช่อุจจาระ กรุณาเลือกหรือถ่ายรูปอุจจาระใหม่",
      LOW_QUALITY: "คุณภาพรูปต่ำเกินไป (มืด/เบลอ/ไกลเกิน) กรุณาถ่ายใหม่ให้สว่างและชัดขึ้น",
      SERVER_ERROR: "เซิร์ฟเวอร์ไม่ว่าง กรุณาลองใหม่ภายหลัง",
    },
  };
  return dict[locale][key] || dict.en[key] || key;
}

const SCHEMA_VERSION = 2;

function extractOutputText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }
  const out = data?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === "output_text" && typeof c?.text === "string") return c.text;
          if (c?.type === "text" && typeof c?.text === "string") return c.text;
        }
      }
    }
  }
  return "";
}

function userPromptFromBody(body: Record<string, unknown>) {
  const age = body?.age_months;
  const odor = body?.odor ?? "unknown";
  const strain = body?.pain_or_strain;
  const diet = body?.diet_keywords ?? "";
  const context = (body as any)?.context ?? (body as any)?.context_input;
  return `
幼儿月龄: ${age ?? "unknown"}
气味: ${odor}
是否疼痛/费力: ${typeof strain === "boolean" ? String(strain) : "unknown"}
最近饮食关键词: ${diet || "unknown"}
补充信息(context): ${context ? JSON.stringify(context) : "none"}

请基于图片和以上信息给出分析与建议。
`.trim();
}

const SYSTEM_PROMPT = `
你是儿科+营养师背景的健康助手。用户提供幼儿(0-36个月)大便图片与补充信息，你必须输出严格 JSON（不要 Markdown、不要额外文字）。
输出结构必须包含所有字段，且不要输出任何未列出的字段。请提供“家长可执行”的饮食/补液/护理/观察建议，并提供红旗预警。

写作结构强约束：
1. 必须先输出“一句话结论（先说重点）”（写进 headline / ui_strings.longform.conclusion），明确：是否像腹泻/是否像感染/更像什么。
2. “具体怎么看这个便便”必须分为：形态/颜色/质地细节，并且每部分都要写“为什么会这样”（写进 interpretation.why_*，每项>=2）。
3. 必须输出“结合你填写的情况（很关键）”，并引用 context_input（若提供：recent_foods、recent_drinks、精神、次数、发热、腹痛等），写入 interpretation.how_context_affects（>=3）。
4. “可能原因”必须按常见程度排序（写入 possible_causes 与 reasoning_bullets，possible_causes>=3，reasoning_bullets>=5）。
5. “现在需要做什么”必须可执行，分 ✅可以做 / ❌少一点 / 👀观察指标（分别落在 actions_today.*）。
6. “什么时候需要警惕”必须给明确红旗（red_flags >=5，object 结构 {title, detail}）。
7. 最后输出“家长安心指标”一句话总结（写入 ui_strings.longform.reassure）。
8. 语言风格：像儿科医生对家长说话，清晰克制、不吓人；禁止空话；禁止只输出泛泛建议。
9. 必须填满 required 数组长度下限，任何数组不允许为空，避免使用 "unknown" 作为主结论文本。
10. 若图片无法判断，必须明确写出“缺什么信息/建议怎么拍/建议补充什么”，并仍返回完整 v2 结构（ok=false，但字段齐全）。

必须输出 JSON 并严格匹配 schema_version=2 的结构，包含：
- ok, schema_version=2, is_stool_image=true, headline, score, risk_level, confidence, uncertainty_note
- stool_features: shape, shape_desc, color, color_desc, color_reason, texture, texture_desc, abnormal_signs, bristol_type, bristol_range, volume, wateriness, mucus, foam, blood, undigested_food, separation_layers, odor_level, visible_findings
- doctor_explanation: one_sentence_conclusion, visual_analysis{shape,color,texture}, combined_judgement
- possible_causes: [{title, explanation}]
只输出 JSON，不要 Markdown。
`.trim();

function buildDefaultResult() {
  return {
    ok: true,
    schema_version: SCHEMA_VERSION,
    is_stool_image: true,
    worker_version: "",
    proxy_version: "unknown",
    model_used: "unknown",
    model_primary: "",
    model_fallback: "",
    used_fallback: false,
    primary_error: "",
    headline: "",
    score: 50,
    risk_level: "low",
    confidence: 0.6,
    uncertainty_note: "",
    stool_features: {
      bristol_type: null,
      bristol_range: "unknown",
      shape: "偏软/糊状",
      shape_desc: "unknown",
      color: "黄褐/偏黄",
      color_desc: "unknown",
      color_reason: "多与饮食构成和肠道通过速度相关",
      texture: "细腻/糊状",
      texture_desc: "unknown",
      abnormal_signs: ["未见明显异常"],
      volume: "unknown",
      wateriness: "none",
      mucus: "none",
      foam: "none",
      blood: "none",
      undigested_food: "none",
      separation_layers: "none",
      odor_level: "unknown",
      visible_findings: ["none"],
    },
    doctor_explanation: {
      one_sentence_conclusion: "",
      shape: "",
      color: "",
      texture: "",
      visual_analysis: { shape: "", color: "", texture: "" },
      combined_judgement: "",
      causes: "可能与饮食结构或短期消化变化有关，需结合近期情况判断。",
      todo: "建议补拍清晰图片并记录 24-48 小时变化，必要时咨询医生。",
      red_flags: "如出现发热、便血、频繁呕吐或精神差，应尽快就医。",
      reassure: "若精神食欲良好且尿量正常，通常可先观察并持续记录。",
    },
    possible_causes: [],
    interpretation: {
      overall_judgement: "需要结合更多信息判断",
      why_shape: ["图片角度与光线影响形态判断", "仅凭单张图片可能低估真实形态"],
      why_color: ["颜色受光照与拍摄设备影响", "需结合近期饮食判断颜色变化"],
      why_texture: ["质地可能受水分与拍摄焦距影响", "需结合是否拉稀或成形判断"],
      how_context_affects: ["未提供补充信息，无法判断饮食与症状关联", "若近期有发热/腹痛需提高警惕", "若精神食欲正常则更偏功能性变化"],
      confidence_explain: "缺少完整补充信息，置信度有限。",
    },
    context_summary: "未提供补充信息，仅基于图片判断。",
    analysis_basis: {
      image_only: DEFAULT_IMAGE_ONLY,
      combined_reasoning: DEFAULT_COMBINED_REASONING,
    },
    input_echo: {
      context: {},
    },
    reasoning_bullets: [],
    actions_today: {
      diet: [],
      hydration: [],
      care: [],
      avoid: [],
      observe: [],
    },
    red_flags: [],
    follow_up_questions: [],
    ui_strings: {
      summary: "",
      tags: [],
      sections: [
        { title: "饮食", icon_key: "diet", items: [] },
        { title: "补液", icon_key: "hydration", items: [] },
        { title: "护理", icon_key: "care", items: [] },
        { title: "警戒信号", icon_key: "warning", items: [] },
      ],
      longform: {
        conclusion: "",
        how_to_read: "",
        context: "",
        causes: "",
        todo: "",
        red_flags: "",
        reassure: "",
      },
    },
    summary: "",
    bristol_type: null,
    color: null,
    texture: null,
    hydration_hint: "",
    diet_advice: [],
    explanation: "",
    image_validation: null,
  };
}

const DEFAULT_REASONING = [
  "图片角度或光线可能影响判断准确性",
  "结合近期饮食与症状信息综合分析",
  "当前结果更像短期饮食或消化变化",
  "建议持续记录 24-48 小时变化",
  "如出现不适或异常症状需及时就医",
];

const DEFAULT_IMAGE_ONLY = [
  "图片中可见的形态与质地特征",
  "颜色分布与光照条件下的表现",
  "是否可见明显异物/血丝/粘液",
  "整体成形度与水样分离情况",
];

const DEFAULT_COMBINED_REASONING = [
  "图片特征与补充信息综合后更偏向功能性变化",
  "饮食与饮水情况可能影响颜色与质地",
  "精神状态与症状有助判断是否存在感染迹象",
  "如无发热/呕吐更支持可观察的短期变化",
  "若补充信息不足需保留不确定性",
];

const DEFAULT_DIET = ["清淡易消化饮食", "少量多餐，观察耐受", "适量软熟蔬果补充"];
const DEFAULT_HYDRATION = ["少量多次补液", "观察尿量是否减少", "必要时口服补液盐"];
const DEFAULT_CARE = ["便后温水清洁并保持干爽", "注意皮肤红肿或破损", "记录排便次数与性状变化"];
const DEFAULT_AVOID = ["避免油炸/辛辣/高糖食物", "暂避冰冷刺激饮品", "避免一次性大量进食"];
const DEFAULT_OBSERVE = ["精神与食欲是否下降", "排便次数是否增多", "是否伴随发热或呕吐"];
const DEFAULT_RED_FLAGS = [
  { title: "明显便血或黑便", detail: "若出现请尽快就医" },
  { title: "持续高热或精神萎靡", detail: "超过 24 小时需就医" },
  { title: "频繁呕吐或无法进食", detail: "提示脱水风险" },
  { title: "尿量明显减少/口干", detail: "可能存在脱水" },
  { title: "腹痛剧烈或持续哭闹", detail: "需及时评估" },
];
const DEFAULT_FOLLOW_UPS = [
  "是否发热？",
  "是否持续呕吐？",
  "24 小时内排便次数多少？",
  "是否出现便血/黑便/灰白便？",
  "尿量是否减少？",
  "最近饮食是否有明显变化？",
];

function buildInvalidImageResult(workerVersion: string, rayId?: string) {
  const base = buildDefaultResult();
  return {
    ...base,
    ok: false,
    is_stool_image: false,
    error_code: "INVALID_IMAGE",
    error: "INVALID_IMAGE",
    message: "image is missing or invalid",
    schema_version: SCHEMA_VERSION,
    worker_version: workerVersion,
    proxy_version: "unknown",
    model_used: "unknown",
    headline: "图片信息不足，无法分析",
    score: 0,
    risk_level: "unknown",
    confidence: 0,
    uncertainty_note: "请提供清晰、光线充足的图片，并保证目标占画面主要区域。",
    ui_strings: {
      ...base.ui_strings,
      sections: [
        {
          title: "如何拍/如何裁剪",
          icon_key: "camera",
          items: ["光线充足", "对焦清晰", "目标占画面 50% 以上"],
        },
        {
          title: "建议补充信息",
          icon_key: "question",
          items: ["气味/是否疼痛", "排便次数", "是否便血/黑便"],
        },
        {
          title: "观察指标",
          icon_key: "observe",
          items: DEFAULT_OBSERVE,
        },
        {
          title: "重试建议",
          icon_key: "retry",
          items: ["更换清晰图片", "避免过暗或反光", "再次尝试上传"],
        },
      ],
    },
    rayId,
  };
}

function buildProxyErrorResult(
  workerVersion: string,
  proxyVersion: string,
  modelUsed: string,
  message: string,
  rayId?: string
) {
  const base = buildDefaultResult();
  return {
    ...base,
    ok: false,
    error_code: "PROXY_ERROR",
    error: "PROXY_ERROR",
    message,
    schema_version: SCHEMA_VERSION,
    worker_version: workerVersion,
    proxy_version: proxyVersion || "unknown",
    model_used: modelUsed || "unknown",
    headline: "服务暂不可用，请稍后重试",
    score: 0,
    risk_level: "unknown",
    confidence: 0,
    uncertainty_note: "服务繁忙或网络异常，可稍后重试或更换清晰图片。",
    ui_strings: {
      ...base.ui_strings,
      sections: [
        {
          title: "重试建议",
          icon_key: "retry",
          items: ["稍后再试", "检查网络连接", "更换清晰图片"],
        },
        {
          title: "如何拍/如何裁剪",
          icon_key: "camera",
          items: ["光线充足", "对焦清晰", "目标占画面 50% 以上"],
        },
        {
          title: "建议补充信息",
          icon_key: "question",
          items: ["是否发热/呕吐", "24h 排便次数", "近期饮食与饮水"],
        },
        {
          title: "观察指标",
          icon_key: "observe",
          items: DEFAULT_OBSERVE,
        },
      ],
    },
    rayId,
  };
}

function decodeBase64Image(input: string): Uint8Array | null {
  const s = input.trim();
  const b64 = s.startsWith("data:image/")
    ? s.slice(s.indexOf("base64,") + 7)
    : s;
  try {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function getImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // PNG
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const width =
      (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height =
      (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }

  // JPEG
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = bytes[i + 1];
      const size = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker === 0xc0 || marker === 0xc2) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        return { width, height };
      }
      i += 2 + size;
    }
  }
  return null;
}

function ensureMinItems<T>(list: T[], min: number, defaults: T[]) {
  const out = Array.isArray(list) ? list.slice() : [];
  let i = 0;
  while (out.length < min) {
    out.push(defaults[i % defaults.length]);
    i += 1;
  }
  return out;
}

function ensureMinRedFlags(
  list: Array<{ title: string; detail: string }>,
  min: number
) {
  const out = Array.isArray(list) ? list.slice() : [];
  let i = 0;
  while (out.length < min) {
    out.push(DEFAULT_RED_FLAGS[i % DEFAULT_RED_FLAGS.length]);
    i += 1;
  }
  return out;
}

function hasContextInput(ctx: Record<string, unknown>) {
  const foods = String((ctx as any)?.foods_eaten || "").trim();
  const drinks = String((ctx as any)?.drinks_taken || "").trim();
  const mood = String((ctx as any)?.mood_state || "").trim();
  const notes = String((ctx as any)?.other_notes || "").trim();
  return Boolean(foods || drinks || mood || notes);
}

function contextSummaryFromInput(ctx: Record<string, unknown>) {
  const parts: string[] = [];
  const foods = String((ctx as any)?.foods_eaten || "").trim();
  if (foods) parts.push(`吃了：${foods}`);
  const drinks = String((ctx as any)?.drinks_taken || "").trim();
  if (drinks) parts.push(`喝了：${drinks}`);
  const mood = String((ctx as any)?.mood_state || "").trim();
  if (mood) parts.push(`精神状态：${mood}`);
  const notes = String((ctx as any)?.other_notes || "").trim();
  if (notes) parts.push(`其他：${notes}`);
  return parts.length ? `你填写的情况显示：${parts.join("；")}` : "";
}

function contextAffectsFromInput(ctx: Record<string, unknown>) {
  const items: string[] = [];
  const foods = String((ctx as any)?.foods_eaten || "").trim();
  if (foods) items.push(`近期饮食（${foods}）可能影响颜色与软硬度`);
  const drinks = String((ctx as any)?.drinks_taken || "").trim();
  if (drinks) items.push(`饮水/饮品（${drinks}）可能影响水分含量`);
  const mood = String((ctx as any)?.mood_state || "").trim();
  if (mood) items.push(`精神状态（${mood}）有助判断是否存在不适`);
  const notes = String((ctx as any)?.other_notes || "").trim();
  if (notes) items.push(`补充说明提示：${notes}`);
  return items;
}

function normalizeV2(
  parsed: any,
  workerVersion: string,
  proxyVersion?: string,
  modelUsed?: string
) {
  const base = buildDefaultResult();
  const out = { ...base, ...(parsed || {}) } as any;

  const stool = { ...base.stool_features, ...(out.stool_features || {}) };
  const doctor = { ...base.doctor_explanation, ...(out.doctor_explanation || {}) };
  const causes = Array.isArray(out.possible_causes) ? out.possible_causes : [];
  const interpretation = { ...base.interpretation, ...(out.interpretation || {}) };
  const actions = { ...base.actions_today, ...(out.actions_today || {}) };
  const ui = { ...base.ui_strings, ...(out.ui_strings || {}) };
  const longform = { ...base.ui_strings.longform, ...(ui.longform || {}) };

  out.ok = out.ok === false ? false : true;
  out.is_stool_image = out.is_stool_image === false ? false : true;
  out.schema_version = SCHEMA_VERSION;
  out.worker_version = out.worker_version || workerVersion;
  out.proxy_version = proxyVersion || out.proxy_version || "unknown";
  out.model_used = modelUsed || out.model_used || "unknown";
  out.model_primary = out.model_primary || "";
  out.model_fallback = out.model_fallback || "";
  out.used_fallback = typeof out.used_fallback === "boolean" ? out.used_fallback : false;
  out.primary_error = typeof out.primary_error === "string" ? out.primary_error : "";
  out.image_validation =
    out.image_validation && typeof out.image_validation === "object" ? out.image_validation : null;
  out.context_input = out.context_input && typeof out.context_input === "object" ? out.context_input : undefined;
  out.input_context = out.input_context && typeof out.input_context === "object" ? out.input_context : out.context_input;
  out.context_summary = typeof out.context_summary === "string" ? out.context_summary : "";
  const basis = { ...base.analysis_basis, ...(out.analysis_basis || {}) } as any;
  out.analysis_basis = {
    image_only: ensureMinItems(
      Array.isArray(basis.image_only) ? basis.image_only.map(String) : [],
      4,
      DEFAULT_IMAGE_ONLY
    ),
    combined_reasoning: ensureMinItems(
      Array.isArray(basis.combined_reasoning) ? basis.combined_reasoning.map(String) : [],
      5,
      DEFAULT_COMBINED_REASONING
    ),
  };
  const echo = out.input_echo && typeof out.input_echo === "object" ? out.input_echo : base.input_echo;
  out.input_echo = {
    context: echo && typeof echo.context === "object" ? echo.context : {},
  };
  const derivedSummary = contextSummaryFromInput(out.input_echo.context || {});
  if (derivedSummary && out.context_summary.includes("未提供补充信息")) {
    out.context_summary = derivedSummary;
  } else if (derivedSummary && !out.context_summary) {
    out.context_summary = derivedSummary;
  }
  const contextAffects = contextAffectsFromInput(out.input_echo.context || {});

  out.score = Number.isFinite(Number(out.score)) ? Number(out.score) : base.score;
  out.confidence = Number.isFinite(Number(out.confidence))
    ? Number(out.confidence)
    : base.confidence;
  out.uncertainty_note = typeof out.uncertainty_note === "string" ? out.uncertainty_note : "";
  out.headline = typeof out.headline === "string" ? out.headline : "";
  out.explanation = typeof out.explanation === "string" ? out.explanation : "";
  out.risk_level = ["low", "medium", "high", "unknown"].includes(out.risk_level)
    ? out.risk_level
    : base.risk_level;
  if (!out.ok) {
    out.risk_level = "unknown";
  }
  if (out.is_stool_image === false) {
    out.risk_level = "unknown";
  }

  out.stool_features = out.is_stool_image === false
    ? null
    : {
    shape:
      typeof stool.shape === "string" && stool.shape.trim()
        ? stool.shape.trim()
        : base.stool_features.shape,
    bristol_type:
      stool.bristol_type === null
        ? null
        : Number.isFinite(Number(stool.bristol_type))
            ? Number(stool.bristol_type)
            : null,
    bristol_range:
      typeof stool.bristol_range === "string" && stool.bristol_range.trim()
        ? stool.bristol_range.trim()
        : base.stool_features.bristol_range,
    shape_desc:
      typeof stool.shape_desc === "string" && stool.shape_desc.trim()
        ? stool.shape_desc.trim()
        : base.stool_features.shape_desc,
    color:
      typeof stool.color === "string" && stool.color.trim()
        ? stool.color.trim()
        : base.stool_features.color,
    color_desc:
      typeof stool.color_desc === "string" && stool.color_desc.trim()
        ? stool.color_desc.trim()
        : base.stool_features.color_desc,
    color_reason:
      typeof stool.color_reason === "string" && stool.color_reason.trim()
        ? stool.color_reason.trim()
        : base.stool_features.color_reason,
    texture:
      typeof stool.texture === "string" && stool.texture.trim()
        ? stool.texture.trim()
        : base.stool_features.texture,
    texture_desc:
      typeof stool.texture_desc === "string" && stool.texture_desc.trim()
        ? stool.texture_desc.trim()
        : base.stool_features.texture_desc,
    abnormal_signs: Array.isArray(stool.abnormal_signs)
      ? stool.abnormal_signs.map(String)
      : [],
    volume: ["small", "medium", "large", "unknown"].includes(stool.volume)
      ? stool.volume
      : "unknown",
    wateriness: ["none", "mild", "moderate", "severe"].includes(stool.wateriness)
      ? stool.wateriness
      : "none",
    mucus: ["none", "suspected", "present"].includes(stool.mucus) ? stool.mucus : "none",
    foam: ["none", "suspected", "present"].includes(stool.foam) ? stool.foam : "none",
    blood: ["none", "suspected", "present"].includes(stool.blood) ? stool.blood : "none",
    undigested_food: ["none", "suspected", "present"].includes(stool.undigested_food)
      ? stool.undigested_food
      : "none",
    separation_layers: ["none", "suspected", "present"].includes(stool.separation_layers)
      ? stool.separation_layers
      : "none",
    odor_level: ["normal", "strong", "very_strong", "unknown"].includes(stool.odor_level)
      ? stool.odor_level
      : "unknown",
    visible_findings: Array.isArray(stool.visible_findings)
      ? stool.visible_findings.map(String)
      : [],
  };
  if (out.is_stool_image === false) {
    if (!out.stool_features.shape_desc || out.stool_features.shape_desc === "unknown") {
      out.stool_features.shape_desc = "未识别为大便或目标不清晰";
    }
    if (!out.stool_features.color_desc || out.stool_features.color_desc === "unknown") {
      out.stool_features.color_desc = "颜色无法判断（需更清晰图片）";
    }
    if (!out.stool_features.texture_desc || out.stool_features.texture_desc === "unknown") {
      out.stool_features.texture_desc = "质地无法判断（需更清晰图片）";
    }
    out.stool_features.visible_findings = ensureMinItems(
      out.stool_features.visible_findings,
      1,
      ["not_stool_image"]
    );
  }
  if (out.stool_features) {
    out.stool_features.visible_findings = ensureMinItems(
      out.stool_features.visible_findings,
      1,
      ["none"]
    );
    out.stool_features.abnormal_signs = ensureMinItems(
      out.stool_features.abnormal_signs,
      1,
      ["未见明显异常"]
    );
  }

  out.doctor_explanation = {
    one_sentence_conclusion:
      typeof doctor.one_sentence_conclusion === "string" && doctor.one_sentence_conclusion.trim()
        ? doctor.one_sentence_conclusion.trim()
        : out.headline || base.doctor_explanation.one_sentence_conclusion,
    shape:
      typeof doctor.shape === "string" && doctor.shape.trim()
        ? doctor.shape.trim()
        : "",
    color:
      typeof doctor.color === "string" && doctor.color.trim()
        ? doctor.color.trim()
        : "",
    texture:
      typeof doctor.texture === "string" && doctor.texture.trim()
        ? doctor.texture.trim()
        : "",
    visual_analysis: {
      shape:
        typeof doctor.visual_analysis?.shape === "string" && doctor.visual_analysis.shape.trim()
          ? doctor.visual_analysis.shape.trim()
          : "",
      color:
        typeof doctor.visual_analysis?.color === "string" && doctor.visual_analysis.color.trim()
          ? doctor.visual_analysis.color.trim()
          : "",
      texture:
        typeof doctor.visual_analysis?.texture === "string" && doctor.visual_analysis.texture.trim()
          ? doctor.visual_analysis.texture.trim()
          : "",
    },
    combined_judgement:
      typeof doctor.combined_judgement === "string" && doctor.combined_judgement.trim()
        ? doctor.combined_judgement.trim()
        : interpretation.overall_judgement || base.interpretation.overall_judgement,
    causes:
      typeof doctor.causes === "string" && doctor.causes.trim()
        ? doctor.causes.trim()
        : base.doctor_explanation.causes,
    todo:
      typeof doctor.todo === "string" && doctor.todo.trim()
        ? doctor.todo.trim()
        : base.doctor_explanation.todo,
    red_flags:
      typeof doctor.red_flags === "string" && doctor.red_flags.trim()
        ? doctor.red_flags.trim()
        : base.doctor_explanation.red_flags,
    reassure:
      typeof doctor.reassure === "string" && doctor.reassure.trim()
        ? doctor.reassure.trim()
        : base.doctor_explanation.reassure,
  };

  if (out.doctor_explanation) {
    const fallbackShape =
      out.is_stool_image === false
        ? "未识别为大便或画面不清晰，建议重新拍摄并让目标居中。"
        : "形态信息不足，建议补拍清晰图片。";
    const fallbackColor =
      out.is_stool_image === false
        ? "颜色无法可靠判断，建议在充足光线下补拍。"
        : "颜色信息不足，建议补拍清晰图片。";
    const fallbackTexture =
      out.is_stool_image === false
        ? "质地细节不清晰，建议靠近并对焦。"
        : "质地信息不足，建议补拍清晰图片。";
    if (!out.doctor_explanation.shape) out.doctor_explanation.shape = fallbackShape;
    if (!out.doctor_explanation.color) out.doctor_explanation.color = fallbackColor;
    if (!out.doctor_explanation.texture) out.doctor_explanation.texture = fallbackTexture;
    if (!out.doctor_explanation.visual_analysis?.shape) {
      out.doctor_explanation.visual_analysis.shape = out.doctor_explanation.shape;
    }
    if (!out.doctor_explanation.visual_analysis?.color) {
      out.doctor_explanation.visual_analysis.color = out.doctor_explanation.color;
    }
    if (!out.doctor_explanation.visual_analysis?.texture) {
      out.doctor_explanation.visual_analysis.texture = out.doctor_explanation.texture;
    }
    if (!out.doctor_explanation.combined_judgement) {
      out.doctor_explanation.combined_judgement = out.ok
        ? base.interpretation.overall_judgement
        : "信息不足，建议补充清晰图片与情况说明。";
    }
    if (!out.doctor_explanation.causes) {
      out.doctor_explanation.causes =
        "可能与饮食结构、肠道蠕动或短期受凉有关，需结合补充信息判断。";
    }
    if (!out.doctor_explanation.todo) {
      out.doctor_explanation.todo =
        "建议补拍清晰图片并记录 24-48 小时变化，必要时咨询医生。";
    }
    if (!out.doctor_explanation.red_flags) {
      out.doctor_explanation.red_flags =
        "若出现发热、便血、频繁呕吐或精神明显差，应尽快就医。";
    }
    if (!out.doctor_explanation.reassure) {
      out.doctor_explanation.reassure =
        "若精神食欲良好且尿量正常，通常可先观察并持续记录。";
    }
  }

  if (out.is_stool_image === false) {
    out.stool_features = null;
    out.possible_causes = [];
    out.reasoning_bullets = [];
    out.actions_today = { diet: [], hydration: [], care: [], avoid: [], observe: [] };
    out.red_flags = [];
    out.follow_up_questions = ["是否选错了图片？", "是否需要重新拍摄更清晰的照片？"];
    out.interpretation = {
      ...out.interpretation,
      overall_judgement: "无法判断是否为大便图片",
      why_shape: [],
      why_color: [],
      why_texture: [],
      how_context_affects: contextAffects.length
        ? contextAffects
        : ["本次仅用于确认是否为大便图片"],
      confidence_explain: "当前图片未识别为大便，无法进入健康分析。",
    };
    out.context_summary = hasContextInput(out.input_echo.context || {})
      ? contextSummaryFromInput(out.input_echo.context || {})
      : "本次仅用于确认是否为大便图片。";
    out.doctor_explanation = {
      one_sentence_conclusion: out.headline || "这张图片未识别到大便，暂时无法分析。",
      shape: "",
      color: "",
      texture: "",
      visual_analysis: { shape: "", color: "", texture: "" },
      combined_judgement: "",
      causes: "",
      todo: "",
      red_flags: "",
      reassure: "",
    };
    out.ui_strings = {
      summary: "未识别到大便图片，建议重新拍摄后再分析。",
      tags: ["非大便图片"],
      sections: [
        {
          title: "无法分析的原因",
          icon_key: "camera",
          items: ["图片中未识别到大便", "可能拍到其他物体或场景", "目标不清晰或被遮挡"],
        },
        {
          title: "如何重拍",
          icon_key: "retry",
          items: ["光线充足，避免背光/反光", "对焦清晰，目标占画面 50% 以上", "尽量减少背景干扰"],
        },
        {
          title: "常见错误示例",
          icon_key: "info",
          items: ["拍到纸巾/地面/玩具/衣物", "画面过暗或强反光", "目标过小或被遮挡"],
        },
      ],
      longform: {
        conclusion: "这张图片未识别到大便，暂时无法分析。",
        how_to_read: "当前图片无法用于判断大便性状，请更清晰地重新拍摄。",
        context: "本次仅用于确认是否为大便图片，无需补充更多信息。",
        causes: "可能选错图片或目标未清晰入镜。",
        todo: "请重新拍摄：光线充足、对焦清晰、目标占画面 50% 以上。",
        red_flags: "如宝宝出现持续发热、便血或精神明显差，请及时就医。",
        reassure: "这是识别失败提示，并非健康结论。",
      },
    };
    if (!out.image_validation) {
      out.image_validation = {
        status: "not_stool",
        reason: out.explanation || "未识别到大便图像。",
        tips: ["对焦清晰", "光线充足", "目标占画面 50% 以上"],
      };
    }
    return out;
  }

  out.possible_causes = ensureMinItems(
    causes.map((item: any) => {
      if (!item || typeof item !== "object") {
        return { title: "饮食结构影响", explanation: "近期饮食变化会让便便更偏软。" };
      }
      return {
        title: item.title ? String(item.title) : "常见原因",
        explanation: item.explanation ? String(item.explanation) : "常见原因导致的短期变化。",
      };
    }),
    3,
    [
      { title: "饮食结构影响", explanation: "水果或含水量高的食物增加会让便便偏软。" },
      { title: "肠道蠕动偏快", explanation: "幼儿阶段肠道功能调试期，容易偏软。" },
      { title: "轻微受凉或作息变化", explanation: "环境变化可短暂影响消化节律。" },
    ]
  );

  out.interpretation = {
    overall_judgement:
      typeof interpretation.overall_judgement === "string" && interpretation.overall_judgement.trim()
        ? interpretation.overall_judgement.trim()
        : base.interpretation.overall_judgement,
    why_shape: Array.isArray(interpretation.why_shape) ? interpretation.why_shape.map(String) : [],
    why_color: Array.isArray(interpretation.why_color) ? interpretation.why_color.map(String) : [],
    why_texture: Array.isArray(interpretation.why_texture) ? interpretation.why_texture.map(String) : [],
    how_context_affects: Array.isArray(interpretation.how_context_affects)
      ? interpretation.how_context_affects.map(String)
      : [],
    confidence_explain:
      typeof interpretation.confidence_explain === "string" && interpretation.confidence_explain.trim()
        ? interpretation.confidence_explain.trim()
        : base.interpretation.confidence_explain,
  };

  out.reasoning_bullets = ensureMinItems(
    Array.isArray(out.reasoning_bullets) ? out.reasoning_bullets.map(String) : [],
    5,
    DEFAULT_REASONING
  );

  out.actions_today = {
    diet: ensureMinItems(
      Array.isArray(actions.diet) ? actions.diet.map(String) : [],
      3,
      DEFAULT_DIET
    ),
    hydration: ensureMinItems(
      Array.isArray(actions.hydration) ? actions.hydration.map(String) : [],
      3,
      DEFAULT_HYDRATION
    ),
    care: ensureMinItems(
      Array.isArray(actions.care) ? actions.care.map(String) : [],
      3,
      DEFAULT_CARE
    ),
    avoid: ensureMinItems(
      Array.isArray(actions.avoid) ? actions.avoid.map(String) : [],
      3,
      DEFAULT_AVOID
    ),
    observe: ensureMinItems(
      Array.isArray(actions.observe) ? actions.observe.map(String) : [],
      3,
      DEFAULT_OBSERVE
    ),
  };

  out.red_flags = ensureMinRedFlags(
    Array.isArray(out.red_flags)
      ? out.red_flags.map((item: any) => {
          if (typeof item === "string") {
            return { title: item, detail: "如出现请及时就医或咨询医生。" };
          }
          return {
            title: item?.title ? String(item.title) : "需要警惕的情况",
            detail: item?.detail
              ? String(item.detail)
              : item?.why
                  ? String(item.why)
                  : "如出现请及时就医或咨询医生。",
          };
        })
      : [],
    5
  );

  out.follow_up_questions = ensureMinItems(
    Array.isArray(out.follow_up_questions) ? out.follow_up_questions.map(String) : [],
    6,
    DEFAULT_FOLLOW_UPS
  );

  const normalizedSections = Array.isArray(ui.sections)
    ? ui.sections.map((sec: any) => {
        return {
          title: sec?.title ? String(sec.title) : "",
          icon_key: sec?.icon_key ? String(sec.icon_key) : "info",
          items: Array.isArray(sec?.items) ? sec.items.map(String) : [],
        };
      })
    : [];

  out.ui_strings = {
    summary: typeof ui.summary === "string" && ui.summary.trim() ? ui.summary : out.summary,
    tags: Array.isArray(ui.tags) ? ui.tags.map(String) : [],
    sections: normalizedSections,
    longform: {
      conclusion:
        typeof longform.conclusion === "string" && longform.conclusion.trim()
          ? longform.conclusion.trim()
          : "",
      how_to_read:
        typeof longform.how_to_read === "string" && longform.how_to_read.trim()
          ? longform.how_to_read.trim()
          : "",
      context:
        typeof longform.context === "string" && longform.context.trim()
          ? longform.context.trim()
          : "",
      causes:
        typeof longform.causes === "string" && longform.causes.trim()
          ? longform.causes.trim()
          : "",
      todo:
        typeof longform.todo === "string" && longform.todo.trim()
          ? longform.todo.trim()
          : "",
      red_flags:
        typeof longform.red_flags === "string" && longform.red_flags.trim()
          ? longform.red_flags.trim()
          : "",
      reassure:
        typeof longform.reassure === "string" && longform.reassure.trim()
          ? longform.reassure.trim()
          : "",
    },
  };

  const baseSections = base.ui_strings.sections;
  const sections = ensureMinItems(out.ui_strings.sections, 4, baseSections).map(
    (sec: any, idx: number) => ({
      title: sec.title || baseSections[idx % baseSections.length].title,
      icon_key: sec.icon_key || baseSections[idx % baseSections.length].icon_key,
      items: ensureMinItems(
        Array.isArray(sec.items) ? sec.items.map(String) : [],
        3,
        [
          ...out.actions_today.diet,
          ...out.actions_today.hydration,
          ...out.actions_today.care,
          ...out.actions_today.avoid,
          ...out.actions_today.observe,
        ]
      ),
    })
  );

  const dupSections = sections.every((sec) => {
    const key = JSON.stringify(sec.items || []);
    return sections.every((s) => JSON.stringify(s.items || []) === key);
  });

  out.ui_strings.sections = dupSections
    ? [
        {
          title: "饮食",
          icon_key: "diet",
          items: ensureMinItems(out.actions_today.diet, 3, DEFAULT_DIET),
        },
        {
          title: "补液",
          icon_key: "hydration",
          items: ensureMinItems(out.actions_today.hydration, 3, DEFAULT_HYDRATION),
        },
        {
          title: "护理",
          icon_key: "care",
          items: ensureMinItems(out.actions_today.care, 3, DEFAULT_CARE),
        },
        {
          title: "警戒信号",
          icon_key: "warning",
          items: ensureMinItems(
            out.red_flags.map((f: any) => f.title || f.detail),
            3,
            ["出现便血或黑便", "持续高热或明显不适", "频繁呕吐"]
          ),
        },
        {
          title: "观察指标",
          icon_key: "observe",
          items: ensureMinItems(out.actions_today.observe, 3, DEFAULT_OBSERVE),
        },
      ]
    : sections;

  out.ui_strings.tags = ensureMinItems(
    out.ui_strings.tags,
    1,
    ["需观察"]
  );

  if (!out.headline) {
    out.headline = out.ok ? "整体风险偏低，建议继续观察" : "分析不确定，建议补充信息";
  }
  if (!out.uncertainty_note && !out.ok) {
    out.uncertainty_note = "图片信息不足，建议补充说明或更清晰图片。";
  }

  out.summary =
    out.ui_strings.summary ||
    [out.headline, ...out.reasoning_bullets.slice(0, 2)].filter(Boolean).join("，");

  out.interpretation.why_shape = ensureMinItems(
    out.interpretation.why_shape,
    2,
    base.interpretation.why_shape
  );
  out.interpretation.why_color = ensureMinItems(
    out.interpretation.why_color,
    2,
    base.interpretation.why_color
  );
  out.interpretation.why_texture = ensureMinItems(
    out.interpretation.why_texture,
    2,
    base.interpretation.why_texture
  );
  out.interpretation.how_context_affects = ensureMinItems(
    out.interpretation.how_context_affects,
    3,
    base.interpretation.how_context_affects
  );
  if (contextAffects.length) {
    out.interpretation.how_context_affects = ensureMinItems(
      contextAffects,
      3,
      contextAffects
    );
  }

  const howToReadFallback =
    out.is_stool_image === false
      ? "图片未识别为大便，建议重新拍摄（光线充足、对焦清晰、目标占画面 50% 以上）。"
      : `形态：${out.stool_features.shape_desc}；颜色：${out.stool_features.color_desc}；质地：${out.stool_features.texture_desc}。`;
  out.ui_strings.longform = {
    conclusion: out.ui_strings.longform.conclusion || out.headline || "整体情况需要继续观察。",
    how_to_read: out.ui_strings.longform.how_to_read || howToReadFallback,
    context:
      out.ui_strings.longform.context ||
      out.interpretation.how_context_affects.join("；"),
    causes:
      out.ui_strings.longform.causes || out.reasoning_bullets.slice(0, 3).join("；"),
    todo:
      out.ui_strings.longform.todo ||
      `✅可以做：${out.actions_today.diet.slice(0, 2).join("；")}；❌少一点：${out.actions_today.avoid.slice(0, 2).join("；")}；👀观察：${out.actions_today.observe.slice(0, 2).join("；")}`,
    red_flags:
      out.ui_strings.longform.red_flags ||
      out.red_flags.slice(0, 2).map((f: any) => `${f.title}（${f.detail}）`).join("；"),
    reassure:
      out.ui_strings.longform.reassure ||
      "若精神和食欲良好、尿量正常，通常可先在家观察并记录变化。",
  };

  out.bristol_type = out.stool_features?.bristol_type ?? null;
  out.color = out.stool_features?.color_desc ?? null;
  out.texture = out.stool_features?.texture_desc ?? null;
  out.hydration_hint = out.actions_today.hydration[0] || "";
  out.diet_advice = out.actions_today.diet || [];

  return out;
}

function upgradeLegacyResult(input: any) {
  const out = { ...(input || {}) };
  out.ok = out.ok === false ? false : true;
  out.headline = out.headline ?? out.summary ?? "";
  out.score = Number.isFinite(Number(out.score)) ? Number(out.score) : 50;
  out.risk_level = out.risk_level ?? "low";
  out.confidence = Number.isFinite(Number(out.confidence)) ? Number(out.confidence) : 0.6;
  out.uncertainty_note = out.uncertainty_note ?? "";
  if (!out.stool_features) {
    out.stool_features = {
      bristol_type: out.bristol_type ?? null,
      shape: "偏软/糊状",
      bristol_range: "unknown",
      shape_desc: "未知形态",
      color: out.color ?? "黄褐/偏黄",
      color_desc: out.color ?? "未知颜色",
      color_reason: "多与饮食构成和肠道通过速度相关",
      texture: out.texture ?? "细腻/糊状",
      texture_desc: out.texture ?? "未知质地",
      abnormal_signs: ["未见明显异常"],
      volume: "unknown",
      wateriness: "none",
      mucus: "none",
      foam: "none",
      blood: "none",
      undigested_food: "none",
      separation_layers: "none",
      odor_level: "unknown",
      visible_findings: ["none"],
    };
  }
  if (!out.interpretation) {
    out.interpretation = {
      overall_judgement: "需结合更多信息判断",
      why_shape: ["图片角度可能影响判断", "仅凭单张图片信息有限"],
      why_color: ["颜色受光线影响", "需结合饮食判断"],
      why_texture: ["质地受含水量影响", "需结合排便情况判断"],
      how_context_affects: ["未提供补充信息", "若精神食欲良好更偏功能性", "若有发热腹痛需警惕"],
      confidence_explain: "缺少完整补充信息，置信度有限。",
    };
  }
  if (!out.doctor_explanation) {
    out.doctor_explanation = {
      one_sentence_conclusion: out.headline ?? "",
      shape: "形态偏软并不一定异常",
      color: "颜色多与饮食和通过速度相关",
      texture: "未见感染性腹泻的典型表现",
      visual_analysis: {
        shape: "形态偏软并不一定异常",
        color: "颜色多与饮食和通过速度相关",
        texture: "未见感染性腹泻的典型表现",
      },
      combined_judgement: out.interpretation?.overall_judgement || "",
    };
  }
  if (!out.possible_causes) {
    out.possible_causes = [
      { title: "饮食结构影响", explanation: "水果或含水量高的食物增加会让便便偏软。" },
      { title: "肠道蠕动偏快", explanation: "幼儿阶段肠道功能调试期，容易偏软。" },
      { title: "轻微受凉或作息变化", explanation: "环境变化可短暂影响消化节律。" },
    ];
  }
  if (!out.reasoning_bullets) out.reasoning_bullets = [];
  if (!out.actions_today) {
    out.actions_today = {
      diet: Array.isArray(out.diet_advice) ? out.diet_advice : [],
      hydration: out.hydration_hint ? [out.hydration_hint] : [],
      care: Array.isArray(out.care_advice) ? out.care_advice : [],
      avoid: [],
      observe: [],
    };
  }
  if (!out.red_flags) out.red_flags = [];
  if (!out.follow_up_questions) out.follow_up_questions = [];
  if (!out.ui_strings) {
    out.ui_strings = {
      summary: out.summary ?? "",
      tags: [],
      sections: [],
    };
  }
  if (!out.ui_strings.longform) {
    out.ui_strings.longform = {
      conclusion: "",
      how_to_read: "",
      context: "",
      causes: "",
      todo: "",
      red_flags: "",
      reassure: "",
    };
  }
  return out;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    void ctx;
    const url = new URL(request.url);
    console.log("[WORKER] request", request.method, url.pathname);
    const origin = request.headers.get("Origin") || undefined;

    const workerVersion = env.WORKER_VERSION ?? "dev";
    const json = (data: unknown, status = 200, extraHeaders: Record<string, string> = {}) => {
      let payload: unknown = data;
      if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>;
        if (!("schema_version" in obj)) {
          obj.schema_version = SCHEMA_VERSION;
        }
        payload = obj;
      }
      return new Response(JSON.stringify(payload), {
        status,
        headers: {
          "content-type": "application/json",
          "x-worker-version": workerVersion,
          "schema_version": String(SCHEMA_VERSION),
          ...extraHeaders,
          ...corsHeaders(origin),
        },
      });
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

        if (url.pathname === "/ping" && request.method === "GET") {
      return json({ ok: true, schema_version: SCHEMA_VERSION, worker_version: workerVersion });
    }

        if (url.pathname === "/proxy_ping" && request.method === "GET") {
          const proxyBase =
            env.OPENAI_PROXY_BASE_URL ||
            env.OPENAI_PROXY_URL ||
            "https://stool-ai-app.onrender.com";
          const proxyPingUrl = proxyBase.replace(/\/+$/, "") + "/ping";
          let proxyPing: unknown = null;
          let proxyStatus = 0;
          try {
            const resp = await fetch(proxyPingUrl, { method: "GET" });
            proxyStatus = resp.status;
            const text = await resp.text();
            try {
              proxyPing = JSON.parse(text);
            } catch {
              proxyPing = { raw: text };
            }
          } catch (err) {
            proxyPing = { error: String(err?.message || err) };
          }
          return json({
            ok: true,
            proxy_base_url: proxyBase,
            proxy_ping_url: proxyPingUrl,
            proxy_status: proxyStatus,
            proxy_ping: proxyPing,
            worker_version: workerVersion,
            schema_version: SCHEMA_VERSION,
          });
        }

    if (url.pathname === "/version" && request.method === "GET") {
      return json({
        ok: true,
        version: workerVersion,
        worker_version: workerVersion,
        schema_version: SCHEMA_VERSION,
      });
    }

    if (url.pathname === "/analyze" && request.method === "POST") {
      const rayId = request.headers.get("cf-ray");
      const baseHeaders = {
        "x-proxy-version": "unknown",
        "x-openai-model": "unknown",
        "x-build-id": "unknown",
      };
      let context: Record<string, unknown> = {};
      try {
        const ct = request.headers.get("content-type") || "";
        console.log("[ANALYZE] content-type=" + ct);
        if (!ct.includes("application/json")) {
          const invalid = buildInvalidImageResult(workerVersion, rayId);
          const normalized = normalizeV2(invalid, workerVersion);
          normalized.input_echo = { context: {} };
          return json(normalized, 422, baseHeaders);
        }

        const raw = await request.text();
        console.log("[ANALYZE] rawLen=" + raw.length);
        let body: Record<string, unknown> = {};
        try {
          body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
          body = {};
        }

        console.log("[ANALYZE] body keys", Object.keys(body));
        context =
          body &&
          (typeof (body as any).context === "object" || typeof (body as any).context_input === "object")
            ? (((body as any).context || (body as any).context_input) as Record<string, unknown>)
            : {};
        console.log("[ANALYZE] context keys", Object.keys(context || {}));
        (body as any).context = context || {};
        const verifyHeader = request.headers.get("x-verify-token");
        const verifyEnabled = !!env.VERIFY_TOKEN;
        const verifyMatched = verifyEnabled && verifyHeader === env.VERIFY_TOKEN;
        if (verifyEnabled) {
          console.log(
            "[ANALYZE] verify token present=" +
              (verifyHeader ? "yes" : "no") +
              " matched=" +
              (verifyMatched ? "yes" : "no")
          );
        }
        console.log("[ANALYZE] image type", typeof body.image);
        console.log(
          "[ANALYZE] image length",
          typeof body.image === "string" ? body.image.length : null
        );
        const image = typeof body.image === "string" ? body.image : "";
        if (!image || image.trim().length < 10 || image.trim() === "test") {
          console.log("[ANALYZE] missing image keys", Object.keys(body));
          const invalid = buildInvalidImageResult(workerVersion, rayId);
          const normalized = normalizeV2(invalid, workerVersion);
          normalized.input_echo = { context };
          return json(normalized, 422, baseHeaders);
        }

        const imageBytes = decodeBase64Image(image);
        const dims = imageBytes ? getImageDimensions(imageBytes) : null;
        if (!imageBytes || !dims || dims.width < 512 || dims.height < 512) {
          const invalid = buildInvalidImageResult(workerVersion, rayId);
          const normalized = normalizeV2(invalid, workerVersion);
          normalized.input_echo = { context };
          return json(normalized, 422, baseHeaders);
        }

        const proxyUrl =
          env.OPENAI_PROXY_BASE_URL ||
          env.OPENAI_PROXY_URL ||
          "https://stool-ai-app.onrender.com";
        if (proxyUrl) {
          const proxy = proxyUrl.replace(/\/+$/, "") + "/analyze";
          console.log("[PROXY] enabled host=" + new URL(proxyUrl).host);
          const start = Date.now();
          console.log("[OPENAI] start");
          const proxyResp = await fetch(proxy, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const proxyVersion =
            proxyResp.headers.get("x-proxy-version") ||
            proxyResp.headers.get("x-proxy-version".toLowerCase()) ||
            "unknown";
          const proxyModel =
            proxyResp.headers.get("x-openai-model") ||
            proxyResp.headers.get("x-openai-model".toLowerCase()) ||
            "";
          const proxyBuildId =
            proxyResp.headers.get("x-build-id") ||
            proxyResp.headers.get("x-build-id".toLowerCase()) ||
            "unknown";
          const proxyHeaders = {
            "x-proxy-version": proxyVersion,
            "x-openai-model": proxyModel || "unknown",
            "x-build-id": proxyBuildId,
          };
          console.log(
            `[PROXY] headers x-proxy-version=${proxyVersion} x-openai-model=${proxyModel || "unknown"} x-build-id=${proxyBuildId}`
          );
          const ms = Date.now() - start;
          console.log("[OPENAI] done");
          console.log("[OPENAI] ms=" + ms);
          const text = await proxyResp.text().catch(() => "");
          if (!proxyResp.ok) {
            console.log(
              `[PROXY] status=${proxyResp.status} content-type=${proxyResp.headers.get("content-type") || ""}`
            );
            console.log(`[PROXY] body preview=${text.slice(0, 200)}`);
          }
          let data: unknown;
          try {
            data = JSON.parse(text);
          } catch {
            data = { ok: false, error: "BAD_PROXY_RESPONSE", message: text };
          }
          if (!proxyResp.ok || (data as any)?.ok === false || (data as any)?.error) {
            const modelUsed =
              (data as any)?.model_used || proxyModel || "unknown";
            if ((data as any)?.error_code) {
              const normalized = normalizeV2(
                data,
                workerVersion,
                proxyVersion,
                modelUsed
              );
              normalized.input_echo = { context };
              return json(normalized, 200, proxyHeaders);
            }
            const err = buildProxyErrorResult(
              workerVersion,
              proxyVersion,
              modelUsed,
              text || `proxy status ${proxyResp.status}`,
              rayId
            );
            const normalized = normalizeV2(err, workerVersion, proxyVersion, modelUsed);
            normalized.input_echo = { context };
            return json(normalized, 200, proxyHeaders);
          }
          if ((data as any)?.ok === true) {
            data = upgradeLegacyResult(data);
          }
          const modelUsed =
            (data as any)?.model_used ||
            proxyModel ||
            "unknown";
          const normalized = normalizeV2(
            data,
            workerVersion,
            proxyVersion,
            modelUsed
          );
          normalized.input_echo = { context };
          if (normalized && typeof normalized === "object") {
            const guardFlag = (normalized as any).is_stool_image;
            if (guardFlag === false) {
              console.log(
                `[GUARD] is_stool_image=false confidence=${(normalized as any).confidence ?? ""} reason=${(normalized as any).explanation ?? ""}`
              );
            }
          }
          return json(normalized, 200, proxyHeaders);
        }

        if (!env.OPENAI_API_KEY) {
          const normalized = normalizeV2(
            {
              ok: false,
              error: "OPENAI_UNSUPPORTED_REGION",
              message: "OpenAI 不支持当前 Worker 出网地区，请配置 OPENAI_PROXY_URL",
            },
            workerVersion
          );
          normalized.input_echo = { context };
          return json(normalized, 200, baseHeaders);
        }

        console.log("[OPENAI] start");
        const start = Date.now();
        const directModel = "gpt-5.2";
        const resp = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: directModel,
            input: [
              {
                role: "system",
                content: [{ type: "input_text", text: SYSTEM_PROMPT }],
              },
              {
                role: "user",
                content: [
                  { type: "input_text", text: userPromptFromBody(body) },
                  { type: "input_image", image_base64: image },
                ],
              },
            ],
            text: { format: { type: "json_object" } },
            temperature: 0.2,
            max_output_tokens: 1000,
          }),
        });
        const ms = Date.now() - start;
        console.log("[OPENAI] done");
        console.log("[OPENAI] ms=" + ms);

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          const normalized = normalizeV2(
            {
              ok: false,
              error: "OPENAI_ERROR",
              message: text || "openai request failed",
              rayId,
            },
            workerVersion,
            undefined,
            directModel
          );
          normalized.input_echo = { context };
          return json(normalized, 200, baseHeaders);
        }

        const data = await resp.json();
        const outputText = extractOutputText(data);
        if (!outputText) {
          const normalized = normalizeV2(
            { ok: false, error: "OPENAI_ERROR", message: "empty model output", rayId },
            workerVersion,
            undefined,
            directModel
          );
          normalized.input_echo = { context };
          return json(normalized, 200, { ...baseHeaders, "x-openai-model": directModel });
        }
        let parsed: any = {};
        try {
          parsed = JSON.parse(outputText);
        } catch {
          const normalized = normalizeV2(
            { ok: false, error: "OPENAI_ERROR", message: "invalid json output", rayId },
            workerVersion,
            undefined,
            directModel
          );
          normalized.input_echo = { context };
          return json(normalized, 200, { ...baseHeaders, "x-openai-model": directModel });
        }
        const normalized = normalizeV2(parsed, workerVersion, undefined, directModel);
        normalized.input_echo = { context };
        return json(normalized, 200, { ...baseHeaders, "x-openai-model": directModel });
      } catch (error: any) {
        console.log("[OPENAI] catch");
        console.error("[OPENAI] error", error);
        console.error("[OPENAI] stack", error?.stack ?? "no stack");
        const normalized = normalizeV2(
          { ok: false, error: "OPENAI_ERROR", message: "analyze failed", rayId },
          workerVersion,
          undefined,
          "unknown"
        );
        normalized.input_echo = { context: {} };
        return json(normalized, 200, baseHeaders);
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders(origin) });
  },
};

