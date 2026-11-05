import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "缺少 Supabase 环境变量：VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    // 国内访问 Supabase 网络不稳定：限制请求超时，避免长时间挂起导致页面卡死。
    // retry 默认开启，会对 GET/HEAD 等幂等请求在网络错误或 503/520 时自动重试。
    timeout: 20000,
    retry: true,
  },
});
