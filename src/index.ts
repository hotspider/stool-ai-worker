export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_PROXY_URL?: string;
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
        { title: "饮食", items: [] },
        { title: "补液", items: [] },
        { title: "护理", items: [] },
        { title: "警戒信号", items: [] },
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

function normalizeResult(parsed: any) {
  const base = buildDefaultResult();
  const out = { ...base, ...(parsed || {}) };

  const stool = { ...base.stool_features, ...(out.stool_features || {}) };
  const actions = { ...base.actions_today, ...(out.actions_today || {}) };
  const ui = { ...base.ui_strings, ...(out.ui_strings || {}) };

  out.ok = out.ok === false ? false : true;
  out.score = Number.isFinite(Number(out.score)) ? Number(out.score) : base.score;
  out.risk_level = ["low", "medium", "high"].includes(out.risk_level)
    ? out.risk_level
    : base.risk_level;
  out.confidence = Number.isFinite(Number(out.confidence))
    ? Number(out.confidence)
    : base.confidence;
  out.uncertainty_note = typeof out.uncertainty_note === "string" ? out.uncertainty_note : "";
  out.headline = typeof out.headline === "string" ? out.headline : "";
  out.summary = typeof out.summary === "string" ? out.summary : "";

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

  out.reasoning_bullets = Array.isArray(out.reasoning_bullets)
    ? out.reasoning_bullets.map(String).slice(0, 5)
    : [];

  out.actions_today = {
    diet: Array.isArray(actions.diet) ? actions.diet.map(String) : [],
    hydration: Array.isArray(actions.hydration) ? actions.hydration.map(String) : [],
    care: Array.isArray(actions.care) ? actions.care.map(String) : [],
    avoid: Array.isArray(actions.avoid) ? actions.avoid.map(String) : [],
  };

  out.red_flags = Array.isArray(out.red_flags)
    ? out.red_flags.map((item: any) => ({
        title: item?.title ? String(item.title) : "",
        detail: item?.detail ? String(item.detail) : "",
      }))
    : [];

  out.follow_up_questions = Array.isArray(out.follow_up_questions)
    ? out.follow_up_questions.map(String)
    : [];

  out.ui_strings = {
    summary: typeof ui.summary === "string" ? ui.summary : out.summary,
    tags: Array.isArray(ui.tags) ? ui.tags.map(String) : [],
    sections: Array.isArray(ui.sections)
      ? ui.sections.map((sec: any) => ({
          title: sec?.title ? String(sec.title) : "",
          items: Array.isArray(sec?.items) ? sec.items.map(String) : [],
        }))
      : base.ui_strings.sections,
  };

  out.summary = out.ui_strings.summary || out.summary || "";
  out.bristol_type = out.stool_features.bristol_type ?? null;
  out.color = out.stool_features.color ?? null;
  out.texture = out.stool_features.texture ?? null;
  out.hydration_hint = out.actions_today.hydration[0] || "";
  out.diet_advice = out.actions_today.diet || [];

  return out;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    void ctx;
    const url = new URL(request.url);
    console.log("[WORKER] request", request.method, url.pathname);
    const origin = request.headers.get("Origin") || undefined;

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json", ...corsHeaders(origin) },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/ping" && request.method === "GET") {
      return json({ ok: true });
    }

    if (url.pathname === "/analyze" && request.method === "POST") {
      const rayId = request.headers.get("cf-ray");
      try {
        const ct = request.headers.get("content-type") || "";
        console.log("[ANALYZE] content-type=" + ct);
        if (!ct.includes("application/json")) {
          return json(
            {
              ok: false,
              error: "BAD_CONTENT_TYPE",
              message: "Content-Type must be application/json",
            },
            400
          );
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
          return json(
            { ok: false, error: "NO_IMAGE", message: "image is required", rayId },
            400
          );
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
          return json(data, proxyResp.status);
        }

        if (!env.OPENAI_API_KEY) {
          return json(
            {
              ok: false,
              error: "OPENAI_UNSUPPORTED_REGION",
              message: "OpenAI 不支持当前 Worker 出网地区，请配置 OPENAI_PROXY_URL",
            },
            503
          );
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
          return json(
            {
              ok: false,
              error: "OPENAI_ERROR",
              message: text || "openai request failed",
              rayId,
            },
            500
          );
        }

        const data = await resp.json();
        const outputText = extractOutputText(data);
        if (!outputText) {
          return json(
            { ok: false, error: "OPENAI_ERROR", message: "empty model output", rayId },
            500
          );
        }
        let parsed: any = {};
        try {
          parsed = JSON.parse(outputText);
        } catch {
          return json(
            { ok: false, error: "OPENAI_ERROR", message: "invalid json output", rayId },
            500
          );
        }
        const normalized = normalizeResult(parsed);
        return json(normalized, 200);
      } catch (error: any) {
        console.log("[OPENAI] catch");
        console.error("[OPENAI] error", error);
        console.error("[OPENAI] stack", error?.stack ?? "no stack");
        return new Response(
          JSON.stringify({
            ok: false,
            error: "OPENAI_ERROR",
            message: "analyze failed",
            rayId,
          }),
          {
            status: 500,
            headers: { "content-type": "application/json" },
          }
        );
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders(origin) });
  },
};

