import type { Category, Visibility } from "@/lib/config";

export type UserRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
};

export type PostRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  tension: number;
  /** Optional until migration 00003 has run; absent reads as "open". */
  crit_pref?: "open" | "no_personal" | "no_criticism";
};

export type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  score: number | null;
  category: Category | null;
  visibility: Visibility;
  reason: string | null;
  rewrite_offered: boolean;
  rewrite_accepted: boolean;
  /** The vetted rewrite the author was shown. Optional until migration 00004 has run. */
  rewrite_text?: string | null;
  rewrite_score?: number | null;
  rewrite_category?: Category | null;
};

export type RelationshipRow = {
  a_id: string;
  b_id: string;
  first_seen: string;
  msg_count: number;
  reciprocity: number;
  rough_baseline: number;
  negative_reactions: number;
};

export type ReviewRow = {
  id: string;
  comment_id: string;
  reviewer_id: string | null;
  decision: "approve" | "uphold" | null;
  created_at: string;
  resolved_at: string | null;
};
