export type AvatarId =
  | "female"
  | "male"
  | "femalebritish"
  | "malebritish"
  | "femalejapanese"
  | "malejapanese";

type AvatarConfig = {
  label: string;
  closedImage: string;
  openImage: string;
  smallTalkName: string;
};

export const AVATAR_OPTIONS: ReadonlyArray<{ key: AvatarId; label: string }> = [
  { key: "female", label: "米国人女性" },
  { key: "male", label: "米国人男性" },
  { key: "femalebritish", label: "英国人女性" },
  { key: "malebritish", label: "英国人男性" },
  { key: "femalejapanese", label: "日本人女性" },
  { key: "malejapanese", label: "日本人男性" },
];

const AVATARS: Record<AvatarId, AvatarConfig> = {
  female: {
    label: "米国人女性",
    closedImage: "/avatars/female_closed_v.png",
    openImage: "/avatars/female_open_v.png",
    smallTalkName: "Amanda",
  },
  male: {
    label: "米国人男性",
    closedImage: "/avatars/male_closed_v.png",
    openImage: "/avatars/male_open_v.png",
    smallTalkName: "Gabriel",
  },
  femalebritish: {
    label: "英国人女性",
    closedImage: "/avatars/femalebritish_closed_v.png",
    openImage: "/avatars/femalebritish3_open_v.png",
    smallTalkName: "Emily",
  },
  malebritish: {
    label: "英国人男性",
    closedImage: "/avatars/malebritish_closed_v.png",
    openImage: "/avatars/malebritish_open_v.png",
    smallTalkName: "Oliver",
  },
  femalejapanese: {
    label: "日本人女性",
    closedImage: "/avatars/femalejapanese_closed_v.png",
    openImage: "/avatars/femalejapanese_open_v.png",
    smallTalkName: "Sakura",
  },
  malejapanese: {
    label: "日本人男性",
    closedImage: "/avatars/malejapanese_closed_v.png",
    openImage: "/avatars/malejapanese_open_v.png",
    smallTalkName: "Daiki",
  },
};

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === "string" && value in AVATARS;
}

export function getAvatarConfig(id: AvatarId) {
  return AVATARS[id];
}
