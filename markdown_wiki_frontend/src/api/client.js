const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Resolve the backend base URL.
 *
 * Priority:
 *  1) REACT_APP_API_BASE_URL (preferred)
 *  2) http://localhost:3001 (local backend default)
 *
 * Notes:
 * - We trim trailing slashes to avoid double-slash joins.
 * - This is intentionally simple (string base URL), leaving proxy setups as an opt-in decision.
 */

// PUBLIC_INTERFACE
export function getApiBaseUrl() {
  const raw = process.env.REACT_APP_API_BASE_URL || "http://localhost:3001";
  return raw.replace(/\/+$/, "");
}

/**
 * Combine a caller-provided AbortSignal with an internal AbortController.
 * If either aborts, the resulting fetch is aborted.
 */
function createChainedAbortController(callerSignal) {
  const controller = new AbortController();

  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else {
      const onAbort = () => controller.abort();
      callerSignal.addEventListener("abort", onAbort, { once: true });
    }
  }

  return controller;
}

/**
 * Fetch wrapper with a timeout and AbortSignal support.
 */

// PUBLIC_INTERFACE
export async function apiFetch(path, { baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...options } = {}) {
  const resolvedBaseUrl = (baseUrl ?? getApiBaseUrl()).replace(/\/+$/, "");
  const url = `${resolvedBaseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  const controller = createChainedAbortController(signal);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
