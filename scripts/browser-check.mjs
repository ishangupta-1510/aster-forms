import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../", import.meta.url));
let server;
try {
  let available = false;
  try {
    available = (
      await fetch("http://127.0.0.1:4174", {
        signal: AbortSignal.timeout(1000),
      })
    ).ok;
  } catch {}
  if (!available) {
    server = spawn(process.execPath, ["demo/server.js"], {
      cwd,
      stdio: "inherit",
      env: { ...process.env, PORT: "4174" },
    });
    for (let i = 0; i < 40; i++) {
      await setTimeout(250);
      try {
        available = (
          await fetch("http://127.0.0.1:4174", {
            signal: AbortSignal.timeout(1000),
          })
        ).ok;
      } catch {}
      if (available) break;
    }
    if (!available) throw new Error("Demo server did not start");
  }
  const child = spawn(process.execPath, ["test/browser.mjs"], {
    cwd,
    stdio: "inherit",
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  server?.kill();
}
