export const SUPPORT_ISSUE_TYPES = [
  "General Support & Questions",
  "Account & Login Help",
  "Sign-up & Registration",
  "Profile & Settings Updates",
  "Billing & Payments",
  "Report a Bug / Technical Issue",
  "Feed & Personalization Setup",
  "API Credits & Limits",
  "Search Functionality Help",
  "AI Summaries & Suggestions",
  "Saved Notes Help",
  "Live News & Video Playback",
  "Shorts & Video Reels",
  "Privacy & Data Requests",
] as const;

export type SupportIssueType = (typeof SUPPORT_ISSUE_TYPES)[number];

export function isKnownSupportIssueType(value: string) {
  return SUPPORT_ISSUE_TYPES.includes(value as SupportIssueType);
}
