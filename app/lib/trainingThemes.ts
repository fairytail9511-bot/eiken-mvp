export type TrainingThemeId =
  | "random"
  | "education"
  | "technology"
  | "environment"
  | "economy"
  | "society"
  | "healthcare"
  | "international"
  | "law"
  | "media"
  | "work";

export type TrainingTopicMode = "generated" | "fixed";

export type TrainingTheme = {
  id: TrainingThemeId;
  label: string;
  prompt: string;
  fixedTopics: string[];
};

export const TRAINING_THEME_STORAGE_KEY = "eiken_mvp_training_theme_selection";

export const TRAINING_THEMES: TrainingTheme[] = [
  { id: "random", label: "おまかせ", prompt: "Choose from a broad mix of common EIKEN Grade 1 public issues.", fixedTopics: [] },
  { id: "education", label: "教育", prompt: "education policy, schools, universities, equality of opportunity, and lifelong learning", fixedTopics: ["Should university education be free for everyone?", "Should schools place more emphasis on practical skills?", "Can online education replace traditional classrooms?", "Should standardized testing play a smaller role in education?", "Should governments do more to reduce educational inequality?"] },
  { id: "technology", label: "科学・テクノロジー／AI", prompt: "science, artificial intelligence, digital technology, privacy, automation, and ethics", fixedTopics: ["Do the benefits of artificial intelligence outweigh its risks?", "Should governments impose stricter controls on AI development?", "Will automation create more opportunities than problems?", "Should personal data receive stronger legal protection?", "Has technology made society too dependent on convenience?"] },
  { id: "environment", label: "環境・エネルギー", prompt: "climate change, biodiversity, pollution, renewable energy, nuclear power, and sustainable policy", fixedTopics: ["Is nuclear power necessary to fight climate change?", "Should economic growth ever take priority over environmental protection?", "Can renewable energy fully replace fossil fuels?", "Should governments impose stricter limits on plastic use?", "Are individuals responsible for solving environmental problems?"] },
  { id: "economy", label: "経済・ビジネス", prompt: "economic policy, taxation, corporations, inequality, globalization, and consumer behavior", fixedTopics: ["Do multinational corporations have too much influence over society?", "Should governments introduce a universal basic income?", "Is economic inequality an unavoidable part of capitalism?", "Should large companies pay higher taxes?", "Does globalization benefit developing countries?"] },
  { id: "society", label: "社会問題・少子高齢化", prompt: "demographic change, aging populations, immigration, inequality, communities, and social responsibility", fixedTopics: ["Should countries accept more immigrants to address labor shortages?", "Can governments reverse declining birthrates?", "Should older people be encouraged to work longer?", "Has modern society become too individualistic?", "Should governments provide more support for child-rearing?"] },
  { id: "healthcare", label: "医療・福祉", prompt: "public health, medical ethics, healthcare access, welfare systems, and aging", fixedTopics: ["Should healthcare be free for everyone?", "Should governments regulate unhealthy food more strictly?", "Can preventive medicine reduce healthcare costs?", "Should assisted dying be legalized?", "Are welfare systems becoming financially unsustainable?"] },
  { id: "international", label: "国際関係・グローバル化", prompt: "international relations, security, refugees, foreign aid, global institutions, and diplomacy", fixedTopics: ["Should wealthy nations accept more refugees?", "Is the United Nations still effective?", "Should countries prioritize national interests over global cooperation?", "Can economic sanctions prevent international conflict?", "Should developed countries provide more foreign aid?"] },
  { id: "law", label: "犯罪・法律", prompt: "crime, punishment, policing, civil liberties, regulation, and justice", fixedTopics: ["Should governments regulate social media more strictly?", "Is rehabilitation more important than punishment?", "Should the death penalty be abolished worldwide?", "Do surveillance technologies make society safer?", "Should freedom of speech have stronger legal limits?"] },
  { id: "media", label: "メディア・文化", prompt: "news, misinformation, social media, cultural diversity, entertainment, and public opinion", fixedTopics: ["Should social media companies be responsible for misinformation?", "Has the internet weakened traditional journalism?", "Should governments financially support the arts?", "Does popular culture have too much influence on young people?", "Is cultural globalization threatening local traditions?"] },
  { id: "work", label: "働き方・ライフスタイル", prompt: "employment, remote work, work-life balance, labor rights, productivity, and changing lifestyles", fixedTopics: ["Should companies adopt a four-day workweek?", "Will remote work improve society in the long term?", "Should job security be prioritized over labor-market flexibility?", "Has society placed too much importance on career success?", "Should governments guarantee paid parental leave?"] },
];

export function getTrainingTheme(id: unknown) {
  return TRAINING_THEMES.find((theme) => theme.id === id) ?? TRAINING_THEMES[0];
}
