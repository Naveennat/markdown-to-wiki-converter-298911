const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Resolve the backend base URL.
 * - In dev, CRA proxy can be used (keep empty baseURL).
 * - In production, set REACT_APP_API_BASE_URL to point to backend.
 */
function getApiBaseUrl() {
  return (process.env.REACT_APP_API_BASE_URL || "").replace(/\/+$/, "");
}

/**
 * Attempt common backend endpoints to convert markdown to wiki.
 * The backend OpenAPI we could retrieve is minimal (health-check only), so we use a robust fallback strategy.
 */
const CANDIDATE_ENDPOINTS = [
  // Common patterns
  { path: "/convert", bodyKey: "markdown" },
  { path: "/convert", bodyKey: "text" },
  { path: "/convert/markdown", bodyKey: "markdown" },
  { path: "/convert/markdown", bodyKey: "text" },
  { path: "/api/convert", bodyKey: "markdown" },
  { path: "/api/convert", bodyKey: "text" },
  { path: "/convert-to-wiki", bodyKey: "markdown" },
  { path: "/convert-to-wiki", bodyKey: "text" },
  { path: "/wiki/convert", bodyKey: "markdown" },
  { path: "/wiki/convert", bodyKey: "text" },
];

/**
 * Parse a response payload into a wiki string.
 */
function extractWikiFromJson(json) {
  if (json == null) return "";
  if (typeof json === "string") return json;

  // Common response keys
  const candidates = ["wiki", "output", "result", "content", "text", "data"];
  for (const key of candidates) {
    if (typeof json[key] === "string") return json[key];
  }

  // Sometimes nested: { data: { wiki: "..." } }
  if (typeof json.data === "object" && json.data) {
    for (const key of candidates) {
      if (typeof json.data[key] === "string") return json.data[key];
    }
  }

  // Last resort: stringify
  try {
    return JSON.stringify(json, null, 2);
  } catch {
    return String(json);
  }
}

async function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If a caller already provided a signal, we should abort when either aborts.
  // We cannot "merge" signals directly, so we wire it manually.
  if (options?.signal) {
    const callerSignal = options.signal;
    if (callerSignal.aborted) controller.abort();
    else {
      const onAbort = () => controller.abort();
      callerSignal.addEventListener("abort", onAbort, { once: true });
    }
  }

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

// PUBLIC_INTERFACE
export async function convertMarkdownToWiki(markdown, { signal } = {}) {
  /**
   * Convert markdown to wiki via backend.
   *
   * Because the backend OpenAPI spec available from the running instance only exposes a health check,
   * we attempt a set of commonly used conversion endpoint paths/payload keys.
   *
   * Returns: { wiki: string, endpointUsed: string }
   */
  const baseUrl = getApiBaseUrl();

  let lastError = null;

  for (const candidate of CANDIDATE_ENDPOINTS) {
    const url = `${baseUrl}${candidate.path}`;
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [candidate.bodyKey]: markdown }),
          signal,
        },
        DEFAULT_TIMEOUT_MS
      );

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} from ${candidate.path}`);
        continue;
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        return { wiki: extractWikiFromJson(json), endpointUsed: candidate.path };
      }

      const text = await res.text();
      return { wiki: text, endpointUsed: candidate.path };
    } catch (err) {
      // Abort should stop immediately
      if (err?.name === "AbortError") throw err;
      lastError = err;
      continue;
    }
  }

  const msg =
    lastError?.message ||
    "Unable to reach conversion endpoint. Ensure REACT_APP_API_BASE_URL is set or CRA proxy is configured.";
  throw new Error(msg);
}
