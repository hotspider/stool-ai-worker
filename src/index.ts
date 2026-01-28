export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_PROXY_URL?: string;
  WORKER_VERSION?: string;
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
  return `
幼儿月龄: ${age ?? "unknown"}
气味: ${odor}
是否疼痛/费力: ${typeof strain === "boolean" ? String(strain) : "unknown"}
最近饮食关键词: ${diet || "unknown"}

请基于图片和以上信息给出分析与建议。
`.trim();
}

const SYSTEM_PROMPT = `
你是儿科+营养师背景的健康助手。用户提供幼儿(0-36个月)大便图片与补充信息，你必须输出严格 JSON（不要 Markdown、不要额外文字）。
输出结构必须包含所有字段（允许 null/""/[] 但字段必须存在），且不要输出任何未列出的字段。
请尽量提供“家长可执行”的饮食/补液/护理/观察建议，并提供红旗预警。

必须输出的 JSON 结构如下：
{
  "ok": true,
  "headline": "一句话结论",
  "score": 0-100,
  "risk_level": "low|medium|high",
  "confidence": 0.0-1.0,
  "uncertainty_note": "不确定说明",
  "stool_features": {
    "bristol_type": 1-7|null,
    "color": "string|null",
    "texture": "string|null",
    "volume": "small|medium|large|unknown",
    "visible_findings": ["mucus","undigested_food","blood","foam","watery","seeds","none"]
  },
  "reasoning_bullets": ["要点1","要点2","要点3"],
  "actions_today": {
    "diet": ["饮食建议"],
    "hydration": ["补液建议"],
    "care": ["护理建议"],
    "avoid": ["避免事项"]
  },
  "red_flags": [
    {"title":"何时需要就医/警戒","detail":"清晰阈值描述"}
  ],
  "follow_up_questions": ["可补充信息1","2"],
  "ui_strings": {
    "summary": "2-3句总结",
    "tags": ["Bristol 6","黄色","偏稀"],
    "sections": [
      {"title":"饮食","items":["..."]},
      {"title":"补液","items":["..."]},
      {"title":"护理","items":["..."]},
      {"title":"警戒信号","items":["..."]}
    ]
  },
  "summary": "同 ui_strings.summary",
  "bristol_type": null,
  "color": null,
  "texture": null,
  "hydration_hint": "从 actions_today.hydration 生成一句话",
  "diet_advice": ["同 actions_today.diet"]
}
`.trim();

function buildDefaultResult() {
  return {
    ok: true,
    schema_version: SCHEMA_VERSION,
    worker_version: "",
    headline: "",
    score: 50,
    risk_level: "low",
    confidence: 0.6,
    uncertainty_note: "",
    stool_features: {
      bristol_type: null,
      color: null,
      texture: null,
      volume: "unknown",
      visible_findings: ["none"],
    },
    reasoning_bullets: [],
    actions_today: {
      diet: [],
      hydration: [],
      care: [],
      avoid: [],
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
    },
    summary: "",
    bristol_type: null,
    color: null,
    texture: null,
    hydration_hint: "",
    diet_advice: [],
  };
}

const DEFAULT_REASONING = [
  "图片角度或光线可能影响判断准确性",
  "结合近期饮食与症状信息综合分析",
  "当前结果更像短期饮食或消化变化",
  "建议持续记录 24-48 小时变化",
  "如出现不适或异常症状需及时就医",
];

const DEFAULT_DIET = ["清淡易消化饮食", "少量多餐，观察耐受"];
const DEFAULT_HYDRATION = ["少量多次补液", "观察尿量是否减少"];
const DEFAULT_CARE = ["便后温水清洁并保持干爽", "注意皮肤红肿或破损"];
const DEFAULT_AVOID = ["避免油炸/辛辣/高糖食物", "暂避冰冷刺激饮品"];
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

