"use client";

import { useState } from "react";
import { useTheme } from "../layout";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface ScrapeResult {
  status: string;
  name?: string;
  reason?: string;
  g_scholar_id?: string;
  university?: string;
  email?: string;
  publications_count?: number;
}

interface BatchResult {
  verified: number;
  unverified: number;
  inactive: number;
  failed: number;
  details: {
    verified: { name: string; g_scholar_id: string }[];
    unverified: { name: string; reason: string }[];
    inactive: { name: string; reason: string }[];
    failed: { name: string; reason: string }[];
    invalid_ids: number;
  };
}

export default function AddPage() {
  const { t } = useTheme();
  const [mode, setMode] = useState<"single" | "batch">("single");

  const [name, setName] = useState("");
  const [scholarId, setScholarId] = useState("");
  const [university, setUniversity] = useState("");

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [batchUniversity, setBatchUniversity] = useState("");

  const [loading, setLoading] = useState(false);
  const [singleResult, setSingleResult] = useState<ScrapeResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState("");

  async function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(""); setSingleResult(null);
    try {
      const res = await fetch(`${API_URL}/api/scrape/single`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, g_scholar_id: scholarId, university }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Scraping failed");
      setSingleResult(data);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleBatchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(""); setBatchResult(null);
    try {
      if (!csvFile) { setError("Please upload a CSV/Excel file."); return; }
      const formData = new FormData();
      formData.append("file", csvFile);
      formData.append("university", batchUniversity);
      const res = await fetch(`${API_URL}/api/scrape/batch`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Batch scraping failed");
      setBatchResult(data);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  function getResultBadge(status: string) {
    switch (status) {
      case "verified": return t.badge.verified;
      case "unverified": return t.badge.mild;
      case "inactive": return t.badge.inactive;
      default: return t.badge.unverified;
    }
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Add Reviewers</h1>
        <p className={t.mutedText}>Scrape Google Scholar profiles and add to the database</p>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setMode("single"); setError(""); setSingleResult(null); setBatchResult(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "single" ? "bg-violet-600/15 text-violet-600" : `${t.mutedText} ${t.hoverBg}`
            }`}>
            👤 Single Reviewer
          </button>
          <button
            onClick={() => { setMode("batch"); setError(""); setSingleResult(null); setBatchResult(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "batch" ? "bg-violet-600/15 text-violet-600" : `${t.mutedText} ${t.hoverBg}`
            }`}>
            📁 Batch Upload
          </button>
        </div>

        {mode === "single" && (
          <div className={`${t.cardBg} border rounded-2xl p-6`}>
            <form onSubmit={handleSingleSubmit} className="space-y-4">
              <div>
                <label className={`block text-sm ${t.mutedText} mb-1`}>Reviewer Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dr. John Smith"
                  className={`w-full ${t.inputBg} rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500`} required />
              </div>
              <div>
                <label className={`block text-sm ${t.mutedText} mb-1`}>Google Scholar ID *</label>
                <input type="text" value={scholarId} onChange={(e) => setScholarId(e.target.value)}
                  placeholder="e.g. LFEfTUcAAAAJ"
                  className={`w-full ${t.inputBg} rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500`} required />
              </div>
              <div>
                <label className={`block text-sm ${t.mutedText} mb-1`}>University *</label>
                <input type="text" value={university} onChange={(e) => setUniversity(e.target.value)}
                  placeholder="e.g. Multimedia University"
                  className={`w-full ${t.inputBg} rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500`} required />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors">
                {loading ? "Scraping..." : "Add Reviewer"}
              </button>
            </form>
          </div>
        )}

        {mode === "batch" && (
          <div className={`${t.cardBg} border rounded-2xl p-6`}>
            <form onSubmit={handleBatchSubmit} className="space-y-4">
              <div>
                <label className={`block text-sm ${t.mutedText} mb-1`}>University *</label>
                <input type="text" value={batchUniversity} onChange={(e) => setBatchUniversity(e.target.value)}
                  placeholder="e.g. Multimedia University"
                  className={`w-full ${t.inputBg} rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500`} required />
              </div>
              <div>
                <label className={`block text-sm ${t.mutedText} mb-1`}>Upload CSV/Excel *</label>
                <div className={`border-2 border-dashed ${t.border} rounded-lg p-6 text-center cursor-pointer hover:border-violet-500 transition-colors`}
                  onClick={() => document.getElementById("csv-input")?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) setCsvFile(e.dataTransfer.files[0]); }}>
                  <input id="csv-input" type="file" accept=".csv,.xlsx,.xls" hidden
                    onChange={(e) => e.target.files?.[0] && setCsvFile(e.target.files[0])} />
                  {csvFile ? (
                    <p className="text-emerald-500 text-sm">{csvFile.name}</p>
                  ) : (
                    <>
                      <p className={`${t.mutedText} mb-1`}>Drag & Drop CSV/Excel file</p>
                      <p className={`${t.mutedText} text-xs opacity-60`}>Required columns: Name, Scholar ID</p>
                    </>
                  )}
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors">
                {loading ? "Scraping..." : "Upload & Scrape"}
              </button>
            </form>
          </div>
        )}

        {error && <p className="text-red-500 text-sm mt-4">{error}</p>}

        {/* Scraping Complete Banner */}
        {!loading && (singleResult || batchResult) && (
          <div className="mt-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-center gap-3">
            <span className="text-emerald-600 dark:text-emerald-400 text-xl">&#10003;</span>
            <div>
              <p className="text-emerald-800 dark:text-emerald-300 font-medium text-sm">Scraping Complete</p>
              <p className="text-emerald-600 dark:text-emerald-400 text-xs">
                {singleResult
                  ? singleResult.status === "verified"
                    ? `${singleResult.name} verified and added successfully`
                    : `${singleResult.name}: ${singleResult.reason}`
                  : `${batchResult!.verified} verified, ${batchResult!.unverified} unverified, ${batchResult!.inactive} inactive, ${batchResult!.failed} failed`
                }
              </p>
            </div>
          </div>
        )}

        {/* Single Result */}
        {singleResult && (
          <div className={`mt-6 ${t.cardBg} border rounded-2xl p-6`}>
            <h3 className="font-semibold text-lg mb-3">Result</h3>
            {singleResult.status === "verified" ? (
              <div className="space-y-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.badge.verified}`}>Verified & Added</span>
                <p><span className={t.mutedText}>Name:</span> {singleResult.name}</p>
                <p><span className={t.mutedText}>University:</span> {singleResult.university}</p>
                <p><span className={t.mutedText}>Email:</span> {singleResult.email}</p>
                <p><span className={t.mutedText}>Papers:</span> {singleResult.publications_count}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getResultBadge(singleResult.status)}`}>
                  {singleResult.status === "unverified" ? "Unverified" : singleResult.status === "inactive" ? "Inactive" : "Failed"}
                </span>
                <p className={t.subText}>{singleResult.reason}</p>
              </div>
            )}
          </div>
        )}

        {/* Batch Result */}
        {batchResult && (
          <div className={`mt-6 ${t.cardBg} border rounded-2xl p-6`}>
            <h3 className="font-semibold text-lg mb-3">Pipeline Report</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {([
                { label: "Verified", value: batchResult.verified, style: t.resultCard.verified },
                { label: "Unverified", value: batchResult.unverified, style: t.resultCard.unverified },
                { label: "Inactive", value: batchResult.inactive, style: t.resultCard.inactive },
                { label: "Failed", value: batchResult.failed, style: t.resultCard.failed },
              ]).map((item) => (
                <div key={item.label} className={`${item.style} rounded-lg p-3 text-center`}>
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-xs opacity-70">{item.label}</p>
                </div>
              ))}
            </div>

            {/* Details Breakdown */}
            <div className="mt-6 space-y-5 border-t pt-5 border-zinc-800/50">
              {batchResult.details.verified && batchResult.details.verified.length > 0 && (
                <div>
                  <p className={`${t.mutedText} text-xs font-semibold uppercase tracking-wider mb-2`}>✅ Verified & Added ({batchResult.details.verified.length}):</p>
                  <div className="flex flex-wrap gap-2">
                    {batchResult.details.verified.map((v, i) => (
                      <a key={i} href={`https://scholar.google.com/citations?user=${v.g_scholar_id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/50 rounded-lg px-2.5 py-1 hover:underline hover:border-emerald-500/50 transition-colors">
                        👤 {v.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {batchResult.details.inactive && batchResult.details.inactive.length > 0 && (
                <div>
                  <p className={`${t.mutedText} text-xs font-semibold uppercase tracking-wider mb-1.5`}>💤 Inactive (No publications since 2020) ({batchResult.details.inactive.length}):</p>
                  <div className="space-y-1">
                    {batchResult.details.inactive.map((u, i) => (
                      <p key={i} className="text-sm text-amber-600 dark:text-amber-500/80">- {u.name}: {u.reason}</p>
                    ))}
                  </div>
                </div>
              )}

              {batchResult.details.unverified && batchResult.details.unverified.length > 0 && (
                <div>
                  <p className={`${t.mutedText} text-xs font-semibold uppercase tracking-wider mb-1.5`}>⚠️ Unverified (No edu.my email signature) ({batchResult.details.unverified.length}):</p>
                  <div className="space-y-1">
                    {batchResult.details.unverified.map((u, i) => (
                      <p key={i} className="text-sm text-orange-600 dark:text-orange-500/80">- {u.name}: {u.reason}</p>
                    ))}
                  </div>
                </div>
              )}

              {batchResult.details.failed && batchResult.details.failed.length > 0 && (
                <div>
                  <p className={`${t.mutedText} text-xs font-semibold uppercase tracking-wider mb-1.5`}>❌ Failed (404 / Blocked / Error) ({batchResult.details.failed.length}):</p>
                  <div className="space-y-1">
                    {batchResult.details.failed.map((f, i) => (
                      <p key={i} className="text-sm text-red-600 dark:text-red-400/80">- {f.name}: {f.reason}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
