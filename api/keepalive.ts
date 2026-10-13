// Vercel cron: one cheap RPC call a day keeps the free-tier corpus warm.
export default async function handler(_req: Request) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return new Response("missing env", { status: 500 });
  const res = await fetch(`${url}/rest/v1/rpc/match_artworks`, {
    method: "POST",
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Content-Profile": "mellizo",
    },
    body: JSON.stringify({ query_embedding: `[${"0,".repeat(511)}0]`, match_count: 1 }),
  });
  return new Response(`ok:${res.status}`, { status: 200 });
}
