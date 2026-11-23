export const SPORT_CONFIG = {
  badminton: {
    label: "Badminton",
    emoji: "🏸",
    borderColor: "border-l-green-500",
    sessionFields: [
      {
        key: "matchFormat",
        label: "Match format",
        type: "select",
        options: [
          { value: "", label: "Any" },
          { value: "singles", label: "Singles" },
          { value: "doubles", label: "Doubles" },
          { value: "mixed_doubles", label: "Mixed Doubles" },
        ],
      },
      {
        key: "skillLevel",
        label: "Skill level",
        type: "select",
        options: [
          { value: "", label: "All levels" },
          { value: "beginner", label: "Beginner" },
          { value: "intermediate", label: "Intermediate" },
          { value: "advanced", label: "Advanced" },
        ],
      },
      {
        key: "courtCount",
        label: "Courts",
        type: "number",
        min: 1,
        max: 20,
        placeholder: "Number of courts",
      },
    ],
  },
  tennis: {
    label: "Tennis",
    emoji: "🎾",
    borderColor: "border-l-yellow-500",
    sessionFields: [
      {
        key: "matchFormat",
        label: "Match format",
        type: "select",
        options: [
          { value: "", label: "Any" },
          { value: "singles", label: "Singles" },
          { value: "doubles", label: "Doubles" },
          { value: "mixed_doubles", label: "Mixed Doubles" },
        ],
      },
      {
        key: "skillLevel",
        label: "Skill level",
        type: "select",
        options: [
          { value: "", label: "All levels" },
          { value: "beginner", label: "Beginner" },
          { value: "intermediate", label: "Intermediate" },
          { value: "advanced", label: "Advanced" },
        ],
      },
      {
        key: "courtCount",
        label: "Courts",
        type: "number",
        min: 1,
        max: 20,
        placeholder: "Number of courts",
      },
    ],
  },
  basketball: {
    label: "Basketball",
    emoji: "🏀",
    borderColor: "border-l-orange-500",
    sessionFields: [],
  },
  volleyball: {
    label: "Volleyball",
    emoji: "🏐",
    borderColor: "border-l-blue-500",
    sessionFields: [],
  },
  soccer: {
    label: "Soccer",
    emoji: "⚽",
    borderColor: "border-l-emerald-500",
    sessionFields: [],
  },
  other: {
    label: "Other",
    emoji: "🏅",
    borderColor: "border-l-slate-400",
    sessionFields: [],
  },
};

export const SPORT_EMOJI = Object.fromEntries(
  Object.entries(SPORT_CONFIG).map(([k, v]) => [k, v.emoji])
);

export function getSportConfig(sportType) {
  return SPORT_CONFIG[sportType] || SPORT_CONFIG.other;
}

const FORMAT_LABELS = {
  singles: "Singles",
  doubles: "Doubles",
  mixed_doubles: "Mixed",
  any: "Any Format",
};

const LEVEL_LABELS = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  all: "All Levels",
};

export function formatMatchFormat(val) {
  return FORMAT_LABELS[val] || val;
}

export function formatSkillLevel(val) {
  return LEVEL_LABELS[val] || val;
}
