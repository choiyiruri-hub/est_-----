(function () {
  "use strict";

  const SUPABASE_URL = "https://vdpuxvsdjukycuytxpnx.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_rjuCAY2qc7HUfAqW5z2wRw_hWgqtvfS";

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase 클라이언트 라이브러리를 불러오지 못했습니다.");
    return;
  }

  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    }
  );
})();
