import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { convertMarkdownToWiki } from "./api/wikiApi";

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

// PUBLIC_INTERFACE
function App() {
  const [theme, setTheme] = useState("light");

  const [markdown, setMarkdown] = useState("");
  const [wiki, setWiki] = useState("");

  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState("");

  const [copyState, setCopyState] = useState({ status: "idle", message: "" });

  const fileInputRef = useRef(null);
  const abortRef = useRef(null);

  // 300–500ms debounce window as requested
  const debouncedMarkdown = useDebouncedValue(markdown, 400);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  const canConvert = useMemo(() => debouncedMarkdown.trim().length > 0, [debouncedMarkdown]);

  // Debounced live conversion
  useEffect(() => {
    setError("");

    // Clear preview when input is empty
    if (!canConvert) {
      setWiki("");
      setIsConverting(false);
      if (abortRef.current) abortRef.current.abort();
      return;
    }

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let active = true;
    setIsConverting(true);

    (async () => {
      try {
        const { wiki: result } = await convertMarkdownToWiki(debouncedMarkdown, {
          signal: controller.signal,
        });
        if (!active) return;
        setWiki(result ?? "");
      } catch (e) {
        if (!active) return;
        if (e?.name === "AbortError") return;
        setError(e?.message || "Conversion failed. Please try again.");
        setWiki("");
      } finally {
        if (!active) return;
        setIsConverting(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedMarkdown, canConvert]);

  async function handlePickFile() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".md") && file.type !== "text/markdown") {
      setError("Please select a Markdown (.md) file.");
      e.target.value = "";
      return;
    }

    try {
      const text = await file.text();
      setMarkdown(text);
      setError("");
    } catch {
      setError("Unable to read the selected file.");
    } finally {
      // allow re-upload of same file
      e.target.value = "";
    }
  }

  function handleClear() {
    setMarkdown("");
    setWiki("");
    setError("");
    setCopyState({ status: "idle", message: "" });
    if (abortRef.current) abortRef.current.abort();
  }

  async function handleCopy() {
    if (!wiki) return;
    try {
      await navigator.clipboard.writeText(wiki);
      setCopyState({ status: "success", message: "Copied to clipboard." });
      setTimeout(() => setCopyState({ status: "idle", message: "" }), 1500);
    } catch {
      setCopyState({ status: "error", message: "Copy failed. Your browser may block clipboard access." });
      setTimeout(() => setCopyState({ status: "idle", message: "" }), 2500);
    }
  }

  function handleDownload() {
    const content = wiki || "";
    downloadTextFile("converted.wiki", content);
  }

  return (
    <div className="App">
      <div className="appShell">
        <header className="topbar">
          <div className="brand">
            <div className="brandMark" aria-hidden="true" />
            <div className="brandText">
              <div className="brandTitle">Markdown → Wiki Converter</div>
              <div className="brandSubtitle">Paste or upload Markdown and get live wiki output.</div>
            </div>
          </div>

          <button
            className="btn btn-secondary"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            type="button"
          >
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
        </header>

        <main className="mainGrid" aria-label="Converter workspace">
          <section className="panel" aria-label="Markdown input">
            <div className="panelHeader">
              <div>
                <h2 className="panelTitle">Markdown</h2>
                <p className="panelHint">Type or upload a .md file. Conversion runs automatically.</p>
              </div>

              <div className="panelActions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,text/markdown"
                  onChange={handleFileSelected}
                  style={{ display: "none" }}
                />
                <button className="btn" type="button" onClick={handlePickFile}>
                  Upload .md
                </button>
                <button className="btn btn-ghost" type="button" onClick={handleClear} disabled={!markdown && !wiki && !error}>
                  Clear
                </button>
              </div>
            </div>

            <textarea
              className="editor"
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              placeholder={"# Paste Markdown here...\n\n- Supports headings, lists, code blocks, links, etc.\n"}
              aria-label="Markdown input"
              spellCheck="false"
            />

            <div className="statusRow" role="status" aria-live="polite">
              {isConverting ? (
                <div className="statusPill">
                  <span className="spinner" aria-hidden="true" />
                  <span>Converting…</span>
                </div>
              ) : (
                <div className="statusPill statusPill-muted">
                  <span className="dot" aria-hidden="true" />
                  <span>{markdown.trim() ? "Up to date" : "Waiting for input"}</span>
                </div>
              )}

              {error ? <div className="statusError">{error}</div> : <div className="statusSpacer" />}
            </div>
          </section>

          <section className="panel" aria-label="Wiki output preview">
            <div className="panelHeader">
              <div>
                <h2 className="panelTitle">Wiki Output</h2>
                <p className="panelHint">Preview updates live. Copy or download when ready.</p>
              </div>

              <div className="panelActions">
                <button className="btn" type="button" onClick={handleCopy} disabled={!wiki || isConverting}>
                  Copy
                </button>
                <button className="btn btn-secondary" type="button" onClick={handleDownload} disabled={!wiki || isConverting}>
                  Download .wiki
                </button>
              </div>
            </div>

            <div className="preview" aria-label="Wiki preview">
              {!wiki && !error && !isConverting ? (
                <div className="emptyState">
                  <div className="emptyTitle">No output yet</div>
                  <div className="emptyHint">Enter Markdown on the left to see converted wiki format here.</div>
                </div>
              ) : (
                <pre className="previewPre">{wiki}</pre>
              )}
            </div>

            <div className="statusRow" role="status" aria-live="polite">
              {copyState.status !== "idle" ? (
                <div className={`toast ${copyState.status === "success" ? "toast-success" : "toast-error"}`}>
                  {copyState.message}
                </div>
              ) : (
                <div className="statusSpacer" />
              )}
              <div className="statusMeta">{wiki ? `${wiki.length.toLocaleString()} chars` : ""}</div>
            </div>
          </section>
        </main>

        <footer className="footer">
          <div className="footerNote">
            Backend URL:{" "}
            <code className="inlineCode">{process.env.REACT_APP_API_BASE_URL ? "REACT_APP_API_BASE_URL" : "(using same-origin / proxy)"}</code>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
