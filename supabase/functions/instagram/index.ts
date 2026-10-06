// @ts-nocheck — Bu dosya Supabase Edge Functions'ın Deno runtime'ında çalışır.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

type Account = { key: string; label: string; instagram_user_id: string; access_token: string };
function accounts(): Account[] {
  try { return JSON.parse(Deno.env.get("INSTAGRAM_ACCOUNTS_JSON") || "[]"); }
  catch { return []; }
}
function graphVersion() { return Deno.env.get("INSTAGRAM_GRAPH_VERSION") || "v21.0"; }
async function graph(path: string, options: RequestInit = {}) {
  const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || `Instagram API HTTP ${response.status}`);
  return data;
}

async function publish(body: { account_key: string; media_url: string; caption?: string }) {
  if (!/^https:\/\//i.test(body.media_url)) throw new Error("Instagram videosu için HTTPS media_url gerekir.");
  const account = accounts().find(item => item.key === body.account_key);
  if (!account) throw new Error("Hedef Instagram hesabı Edge Function secret içinde bulunamadı.");
  const form = new URLSearchParams({ media_type: "REELS", video_url: body.media_url, caption: body.caption || "", access_token: account.access_token });
  const container = await graph(`${account.instagram_user_id}/media`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  let status = "IN_PROGRESS"; let lastStatus = {};
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 4000));
    lastStatus = await graph(`${container.id}?fields=status_code,status`, { method: "GET" });
    status = lastStatus.status_code || lastStatus.status || "IN_PROGRESS";
    if (status === "FINISHED") break;
    if (["ERROR", "EXPIRED"].includes(status)) throw new Error(`Instagram video işleme durumu: ${status}`);
  }
  if (status !== "FINISHED") throw new Error("Instagram videosu zamanında hazır olmadı; daha sonra yeniden deneyin.");
  const published = await graph(`${account.instagram_user_id}/media_publish`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ creation_id: container.id, access_token: account.access_token }) });
  return { instagram_container_id: container.id, instagram_media_id: published.id, account_label: account.label };
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await request.json();
    if (body.action === "accounts") return json({ accounts: accounts().map(({ access_token: _secret, ...safe }) => safe) });
    if (body.action === "publish") {
      const result = await publish(body);
      return json(result);
    }
    return json({ error: "Bilinmeyen action." }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Bilinmeyen Edge Function hatası." }, 400);
  }
});
