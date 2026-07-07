import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in yoru environment variables.")
}


export default defineConfig({
  schema: "./src/storage/schema.ts",
  out: "./data/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL
  }
});
