import type { Audience } from "@/types/insight";

export interface Comment {
  id: string;
  company_id: string;
  period: string;
  audience: Audience;
  user_id: string | null;
  author_name: string;
  author_avatar_url: string | null;
  content: string;
  edited: boolean;
  created_at: string;
  updated_at: string;
}
