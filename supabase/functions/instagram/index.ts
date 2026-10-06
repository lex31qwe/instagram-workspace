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
function graphHost() {
  const configured = Deno.env.get("INSTAGRAM_API_HOST");
  if (configured) return configured.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return accounts().some(item => String(item.access_token || "").startsWith("IG")) ? "graph.instagram.com" : "graph.facebook.com";
}
async function graph(path: string, options: RequestInit = {}, accessToken?: string) {
  const url = new URL(`https://${graphHost()}/${graphVersion()}/${path}`);
  if (accessToken) url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || `Instagram API HTTP ${response.status}`);
  return data;
}

async function sha1(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function deleteCloudinaryVideo(publicId?: string | null) {
  const cloud = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!publicId || !cloud || !apiKey || !apiSecret) return { deleted: false, reason: "Cloudinary silme secretları tanımlı değil." };
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha1(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`);
  const form = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: apiKey, signature });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/video/destroy`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !["ok", "not found"].includes(result.result)) throw new Error(`Cloudinary silme hatası: ${result.result || response.status}`);
  return { deleted: true };
}

async function publish(body: { account_key: string; media_url: string; caption?: string; cloudinary_public_id?: string | null }) {
  if (!/^https:\/\//i.test(body.media_url)) throw new Error("Instagram videosu için HTTPS media_url gerekir.");
  const account = accounts().find(item => item.key === body.account_key);
  if (!account) throw new Error("Hedef Instagram hesabı Edge Function secret içinde bulunamadı.");
  const form = new URLSearchParams({ media_type: "REELS", video_url: body.media_url, caption: body.caption || "", access_token: account.access_token });
  const container = await graph(`${account.instagram_user_id}/media`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  let status = "IN_PROGRESS"; let lastStatus = {};
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 4000));
    lastStatus = await graph(`${container.id}?fields=status_code,status`, { method: "GET" }, account.access_token);
    status = lastStatus.status_code || lastStatus.status || "IN_PROGRESS";
    if (status === "FINISHED") break;
    if (["ERROR", "EXPIRED"].includes(status)) throw new Error(`Instagram video işleme durumu: ${status}`);
  }
  if (status !== "FINISHED") throw new Error("Instagram videosu zamanında hazır olmadı; daha sonra yeniden deneyin.");
  const published = await graph(`${account.instagram_user_id}/media_publish`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ creation_id: container.id, access_token: account.access_token }) });
  // Instagram artık medyayı aldı; geçici Cloudinary kopyasını temizle.
  let cleanup = { deleted: false };
  try { cleanup = await deleteCloudinaryVideo(body.cloudinary_public_id); }
  catch (error) { console.error("Cloudinary cleanup failed", error); }
  return { instagram_container_id: container.id, instagram_media_id: published.id, account_label: account.label, cloudinary_deleted: cleanup.deleted };
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await request.json();
    if (body.action === "accounts") return json({ accounts: accounts().map(({ access_token: _secret, ...safe }) => safe) });
    if (body.action === "delete_media") return json(await deleteCloudinaryVideo(body.cloudinary_public_id));
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
