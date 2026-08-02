import { db } from './lib/db';
import { rooms } from './lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const room = await db.select().from(rooms).where(eq(rooms.id, 'f0d82f87-d86a-4f81-bb88-7f23645570e6'));
  console.log(JSON.stringify(room, null, 2));
  process.exit(0);
}
main();
