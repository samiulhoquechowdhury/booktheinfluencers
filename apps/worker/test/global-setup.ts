import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { TEST_DATABASE_URL } from "../vitest.config";

const dbPackage = fileURLToPath(new URL("../../../packages/db/", import.meta.url));

/** Creates the worker's test database if needed, applies migrations and seeds the demo data. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(name)) throw new Error(`Refusing to run tests against "${name}" — the database name must end in _test`);

  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const run = (bin: string, args: string[]) =>
    execFileSync(`${dbPackage}node_modules/.bin/${bin}`, args, { cwd: dbPackage, env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, stdio: "pipe" });
  run("prisma", ["migrate", "deploy"]);
  run("tsx", ["prisma/seed.ts"]);
}
