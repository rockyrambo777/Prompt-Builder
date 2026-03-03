import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://ppfzhgeesaweubbwwlle.supabase.co";
export const SUPABASE_KEY = "sb_publishable_8NqpLKwhNvH41TjZdHygYg_iB6u1PjB";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);



export async function requireSessionOrRedirect() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) window.location.href = "./index.html";
  return session;
}

export async function redirectIfLoggedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.href = "./home.html";
  return session;
}


export async function logout() {
  await supabase.auth.signOut();
}
