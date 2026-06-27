fetch("https://wealth-craft-one.vercel.app/api/rooms", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "debug-db" }),
  redirect: "manual"
}).then(async r => {
  console.log(r.status, r.url, r.headers.get("location"));
  console.log(await r.text());
}).catch(console.error);
