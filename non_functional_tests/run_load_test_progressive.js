const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const readArg = (name) => {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) {
    return direct.slice(name.length + 1);
  }
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return null;
};

const BASE_URL = readArg("--base-url") || process.env.BASE_URL || "http://127.0.0.1:8000";
const MAX_USERS = Number.parseInt(process.env.MAX_USERS || "50", 10);
const STEP_USERS = Number.parseInt(process.env.STEP_USERS || "1", 10);
const STEP_DURATION_SEC = Number.parseInt(process.env.STEP_DURATION_SEC || "10", 10);
const SCREEN_INTERVAL_MS = Number.parseInt(process.env.SCREEN_INTERVAL_MS || "10000", 10);
const MEDIA_INTERVAL_MS = Number.parseInt(process.env.MEDIA_INTERVAL_MS || "10000", 10);
const START_INDEX = Number.parseInt(process.env.START_INDEX || "0", 10);
const KEYS_COUNT = Number.parseInt(process.env.KEYS_COUNT || "50", 10);

const EVENT_KEYS_FILE =
  process.env.EVENT_KEYS_FILE || path.join(__dirname, "event_keys.json");
const SCREEN_FILE =
  process.env.SCREEN_FILE || path.join(__dirname, "assets", "screen.jpg");
const VIDEO_FILE =
  process.env.VIDEO_FILE || path.join(__dirname, "assets", "video.webm");

if (typeof fetch !== "function") {
  throw new Error("Global fetch is not available. Use Node 18+.");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pickExistingFile = (primaryPath, alternatives) => {
  if (fs.existsSync(primaryPath)) {
    return primaryPath;
  }
  for (const candidate of alternatives) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return primaryPath;
};

const screenPath = pickExistingFile(SCREEN_FILE, [
  path.join(__dirname, "assets", "screen.png"),
]);
const videoPath = pickExistingFile(VIDEO_FILE, [
  path.join(__dirname, "assets", "video.mp4"),
]);

if (!fs.existsSync(screenPath) || !fs.existsSync(videoPath)) {
  console.error(
    "Missing assets. Place files in Aplicacion Monitoreo/load_tests/assets/",
  );
  console.error(`Expected screen file at: ${screenPath}`);
  console.error(`Expected video file at: ${videoPath}`);
  process.exit(1);
}

if (!fs.existsSync(EVENT_KEYS_FILE)) {
  console.error(`Missing event keys file: ${EVENT_KEYS_FILE}`);
  console.error("Run the prepare_load_test_event command first.");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(EVENT_KEYS_FILE, "utf-8"));
const eventKeys = payload.event_keys || [];

const sliceStart = Math.max(0, START_INDEX);
const sliceEnd = KEYS_COUNT > 0 ? sliceStart + KEYS_COUNT : undefined;
const selectedKeys = eventKeys.slice(sliceStart, sliceEnd);

if (selectedKeys.length === 0) {
  console.error(
    `No event keys found for slice START_INDEX=${sliceStart} KEYS_COUNT=${KEYS_COUNT}`,
  );
  process.exit(1);
}

const screenBuffer = fs.readFileSync(screenPath);
const videoBuffer = fs.readFileSync(videoPath);

const metrics = {};
const ensureMetric = (key) => {
  if (!metrics[key]) {
    metrics[key] = { ok: 0, fail: 0, totalMs: 0 };
  }
  return metrics[key];
};

const track = (key, durationMs, ok) => {
  const metric = ensureMetric(key);
  if (ok) {
    metric.ok += 1;
  } else {
    metric.fail += 1;
  }
  metric.totalMs += durationMs;
};

const timed = async (key, fn) => {
  const start = Date.now();
  try {
    const result = await fn();
    track(key, Date.now() - start, true);
    return result;
  } catch (error) {
    track(key, Date.now() - start, false);
    throw error;
  }
};

const authHeaders = (eventKey) => ({
  Authorization: `Bearer ${eventKey}`,
});

const startMonitoring = async (eventKey) => {
  await timed("start_monitoring", async () => {
    const response = await fetch(`${BASE_URL}/proxy/start-monitoring/`, {
      method: "POST",
      headers: authHeaders(eventKey),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`start-monitoring failed: ${response.status} ${text}`);
    }
  });
};

const stopMonitoring = async (eventKey) => {
  await timed("stop_monitoring", async () => {
    const response = await fetch(`${BASE_URL}/proxy/stop-monitoring/`, {
      method: "POST",
      headers: authHeaders(eventKey),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`stop-monitoring failed: ${response.status} ${text}`);
    }
  });
};

const requestPresign = async (eventKey, endpoint, metricKey, payload = {}) => {
  return await timed(metricKey, async () => {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        ...authHeaders(eventKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Presign failed: ${response.status} ${text}`);
    }
    return await response.json();
  });
};

const uploadToS3 = async (uploadUrl, headers, buffer, metricKey) => {
  await timed(metricKey, async () => {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers,
      body: buffer,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`S3 upload failed: ${response.status} ${text}`);
    }
  });
};

const logScreenCapture = async (eventKey, s3Key) => {
  await timed("screen_log", async () => {
    const response = await fetch(`${BASE_URL}/events/api/logging/screen/capture`, {
      method: "POST",
      headers: {
        ...authHeaders(eventKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ s3_key: s3Key, monitor_name: "Screen 1" }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Screen log failed: ${response.status} ${text}`);
    }
  });
};

