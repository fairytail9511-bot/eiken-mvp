// Presentation only. Product IDs, prices and entitlements are unchanged.
// These are the existing Japan-store prices, not live StoreKit price data.
export const PAID_PLANS = {
  monthly: { productId: "com.fairytail9511.eiken.grade1.speaking.monthly", name: "月額プラン", price: "月額5,000円", purpose: "短期集中", description: "本番までの短期集中に。面接・分析・改善例・記録保存・トレーニングを1か月しっかり使えます。", renewal: "1か月ごとに5,000円で自動更新" },
  threeMonths: { productId: "com.fairytail9511.eiken.grade1.speaking.3months", name: "3か月プラン", price: "3か月12,000円", purpose: "計画的な対策", description: "本番まで計画的にコツコツ対策したい人向け。", renewal: "3か月ごとに12,000円で自動更新", monthlyEquivalent: "月あたり4,000円" },
  yearly: { productId: "com.fairytail9511.eiken.grade1.speaking.yearly", name: "年額プラン", price: "年額30,000円", purpose: "長期学習", description: "長期的に練習を続けて着実に実力をつけたい人向け。", renewal: "1年ごとに30,000円で自動更新", monthlyEquivalent: "月あたり2,500円（3プラン中、月あたり最安）" },
} as const;

export const FREE_ALLOWANCE_TEXT = "毎月、面接3回＋トレーニング2回まで無料";
export const INITIAL_TRIAL_TEXT = "初回の面接フル体験1回は、毎月の無料枠とは別に利用できます。";

export const OPEN_PLANS_EVENT = "eiken_mvp_open_plans";
export const SHOW_PLANS_KEY = "eiken_mvp_show_plans";
export const PLAN_VIEW_ACTIVE_KEY = "eiken_mvp_plan_view_active";
