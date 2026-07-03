/* ==========================================================
   SHIBA PIMS
   Shared Supabase client (window.db)
   Requires the supabase-js CDN script to be loaded first.
========================================================== */

window.db = window.db || window.supabase.createClient(
  "https://vtqyqzuhifzqzqszhtwq.supabase.co",
  "sb_publishable_NunfAEMxNJA39nzFxtn42g_hsmzxcv8"
);
