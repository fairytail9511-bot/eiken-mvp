export const REVIEW_LIST_KEY = "eiken_mvp_reviewList";
export const ACTIVE_REVIEW_ITEM_KEY = "eiken_mvp_activeReviewItem";

export type ReviewStage = 0 | 1 | 2 | 3;

export type ReviewItem = {
  id: string;
  topic: string;
  topicKey: string;
  addedAt: string;
  lastReviewedAt?: string;
  lastCompletedSessionId?: string;
  nextReviewAt?: string;
  stage: ReviewStage;
  sourceSession: unknown;
};

function parseItems(raw: string | null): ReviewItem[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as ReviewItem[]) : [];
  } catch {
    return [];
  }
}

function topicKey(topic: unknown) {
  return String(topic ?? "").trim().toLocaleLowerCase();
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

export function loadReviewList() {
  if (typeof window === "undefined") return [];
  return parseItems(localStorage.getItem(REVIEW_LIST_KEY));
}

export function saveReviewList(items: ReviewItem[]) {
  localStorage.setItem(REVIEW_LIST_KEY, JSON.stringify(items));
}

export function addReviewItem(topic: string, sourceSession: unknown) {
  const normalizedTopic = String(topic ?? "").trim();
  const normalizedKey = topicKey(normalizedTopic);
  if (!normalizedKey) throw new Error("Topic is required");

  const now = new Date();
  const current = loadReviewList();
  const existing = current.find((item) => item.topicKey === normalizedKey);
  const item: ReviewItem = {
    id: existing?.id ?? (crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`),
    topic: normalizedTopic,
    topicKey: normalizedKey,
    addedAt: existing?.addedAt ?? now.toISOString(),
    stage: 0,
    nextReviewAt: addDays(now, 1),
    sourceSession,
  };
  saveReviewList([item, ...current.filter((candidate) => candidate.id !== item.id)]);
  return item;
}

export function completeReviewItem(itemId: string, sourceSession: unknown) {
  const current = loadReviewList();
  const now = new Date();
  const completionId = String((sourceSession as { finishedAt?: string } | null)?.finishedAt ?? "");
  const next = current.map((item): ReviewItem => {
    if (item.id !== itemId) return item;
    if (completionId && item.lastCompletedSessionId === completionId) return item;
    const nextStage = Math.min(3, item.stage + 1) as ReviewStage;
    const delayDays = nextStage === 1 ? 3 : nextStage === 2 ? 7 : null;
    return {
      ...item,
      stage: nextStage,
      lastReviewedAt: now.toISOString(),
      lastCompletedSessionId: completionId || undefined,
      nextReviewAt: delayDays == null ? undefined : addDays(now, delayDays),
      sourceSession,
    };
  });
  saveReviewList(next);
}

export function removeReviewItem(itemId: string) {
  saveReviewList(loadReviewList().filter((item) => item.id !== itemId));
}
