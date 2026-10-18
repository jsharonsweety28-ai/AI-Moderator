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
};

export type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  score: number | null;
  category: string | null;
  /** public = posted. blocked = not posted (the reason says why). */
  visibility: "public" | "blocked";
  reason: string | null;
  rewrite_offered: boolean;
  rewrite_accepted: boolean;
  /** The checked suggestion the writer was shown (migration 00004). */
  rewrite_text?: string | null;
};

export type ReviewRow = {
  id: string;
  comment_id: string;
  reviewer_id: string | null;
  decision: "approve" | "uphold" | null;
  created_at: string;
  resolved_at: string | null;
};
