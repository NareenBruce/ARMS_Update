"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "../layout";

const API_URL = "http://127.0.0.1:8000";

interface MatchResult {
  name: string;
  g_scholar_id: string;
  university: string;
  wtd_score: number;
  wtd_max: number;
  reliability: string;
  recency: string;
  best_paper: string;
  top_3_papers: string[];
}

interface MatchResponse {
  results: MatchResult[];
  justification: string;
}

export default function MatchPage() {
  const { t } = useTheme();
  const [mode, setMode] = useState<"manual" | "pdf" | "batch">("manual");
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [keywords, setKeywords] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchPreview, setBatchPreview] = useState<any[] | null>(null);
  const [startYear, setStartYear] = useState(2020);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MatchResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);

  async function hideFromResults(id: string, name: string) {
    try {
      const res = await fetch(`${API_URL}/api/reviewers/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ g_scholar_id: id }),
      });
      if (!res.ok) throw new Error("Failed to hide reviewer");
      setResults((prev) => {
        if (!prev) return prev;
        const wasTop = prev.results[0]?.g_scholar_id === id;
        return {
          results: prev.results.filter((x) => x.g_scholar_id !== id),
          // The justification describes the old #1 match — drop it if we removed them.
          justification: wasTop ? "" : prev.justification,
        };
      });
      setNotice(`${name} hidden — they won't appear in future matches. Manage this in the Database page.`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  // Publication-year filter options: 2020 (DB floor) → current year.
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(
    { length: Math.max(1, currentYear - 2020 + 1) },
    (_, i) => 2020 + i
  );

  // simple CSV parser that respects double quotes for preview
  function parseCSV(text: string) {
    const lines = text.split(/\r?\n/);
    const result: string[][] = [];
    for (let line of lines) {
      if (!line.trim()) continue;
      const row: string[] = [];
      let insideQuote = false;
      let entry = "";
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
          row.push(entry.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
          entry = "";
        } else {
          entry += char;
        }
      }
      row.push(entry.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      result.push(row);
    }
    return result;
  }

  useEffect(() => {
    if (results && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [results]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    setResults(null);
    setBatchPreview(null);

    try {
      let res: Response;

      if (mode === "manual") {
        if (!title.trim()) { setError("Please enter a title."); return; }
        res = await fetch(`${API_URL}/api/match/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, abstract, keywords, start_year: startYear }),
        });
      } else if (mode === "pdf") {
        if (!pdfFile) { setError("Please upload a PDF."); return; }
        const formData = new FormData();
        formData.append("file", pdfFile);
        formData.append("start_year", String(startYear));
        res = await fetch(`${API_URL}/api/match/pdf`, { method: "POST", body: formData });
      } else {
        if (!batchFile) { setError("Please upload a CSV or JSON file."); return; }
        const formData = new FormData();
        formData.append("file", batchFile);
        formData.append("start_year", String(startYear));
        res = await fetch(`${API_URL}/api/match/batch`, {
          method: "POST",
          body: formData,
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Matching failed");
      }

      if (mode === "batch") {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "reviewer_matches.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        const text = await blob.text();
        const parsedRows = parseCSV(text);

        if (parsedRows.length > 1) {
          const previewData = parsedRows.slice(1).map((row) => {
            const experts = [];
            if (row[1]) experts.push({ name: row[1], bestPaper: row[2] || "", score: parseFloat(row[3]) || 0 });
            if (row[4]) experts.push({ name: row[4], bestPaper: row[5] || "", score: parseFloat(row[6]) || 0 });
            if (row[7]) experts.push({ name: row[7], bestPaper: row[8] || "", score: parseFloat(row[9]) || 0 });
            return {
              title: row[0],
              experts,
            };
          });
          setBatchPreview(previewData);
        }
      } else {
        const data: MatchResponse = await res.json();
        setResults(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function getRecencyBadge(recency: string) {
    switch (recency) {
      case "Active": return t.badge.active;
      case "Mildly Active": return t.badge.mild;
      case "Not Active": return t.badge.inactive;
      default: return t.badge.moderate;
    }
  }

  function getReliabilityBadge(reliability: string) {
    switch (reliability) {
      case "Strong Fit": return t.badge.strong;
      case "Good Fit": return t.badge.good;
      case "Weak Fit": return t.badge.weak;
      default: return t.badge.moderate;
    }
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Find the Perfect Reviewer</h1>
        <p className={t.mutedText}>AI-Powered Semantic Matching for Research Papers</p>
      </div>

      {/* Input Section */}
      <div className={`${t.cardBg} border rounded-2xl p-6 mb-8 max-w-2xl mx-auto`}>
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setMode("manual"); setError(""); setResults(null); setBatchPreview(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "manual" ? "bg-violet-600/15 text-violet-600" : `${t.mutedText} ${t.hoverBg}`
            }`}
          >
            ✏️ Manual Input
          </button>
          <button
            onClick={() => { setMode("pdf"); setError(""); setResults(null); setBatchPreview(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "pdf" ? "bg-violet-600/15 text-violet-600" : `${t.mutedText} ${t.hoverBg}`
            }`}
          >
            📄 Upload PDF
          </button>
          <button
            onClick={() => { setMode("batch"); setError(""); setResults(null); setBatchPreview(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "batch" ? "bg-violet-600/15 text-violet-600" : `${t.mutedText} ${t.hoverBg}`
            }`}
          >
            📁 Batch Match
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === "manual" ? (
            <div className="space-y-4">
              <div>
                <label className={`block text-sm ${t.mutedText} mb-1`}>Title *</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter research title"
                  className={`w-full ${t.inputBg} rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500`} required />
              </div>
              <div>
                <label className={`block text-sm ${t.mutedText} mb-1`}>Abstract</label>
                <textarea value={abstract} onChange={(e) => setAbstract(e.target.value)}
                  placeholder="Paste research abstract..." rows={4}
                  className={`w-full ${t.inputBg} rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500 resize-y`} />
              </div>
              <div>
                <label className={`block text-sm ${t.mutedText} mb-1`}>Keywords</label>
                <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)}
                  placeholder="Comma separated keywords (optional)"
                  className={`w-full ${t.inputBg} rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500`} />
              </div>
            </div>
          ) : mode === "pdf" ? (
            <div className={`border-2 border-dashed ${t.border} rounded-lg p-8 text-center cursor-pointer hover:border-violet-500 transition-colors`}
              onClick={() => document.getElementById("pdf-input")?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) setPdfFile(e.dataTransfer.files[0]); }}>
              <input id="pdf-input" type="file" accept=".pdf" hidden
                onChange={(e) => e.target.files?.[0] && setPdfFile(e.target.files[0])} />
              {pdfFile ? (
                <p className="text-emerald-500 text-sm">{pdfFile.name}</p>
              ) : (
                <>
                  <p className={`${t.mutedText} text-lg mb-1`}>Drag & Drop PDF here</p>
                  <p className={`${t.mutedText} text-sm opacity-60`}>or click to browse</p>
                </>
              )}
            </div>
          ) : (
            <div className={`border-2 border-dashed ${t.border} rounded-lg p-8 text-center cursor-pointer hover:border-violet-500 transition-colors`}
              onClick={() => document.getElementById("batch-input")?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) setBatchFile(e.dataTransfer.files[0]); }}>
              <input id="batch-input" type="file" accept=".csv,.json" hidden
                onChange={(e) => e.target.files?.[0] && setBatchFile(e.target.files[0])} />
              {batchFile ? (
                <p className="text-emerald-500 text-sm">{batchFile.name}</p>
              ) : (
                <>
                  <p className={`${t.mutedText} text-lg mb-1`}>Drag & Drop CSV / JSON here</p>
                  <p className={`${t.mutedText} text-sm opacity-60`}>or click to browse (requires 'Title' column)</p>
                </>
              )}
            </div>
          )}

          {/* Publication-year filter — applies to all modes */}
          <div className="mt-6">
            <label className={`block text-sm ${t.mutedText} mb-1`}>Only consider publications from</label>
            <select
              value={startYear}
              onChange={(e) => setStartYear(parseInt(e.target.value))}
              className={`w-full ${t.inputBg} rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500`}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y === 2020 ? `${y} onwards (all publications)` : `${y} onwards`}
                </option>
              ))}
            </select>
            {startYear > 2020 && (
              <p className={`${t.mutedText} text-xs mt-1 opacity-70`}>
                Reviewers with no publications since {startYear} will be excluded from results.
              </p>
            )}
          </div>

          <button type="submit" disabled={loading}
            className="w-full mt-6 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors">
            {loading ? "Analyzing..." : mode === "batch" ? "Process & Download CSV" : "Find Reviewers"}
          </button>
        </form>

        {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
      </div>

      {/* Results Section */}
      {results && (
        <div ref={resultsRef} className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">Top Matches</h2>

          {notice && (
            <div className="text-sm bg-violet-600/10 text-violet-600 border border-violet-600/20 rounded-lg px-4 py-2.5">
              🙈 {notice}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            {results.results.map((r, i) => (
              <div key={r.g_scholar_id}
                className={`${t.cardBg} border rounded-2xl p-5 ${t.hoverBg} transition-colors`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">
                      <a href={`https://scholar.google.com/citations?user=${r.g_scholar_id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-violet-600 hover:underline">
                        {r.name}
                      </a>
                    </h3>
                    <p className={`${t.mutedText} text-sm`}>{r.university}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-2xl font-bold text-violet-600">
                      {Math.round(r.wtd_score * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => hideFromResults(r.g_scholar_id, r.name)}
                      title="Hide this reviewer from future matches"
                      className={`text-xs ${t.mutedText} hover:text-red-500 transition-colors`}
                    >
                      🙈 Hide
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">

                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getReliabilityBadge(r.reliability)}`}>
                    {r.reliability}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRecencyBadge(r.recency)}`}>
                    {r.recency}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div className={`${t.statBg} rounded-lg p-2`}>
                    <p className={`${t.mutedText} text-xs flex items-center gap-1`}>
                      Matching Score
                      <InfoTip t={t} text="Overall match strength: the recency-weighted average of this reviewer's 3 best-matching papers against your topic. Scale 0–1, where higher means a stronger overall fit." />
                    </p>
                    <p className="font-medium">{r.wtd_score.toFixed(4)}</p>
                  </div>
                  <div className={`${t.statBg} rounded-lg p-2`}>
                    <p className={`${t.mutedText} text-xs flex items-center gap-1`}>
                      Top Paper Score
                      <InfoTip t={t} text="Top matching paper: how closely this reviewer's top matching paper aligns with your topic (recency-weighted). Scale 0–1, where higher means a closer match." />
                    </p>
                    <p className="font-medium">{r.wtd_max.toFixed(4)}</p>
                  </div>
                </div>

                {/* Top-3 Papers with GS search links */}
                <div className="mb-3">
                  <p className={`${t.mutedText} text-xs mb-1.5`}>Top Matching Papers</p>
                  <div className="space-y-1">
                    {r.top_3_papers.map((paper, pi) => (
                      <a key={pi}
                        href={`https://scholar.google.com/scholar?q=${encodeURIComponent(paper)}`}
                        target="_blank" rel="noopener noreferrer"
                        className={`block text-sm ${t.subText} hover:text-violet-600 transition-colors truncate`}
                        title={paper}>
                        <span className="text-violet-500 mr-1">→</span>{paper}
                      </a>
                    ))}
                  </div>
                </div>

                {/* AI Justification — #1 match only */}
                {i === 0 && results.justification && (
                  <div className={`mt-3 pt-3 border-t ${t.border}`}>
                    <p className="text-violet-600 text-xs font-medium mb-1">🤖 AI Analysis</p>
                    <p className={`text-sm ${t.subText}`}>{results.justification}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {results.results.length === 0 && (
            <p className={`text-center ${t.mutedText} py-8`}>No matches found. Try enriching your abstract.</p>
          )}
        </div>
      )}

      {/* Batch Preview Section */}
      {batchPreview && (
        <div className="space-y-4 mt-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold">Batch Analysis Preview</h2>
            <span className="text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/50 rounded-lg px-2.5 py-1">
              ✓ Downloaded CSV successfully
            </span>
          </div>

          <div className={`${t.cardBg} border rounded-2xl overflow-hidden overflow-x-auto`}>
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className={`border-b ${t.border} text-left bg-zinc-800/5 dark:bg-zinc-800/30`}>
                  <th className={`px-4 py-3 ${t.mutedText} font-semibold min-w-[220px]`}>New Paper Title</th>
                  <th className={`px-4 py-3 ${t.mutedText} font-semibold min-w-[200px]`}>Top Recommended Expert 1</th>
                  <th className={`px-4 py-3 ${t.mutedText} font-semibold min-w-[200px]`}>Top Recommended Expert 2</th>
                  <th className={`px-4 py-3 ${t.mutedText} font-semibold min-w-[200px]`}>Top Recommended Expert 3</th>
                </tr>
              </thead>
              <tbody>
                {batchPreview.map((row, idx) => (
                  <tr key={idx} className={`border-b ${t.borderFaint} ${t.hoverBg} transition-colors`}>
                    <td className="px-4 py-3 font-medium truncate max-w-[280px]" title={row.title}>
                      {row.title}
                    </td>
                    {[0, 1, 2].map((eIdx) => {
                      const exp = row.experts[eIdx];
                      return (
                        <td key={eIdx} className="px-4 py-3 whitespace-nowrap">
                          {exp && exp.name ? (
                            <div className="flex flex-col">
                              <span className="font-semibold text-violet-600 dark:text-violet-400">
                                {exp.name}
                              </span>
                              <span className="text-xs opacity-75 truncate max-w-[220px] text-zinc-500" title={exp.bestPaper}>
                                📖 {exp.bestPaper}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-medium">
                                Score: {(exp.score * 100).toFixed(1)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-zinc-500 text-xs">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Small info icon with a themed tooltip. Shows on hover (desktop) and toggles
// on tap (touch), so the metric explanations are reachable everywhere.
function InfoTip({ text, t }: { text: string; t: any }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label="More information"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        className={`${t.mutedText} hover:text-violet-500 cursor-help text-[11px] leading-none`}
      >
        ⓘ
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 z-30 rounded-lg ${t.cardBg} border ${t.border} ${t.subText} text-[11px] font-normal normal-case leading-snug p-2 shadow-xl`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
