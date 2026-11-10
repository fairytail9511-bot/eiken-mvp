/** Only this allowlisted data may be rendered. Never capture the result page. */
export type ResultCardSource = {
  finishedAt?: unknown;
  reviewMode?: unknown;
  scoreResult?: {
    breakdown?: {
      short_speech?: unknown;
      interaction?: unknown;
      grammar_vocab?: unknown;
      pronunciation_fluency?: unknown;
    };
  };
};

export type ResultCardData = {
  dateLabel: string;
  modeLabel: string;
  carryoverNote: string | null;
  scores: [number, number, number, number];
  total: number;
};

export const RESULT_CARD_WIDTH = 1080;
export const RESULT_CARD_HEIGHT = 1350;
export const RESULT_CARD_LABELS = ["スピーチ", "やり取り", "文法・語彙", "発音・流暢さ（推定）"] as const;
export const RESULT_CARD_DISCLAIMER = "英検公式の採点結果ではありません。";

function formatResultDate(value: unknown): string {
  // Never replace an unknown historical date with today's date.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return "記録なし";
  const day = value.slice(0, 10);
  const midnight = new Date(`${day}T00:00:00.000Z`);
  if (day.startsWith("0000-") || !Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== day) return "記録なし";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "記録なし";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function buildResultCardData(source: ResultCardSource | null): ResultCardData | null {
  const breakdown = source?.scoreResult?.breakdown;
  const values = [breakdown?.short_speech, breakdown?.interaction, breakdown?.grammar_vocab, breakdown?.pronunciation_fluency];
  // A missing/corrupt score is not a zero. Refuse to generate a misleading card.
  if (!values.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 10)) return null;
  const scores = values as ResultCardData["scores"];
  const mode = source?.reviewMode;
  return {
    dateLabel: formatResultDate(source?.finishedAt),
    modeLabel: mode === "qa" ? "復習：Q&Aのみ" : mode === "speech" ? "復習：スピーチのみ" : mode === "full" ? "復習：スピーチ＋Q&A" : "通常面接",
    carryoverNote: mode === "qa" ? "スピーチの点数は前回から引き継いでいます。" : mode === "speech" ? "やり取りの点数は前回から引き継いでいます。" : null,
    scores,
    // Use the same four-item sum as the result screen, not a cached total.
    total: scores.reduce((sum, n) => sum + n, 0),
  };
}

export function resultCardAlt(data: ResultCardData): string {
  return [
    "英検1級 面接練習", `実施日：${data.dateLabel}`, data.modeLabel,
    `アプリ内の参考スコア ${data.total}/40`,
    ...RESULT_CARD_LABELS.map((label, i) => `${label} ${data.scores[i]}/10`),
    data.carryoverNote, "スピーキング・ラボ１級", RESULT_CARD_DISCLAIMER,
  ].filter(Boolean).join("。 ");
}

/** Locally generate a PNG without API calls, external fonts or storage writes. */
export async function renderResultCard(data: ResultCardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = RESULT_CARD_WIDTH;
  canvas.height = RESULT_CARD_HEIGHT;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");
    const background = ctx.createLinearGradient(0, 0, RESULT_CARD_WIDTH, RESULT_CARD_HEIGHT);
    background.addColorStop(0, "#172641");
    background.addColorStop(1, "#080f1e");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, RESULT_CARD_WIDTH, RESULT_CARD_HEIGHT);
    ctx.strokeStyle = "#c9a957";
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, 1024, 1294);
    ctx.textBaseline = "alphabetic";

    function text(value: string, x: number, y: number, size: number, color = "#f8fafc", weight = 500) {
      ctx!.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif`;
      ctx!.fillStyle = color;
      ctx!.fillText(value, x, y);
    }

    text("PRACTICE RESULT", 80, 110, 25, "#e6ce89", 700);
    text("英検1級 面接練習", 80, 205, 64, "#ffffff", 800);
    text(`実施日：${data.dateLabel}`, 80, 262, 28, "#cbd5e1");
    text(data.modeLabel, 80, 328, 30, "#e6ce89", 700);

    text("アプリ内の参考スコア", 80, 406, 30, "#cbd5e1");
    text(String(data.total), 75, 589, 184, "#ffffff", 800);
    text("/ 40", 350, 581, 57, "#e6ce89", 700);
    ctx.fillStyle = "#c9a957";
    ctx.fillRect(80, 635, 920, 2);

    RESULT_CARD_LABELS.forEach((label, index) => {
      const y = 676 + index * 88;
      ctx.fillStyle = "#1d2a40";
      ctx.fillRect(80, y, 920, 72);
      text(label, 104, y + 47, 30);
      ctx.textAlign = "right";
      text(`${data.scores[index]} / 10`, 974, y + 49, 36, "#e6ce89", 700);
      ctx.textAlign = "left";
    });

    text(data.carryoverNote ?? "今日の練習を、次の一歩に。", 80, 1075, 26, "#cbd5e1");
    text("スピーキング・ラボ１級", 80, 1174, 34, "#e6ce89", 800);
    text("このスコアはアプリ内の練習用の参考評価です。", 80, 1230, 25, "#cbd5e1");
    text(RESULT_CARD_DISCLAIMER, 80, 1268, 25, "#cbd5e1");

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob && blob.size > 0 ? resolve(blob) : reject(new Error("PNG generation failed")), "image/png");
    });
  } finally {
    // Release the backing buffer after encoding, including when encoding fails.
    canvas.width = 0;
    canvas.height = 0;
  }
}