const logMediaCapture = async (eventKey, s3Key) => {
  await timed("media_log", async () => {
    const response = await fetch(`${BASE_URL}/events/api/logging/media/capture`, {
      method: "POST",
      headers: {
        ...authHeaders(eventKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ s3_key: s3Key }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Media log failed: ${response.status} ${text}`);
    }
  });
};

const uploadScreenBackend = async (eventKey) => {
  await timed("screen_backend", async () => {
    const form = new FormData();
    form.append(
      "screenshot",
      new Blob([screenBuffer], { type: "image/jpeg" }),
      path.basename(screenPath),
    );
    form.append("monitor_name", "Screen 1");
    const response = await fetch(`${BASE_URL}/events/api/logging/screen/capture`, {
      method: "POST",
      headers: authHeaders(eventKey),
      body: form,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Screen upload failed: ${response.status} ${text}`);
    }
  });
};

const uploadMediaBackend = async (eventKey) => {
  await timed("media_backend", async () => {
    const form = new FormData();
    form.append(
      "media",
      new Blob([videoBuffer], { type: "video/webm" }),
      path.basename(videoPath),
    );
    const response = await fetch(`${BASE_URL}/events/api/logging/media/capture`, {
      method: "POST",
      headers: authHeaders(eventKey),
      body: form,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Media upload failed: ${response.status} ${text}`);
    }
  });
};

const uploadScreen = async (eventKey) => {
  try {
    const presign = await requestPresign(
      eventKey,
      "/events/api/logging/screen/presign",
      "screen_presign",
      {},
    );
    if (presign?.upload_url && presign?.headers && presign?.s3_key) {
      try {
        await uploadToS3(
          presign.upload_url,
          presign.headers,
          screenBuffer,
          "screen_s3_upload",
        );
        await logScreenCapture(eventKey, presign.s3_key);
        return;
      } catch (error) {
        console.warn(`[SCREEN] S3 upload failed, using backend: ${error}`);
      }
    }
  } catch (error) {
    console.warn(`[SCREEN] Presign failed, using backend: ${error}`);
  }

  await uploadScreenBackend(eventKey);
};

const uploadMedia = async (eventKey) => {
  try {
    const presign = await requestPresign(
      eventKey,
      "/events/api/logging/media/presign",
      "media_presign",
      { media_type: "video" },
    );
    if (presign?.upload_url && presign?.headers && presign?.s3_key) {
      try {
        await uploadToS3(
          presign.upload_url,
          presign.headers,
          videoBuffer,
          "media_s3_upload",
        );
        await logMediaCapture(eventKey, presign.s3_key);
        return;
      } catch (error) {
        console.warn(`[MEDIA] S3 upload failed, using backend: ${error}`);
      }
    }
  } catch (error) {
    console.warn(`[MEDIA] Presign failed, using backend: ${error}`);
  }

  await uploadMediaBackend(eventKey);
};

const runUser = async (eventKey, durationMs) => {
  const endAt = Date.now() + durationMs;
  let nextScreen = Date.now();
  let nextMedia = Date.now();

  while (Date.now() < endAt) {
    const now = Date.now();
    const tasks = [];
    if (now >= nextScreen) {
      nextScreen += SCREEN_INTERVAL_MS;
      tasks.push(uploadScreen(eventKey));
    }
    if (now >= nextMedia) {
      nextMedia += MEDIA_INTERVAL_MS;
      tasks.push(uploadMedia(eventKey));
    }
    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    } else {
      await sleep(100);
    }
  }
};

const summarizeMetrics = () => {
  const rows = Object.entries(metrics).map(([key, value]) => {
    const total = value.ok + value.fail;
    const avgMs = total > 0 ? Math.round(value.totalMs / total) : 0;
    return {
      key,
      ok: value.ok,
      fail: value.fail,
      avgMs,
    };
  });
  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
};

const main = async () => {
  console.log("[LOAD] Base URL:", BASE_URL);
  console.log("[LOAD] Event keys:", eventKeys.length);
  console.log("[LOAD] Key slice:", selectedKeys.length, `start=${sliceStart}`);
  console.log("[LOAD] Screen file:", screenPath);
  console.log("[LOAD] Video file:", videoPath);
  console.log("[LOAD] Max users:", MAX_USERS);

  const maxUsers = Math.min(MAX_USERS, selectedKeys.length);
  for (let users = 1; users <= maxUsers; users += STEP_USERS) {
    console.log(`\n[LOAD] Step users: ${users}`);
    const stepKeys = selectedKeys.slice(0, users);
    const durationMs = STEP_DURATION_SEC * 1000;

    await Promise.all(stepKeys.map((key) => startMonitoring(key)));

    const tasks = stepKeys.map((key) => runUser(key, durationMs));
    await Promise.all(tasks);

    await Promise.all(stepKeys.map((key) => stopMonitoring(key)));

    const summary = summarizeMetrics();
    console.log("[LOAD] Step summary:");
    summary.forEach((row) => {
      console.log(
        `  ${row.key}: ok=${row.ok} fail=${row.fail} avgMs=${row.avgMs}`,
      );
    });
  }

  console.log("\n[LOAD] Completed");
};

main().catch((error) => {
  console.error("[LOAD] Failed:", error);
  process.exit(1);
});
