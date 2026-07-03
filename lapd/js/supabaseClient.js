import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://vtqyqzuhifzqzqszhtwq.supabase.co";
const SUPABASE_KEY = "sb_publishable_NunfAEMxNJA39nzFxtn42g_hsmzxcv8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

window.supabase = supabase.createClient(
  "https://vtqyqzuhifzqzqszhtwq.supabase.co",
  "sb_publishable_NunfAEMxNJA39nzFxtn42g_hsmzxcv8"
);