function normalizeV2(parsed: any, workerVersion: string, proxyVersion?: string) {
  const base = buildDefaultResult();
  const out = { ...base, ...(parsed || {}) } as any;

  const stool = { ...base.stool_features, ...(out.stool_features || {}) };
  const actions = { ...base.actions_today, ...(out.actions_today || {}) };
  const ui = { ...base.ui_strings, ...(out.ui_strings || {}) };

  out.ok = out.ok === false ? false : true;
  out.schema_version = SCHEMA_VERSION;
  out.worker_version = out.worker_version || workerVersion;
  if (proxyVersion) {
    out.proxy_version = proxyVersion;
  }

  out.score = Number.isFinite(Number(out.score)) ? Number(out.score) : base.score;
  out.confidence = Number.isFinite(Number(out.confidence))
    ? Number(out.confidence)
    : base.confidence;
  out.uncertainty_note = typeof out.uncertainty_note === "string" ? out.uncertainty_note : "";
  out.headline = typeof out.headline === "string" ? out.headline : "";
  out.risk_level = ["low", "medium", "high"].includes(out.risk_level)
    ? out.risk_level
    : base.risk_level;
  if (!out.ok) {
    out.risk_level = "unknown";
  }

  out.stool_features = {
    bristol_type:
      stool.bristol_type === null
        ? null
        : Number.isFinite(Number(stool.bristol_type))
            ? Number(stool.bristol_type)
            : null,
    color: stool.color ?? null,
    texture: stool.texture ?? null,
    volume: ["small", "medium", "large", "unknown"].includes(stool.volume)
      ? stool.volume
      : "unknown",
    visible_findings: Array.isArray(stool.visible_findings)
      ? stool.visible_findings.map(String)
      : [],
  };

  out.reasoning_bullets = ensureMinItems(
    Array.isArray(out.reasoning_bullets) ? out.reasoning_bullets.map(String) : [],
    5,
    DEFAULT_REASONING
  );

  out.actions_today = {
    diet: ensureMinItems(
      Array.isArray(actions.diet) ? actions.diet.map(String) : [],
      2,
      DEFAULT_DIET
    ),
    hydration: ensureMinItems(
      Array.isArray(actions.hydration) ? actions.hydration.map(String) : [],
      2,
      DEFAULT_HYDRATION
    ),
    care: ensureMinItems(
      Array.isArray(actions.care) ? actions.care.map(String) : [],
      2,
      DEFAULT_CARE
    ),
    avoid: ensureMinItems(
      Array.isArray(actions.avoid) ? actions.avoid.map(String) : [],
      2,
      DEFAULT_AVOID
    ),
  };

  out.red_flags = ensureMinRedFlags(
    Array.isArray(out.red_flags)
      ? out.red_flags.map((item: any) => {
          if (typeof item === "string") {
            return { title: item, detail: "" };
          }
          return {
            title: item?.title ? String(item.title) : "",
            detail: item?.detail ? String(item.detail) : item?.why ? String(item.why) : "",
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
        const items = Array.isArray(sec?.items)
          ? sec.items
          : Array.isArray(sec?.bullets)
              ? sec.bullets
              : [];
        return {
          title: sec?.title ? String(sec.title) : "",
          icon_key: sec?.icon_key ? String(sec.icon_key) : "",
          items: Array.isArray(items) ? items.map(String) : [],
        };
      })
    : [];

  out.ui_strings = {
    summary: typeof ui.summary === "string" ? ui.summary : out.summary,
    tags: Array.isArray(ui.tags) ? ui.tags.map(String) : [],
    sections: normalizedSections,
  };

  const baseSections = base.ui_strings.sections;
  const sections = ensureMinItems(
    out.ui_strings.sections,
    4,
    baseSections
  ).map((sec: any, idx: number) => ({
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
      ]
    ),
  }));

  out.ui_strings.sections = sections;

  if (!out.headline) {
    out.headline = out.ok ? "整体风险偏低，建议继续观察" : "分析不确定，建议补充信息";
  }
  if (!out.uncertainty_note && !out.ok) {
    out.uncertainty_note = "图片信息不足，建议补充说明或更清晰图片。";
  }

  out.summary =
    out.ui_strings.summary ||
    [out.headline, ...out.reasoning_bullets.slice(0, 2)].filter(Boolean).join("，");

  out.bristol_type = out.stool_features.bristol_type ?? null;
  out.color = out.stool_features.color ?? null;
  out.texture = out.stool_features.texture ?? null;
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
      color: out.color ?? null,
      texture: out.texture ?? null,
      volume: "unknown",
      visible_findings: ["none"],
    };
  }
  if (!out.reasoning_bullets) out.reasoning_bullets = [];
  if (!out.actions_today) {
    out.actions_today = {
      diet: Array.isArray(out.diet_advice) ? out.diet_advice : [],
      hydration: out.hydration_hint ? [out.hydration_hint] : [],
      care: Array.isArray(out.care_advice) ? out.care_advice : [],
      avoid: [],
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
      const proxyHeader = { "x-proxy-version": "unknown" };
      try {
        const ct = request.headers.get("content-type") || "";
        console.log("[ANALYZE] content-type=" + ct);
        if (!ct.includes("application/json")) {
          const normalized = normalizeV2(
            {
              ok: false,
              error: "BAD_CONTENT_TYPE",
              message: "Content-Type must be application/json",
            },
            workerVersion
          );
          return json(normalized, 200, proxyHeader);
        }

        const raw = await request.text();
        console.log("[ANALYZE] rawLen=" + raw.length);
        console.log("[ANALYZE] rawPreview=" + raw.slice(0, 200));
        let body: Record<string, unknown> = {};
        try {
          body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
          body = {};
        }

        console.log("[ANALYZE] body keys", Object.keys(body));
        console.log("[ANALYZE] image type", typeof body.image);
        console.log(
          "[ANALYZE] image length",
          typeof body.image === "string" ? body.image.length : null
        );
        const image = typeof body.image === "string" ? body.image : "";
        if (!image || image.trim().length < 10) {
          console.log("[ANALYZE] missing image keys", Object.keys(body));
          const normalized = normalizeV2(
            { ok: false, error: "NO_IMAGE", message: "image is required", rayId },
            workerVersion
          );
          return json(normalized, 200, proxyHeader);
        }

        const proxyUrl = env.OPENAI_PROXY_URL;
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
          const proxyHeaders = { "x-proxy-version": proxyVersion };
          const ms = Date.now() - start;
          console.log("[OPENAI] done");
          console.log("[OPENAI] ms=" + ms);
          const text = await proxyResp.text().catch(() => "");
          let data: unknown;
          try {
            data = JSON.parse(text);
          } catch {
            data = { ok: false, error: "BAD_PROXY_RESPONSE", message: text };
          }
          if (!proxyResp.ok && (data as any)?.ok !== true) {
            data = {
              ok: false,
              error: "PROXY_ERROR",
              message: text || `proxy status ${proxyResp.status}`,
            };
          }
          if ((data as any)?.ok === true) {
            data = upgradeLegacyResult(data);
          }
          const normalized = normalizeV2(data, workerVersion, proxyVersion);
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
          return json(normalized, 200, proxyHeader);
        }

        console.log("[OPENAI] start");
        const start = Date.now();
        const resp = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
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
            workerVersion
          );
          return json(normalized, 200, proxyHeader);
        }

        const data = await resp.json();
        const outputText = extractOutputText(data);
        if (!outputText) {
          const normalized = normalizeV2(
            { ok: false, error: "OPENAI_ERROR", message: "empty model output", rayId },
            workerVersion
          );
          return json(normalized, 200, proxyHeader);
        }
        let parsed: any = {};
        try {
          parsed = JSON.parse(outputText);
        } catch {
          const normalized = normalizeV2(
            { ok: false, error: "OPENAI_ERROR", message: "invalid json output", rayId },
            workerVersion
          );
          return json(normalized, 200, proxyHeader);
        }
        const normalized = normalizeV2(parsed, workerVersion);
        return json(normalized, 200, proxyHeader);
      } catch (error: any) {
        console.log("[OPENAI] catch");
        console.error("[OPENAI] error", error);
        console.error("[OPENAI] stack", error?.stack ?? "no stack");
        const normalized = normalizeV2(
          { ok: false, error: "OPENAI_ERROR", message: "analyze failed", rayId },
          workerVersion
        );
        return json(normalized, 200, proxyHeader);
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders(origin) });
  },
};

