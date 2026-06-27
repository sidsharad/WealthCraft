const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:npg_28HNMycFqiGY@ep-mute-scene-atncdw0h-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
async function run() {
  const res = await sql`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='rooms'`;
  console.log("Columns:", res);
}
run().catch(console.error);
