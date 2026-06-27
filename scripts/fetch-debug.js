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
  await runQuery(`ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "game_version" integer DEFAULT 1 NOT NULL;`);
  await runQuery(`SELECT column_name FROM information_schema.columns WHERE table_name='rooms' AND column_name='game_version';`);
  await runQuery(`SELECT id, code, game_version FROM rooms LIMIT 5;`);
}

main().catch(console.error);
