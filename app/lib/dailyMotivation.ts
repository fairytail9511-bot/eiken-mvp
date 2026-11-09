import { daysUntilExam } from "./examDate";

export const MOTIVATIONAL_MESSAGES = [
  "完璧待ち界隈、今日は一言から。",
  "親の顔より聞いた “I think”。言い出しにも、たまには変化を。",
  "この1問でしか摂れない栄養がある。",
  "今日の練習、本番への伏線にしていく件。",
  "推しは推せるときに推せ。練習は、できる分だけでいい。",
  "人類は2種類いる。今日始めた人と、今日再開した人。",
  "明日から本気出す？　今日は一言だけでも。",
  "エッホエッホ、自分のペースでいいって伝えなきゃ。",
  "今日の一歩、優勝。",
  "パラフレーズ沼へようこそ。ひと言ずつ、気楽にどうぞ。",
  "スピーチは一気飲みしなくていい。一文ずついこう。",
  "目指すは、自分の考えとの「解釈一致」。",
  "伝わるひと言、メロすぎん？",
  "伸びしろ発見。これ、次の練習の伏線では？",
  "開いただけでえらい。声に出せたら、なおえらい。",
  "今日の1問、本番の自分に届け。知らんけど。",
  "スピーチ、一文からでいいって、コト…！？",
  "一文話したら、今日はそれでよしとする部屋。",
  "本日のログインボーナス：英語に触れるきっかけ。",
  "目指せ、実績解除。「自分の言葉で伝えた」。",
  "お題ガチャ、どのテーマも経験値。",
  "二次試験はボス戦。装備は、ひと言ずつ増やしていこう。",
  "It’s giving「自分のペースで前進」。",
  "POV：本番の自分に、今日の練習を仕込んでいる。",
  "Dream big. 練習は、まず一文から。",
  "brain rotをひと休み。今日はちょっとbrain boost。",
  "＋1000 auraを目指して、まずは笑顔でごあいさつ。",
  "自分の言葉で伝える練習、slayしていこう。",
  "マイペースcore。少しずつでも、自分の歩幅で。",
  "You had me at “Let me try.”　まずは、言ってみよう。",
] as const;

export const EXAM_DAY_MESSAGE = "今日は本番。いつもの練習を思い出して、ひと言ずつ、自分の考えを伝えていきましょう。";
export const AFTER_EXAM_MESSAGE = "まずは、おつかれさまでした。ひと息ついて、次の一歩も自分のペースで。";

type DailyMotivation = { kind: "daily" | "exam-day" | "after-exam"; text: string };

/** Fixed calendar anchor: no random selection, API calls, counters or storage writes. */
export function getDailyMotivation(now = new Date(), examDate: string | null = null): DailyMotivation {
  const remaining = examDate ? daysUntilExam(examDate, now) : null;
  if (remaining === 0) return { kind: "exam-day", text: EXAM_DAY_MESSAGE };
  if (remaining !== null && remaining < 0) return { kind: "after-exam", text: AFTER_EXAM_MESSAGE };

  const elapsed = -(daysUntilExam("2026-11-01", now) ?? 0);
  const index = ((elapsed % MOTIVATIONAL_MESSAGES.length) + MOTIVATIONAL_MESSAGES.length) % MOTIVATIONAL_MESSAGES.length;
  return { kind: "daily", text: MOTIVATIONAL_MESSAGES[index] };
}
