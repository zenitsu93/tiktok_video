import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "./index";

await migrate(getDb(), { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
await closeDb();
console.log("migrations applied");
