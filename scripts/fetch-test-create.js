async function runQuery(query) {
  const r = await fetch("https://wealth-craft-one.vercel.app/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "debug-db", query }),
    redirect: "manual"
  });
  const text = await r.text();
  console.log(`\n--- QUERY: ${query} ---`);
  console.log(`STATUS: ${r.status}`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch(e) {
    console.log(text);
  }
}

async function main() {
  await runQuery(`
    INSERT INTO "rooms" ("code", "mode", "status", "player_ids")
    VALUES ('TEST' || floor(random() * 10000)::text, 'online', 'lobby', '[]'::jsonb)
    RETURNING id, code, game_version;
  `);
}

main().catch(console.error);
