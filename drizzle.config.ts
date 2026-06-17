import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/storage/schema.ts",
  out: "./data/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "file:./data/jobetl.db"
  }
});
