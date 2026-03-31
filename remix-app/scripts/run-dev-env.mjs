import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const envName = process.argv[2];
const rawArgs = process.argv.slice(3);
const checkOnly = rawArgs.includes("--check");
const forwardedArgs = rawArgs.filter((arg) => arg !== "--check");

const envFilePath = path.join(projectRoot, `.dev.vars.${envName}`);
const fallbackEnvFilePath = path.join(projectRoot, ".dev.vars");
const exampleFilePath = path.join(projectRoot, `.dev.vars.${envName}.example`);

const LOCAL_TEST_REQUIRED_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESET_PIN_SECRET",
  "NEXT_PUBLIC_APP_BASE_URL",
  "NEXT_PUBLIC_LIFF_ID",
  "LINE_LOGIN_CHANNEL_ID",
  "ATTENDANCE_ALLOW_DEV_WITHOUT_LIFF",
  "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB",
  "DATABASE_URL",
];

function fail(message) {
  console.error(`[dev:${envName}] ${message}`);
  process.exit(1);
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((values, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return values;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) return values;

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      values[key] = value;
      return values;
    }, {});
}

if (!envName) {
  fail("Missing environment name. Use `node ./scripts/run-dev-env.mjs <environment>`.");
}

if (envName === "local-test") {
  if (!existsSync(envFilePath)) {
    fail(
      `Missing "${path.basename(envFilePath)}". Copy "${path.basename(exampleFilePath)}" to "${path.basename(envFilePath)}" and point it to a dedicated test database before running this mode.`,
    );
  }

  const envValues = parseEnvFile(envFilePath);
  const fallbackValues = parseEnvFile(fallbackEnvFilePath);
  const missingKeys = LOCAL_TEST_REQUIRED_KEYS.filter((key) => !envValues[key]);

  if (missingKeys.length > 0) {
    fail(
      `"${path.basename(envFilePath)}" must define every required key so local-test never falls back to ".dev.vars". Missing: ${missingKeys.join(", ")}`,
    );
  }

  if (fallbackValues.DATABASE_URL && envValues.DATABASE_URL === fallbackValues.DATABASE_URL) {
    fail(
      `"${path.basename(envFilePath)}" is still using the same DATABASE_URL as ".dev.vars". Point it to a separate test database before running local-test.`,
    );
  }

  if (checkOnly) {
    console.log(`[dev:${envName}] Local test configuration looks good.`);
    process.exit(0);
  }
} else {
  if (!existsSync(envFilePath) && !existsSync(fallbackEnvFilePath)) {
    fail(`No local dev variables found. Create "${path.basename(fallbackEnvFilePath)}" first.`);
  }

  if (checkOnly) {
    console.log(
      `[dev:${envName}] Ready. Wrangler will use "${path.basename(envFilePath)}" when present, otherwise fall back to ".dev.vars".`,
    );
    process.exit(0);
  }
}

console.log(
  `[dev:${envName}] Starting React Router dev with Cloudflare runtime and environment "${envName}".`,
);

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(command, ["react-router", "dev", ...forwardedArgs], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    CLOUDFLARE_DEV_RUNTIME: "1",
    CLOUDFLARE_ENV: envName,
  },
});

child.on("error", (error) => {
  fail(error.message);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
