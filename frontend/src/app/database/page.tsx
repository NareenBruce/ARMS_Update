"use client";

import { useState, useEffect } from "react";
import { useTheme } from "../layout";

const API_URL = "http://127.0.0.1:8000";

interface Reviewer {
  name: string;
  g_scholar_id: string;
  university: string;
  verified: boolean;
}

interface Stats {
  total: number;
  by_university: Record<string, number>;
  unverified_count: number;
  hidden_count: number;
}

export default function DatabasePage() {
  const { t } = useTheme();
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [uniFilter, setUniFilter] = useState("all");
  const [showHiddenOnly, setShowHiddenOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      const [revRes, statsRes, hiddenRes] = await Promise.all([
        fetch(`${API_URL}/api/reviewers`),
        fetch(`${API_URL}/api/reviewers/stats`),
        fetch(`${API_URL}/api/reviewers/hidden`),
      ]);
      if (revRes.ok) setReviewers(await revRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (hiddenRes.ok) {
        const h = await hiddenRes.json();
        setHidden(new Set<string>(h.hidden_ids));
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleHidden(id: string, isHidden: boolean) {
    const endpoint = isHidden ? "unhide" : "hide";
    try {
      const res = await fetch(`${API_URL}/api/reviewers/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ g_scholar_id: id }),
      });
      if (res.ok) {
        const data = await res.json();
        setHidden(new Set<string>(data.hidden_ids));
        setStats((s) => (s ? { ...s, hidden_count: data.hidden_ids.length } : s));
      }
    } catch (err) {
      console.error("Failed to toggle hidden state", err);
    }
  }

  async function deleteReviewer(id: string, name: string) {
    if (!window.confirm(`Permanently delete "${name}" from the database?\n\nThis removes all their data and embeddings and cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/reviewers/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ g_scholar_id: id }),
      });
      if (res.ok) {
        setReviewers((prev) => prev.filter((r) => r.g_scholar_id !== id));
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        const statsRes = await fetch(`${API_URL}/api/reviewers/stats`);
        if (statsRes.ok) setStats(await statsRes.json());
      }
    } catch (err) {
      console.error("Failed to delete reviewer", err);
    }
  }

  const filtered = reviewers.filter((r) => {
    const matchesSearch = !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.university.toLowerCase().includes(search.toLowerCase());
    const matchesUni = uniFilter === "all" || r.university === uniFilter;
    const matchesHidden = !showHiddenOnly || hidden.has(r.g_scholar_id);
    return matchesSearch && matchesUni && matchesHidden;
  });

  if (loading) {
    return <p className={`${t.mutedText} text-center py-12`}>Loading database...</p>;
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Reviewer Database</h1>
        <p className={t.mutedText}>Browse, search, and manage academic reviewers</p>
      </div>

      {/* Stats Bar */}
      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className={`${t.cardBg} border rounded-xl p-4`}>
              <p className={`${t.mutedText} text-xs`}>Total Reviewers</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <div className={`${t.cardBg} border rounded-xl p-4`}>
              <p className={`${t.mutedText} text-xs`}>Universities</p>
              <p className="text-2xl font-bold">{Object.keys(stats.by_university).length}</p>
            </div>
            <div className={`${t.cardBg} border rounded-xl p-4`}>
              <p className={`${t.mutedText} text-xs`}>Hidden</p>
              <p className="text-2xl font-bold text-violet-500">{stats.hidden_count}</p>
            </div>
          </div>

          <div className={`${t.cardBg} border rounded-xl p-4 mb-6`}>
            <p className={`${t.mutedText} text-xs mb-2`}>By University</p>
            <div className="text-sm">
              {Object.entries(stats.by_university).map(([uni, count]) => (
                <span key={uni} className={`inline-block ${t.statBg} rounded-full px-2 py-0.5 text-xs mr-1 mb-1`}>
                  {uni}: {count}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Search + Filter */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or university..."
          className={`flex-1 min-w-[200px] ${t.inputBg} rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500`} />
        <select value={uniFilter} onChange={(e) => setUniFilter(e.target.value)}
          className={`${t.inputBg} rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500 min-w-[180px]`}>
          <option value="all">All Universities</option>
          {stats && Object.keys(stats.by_university).sort().map((uni) => (
            <option key={uni} value={uni}>{uni} ({stats.by_university[uni]})</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowHiddenOnly((v) => !v)}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            showHiddenOnly
              ? "bg-violet-600/15 text-violet-600"
              : `${t.mutedText} ${t.hoverBg} border ${t.border}`
          }`}
        >
          {showHiddenOnly ? "✓ Hidden only" : "Show hidden only"}
        </button>
      </div>

      {/* Table */}
      <div className={`${t.cardBg} border rounded-2xl overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={`border-b ${t.border} text-left`}>
              <th className={`px-4 py-3 ${t.mutedText} font-medium`}>Name</th>
              <th className={`px-4 py-3 ${t.mutedText} font-medium`}>University</th>
              <th className={`px-4 py-3 ${t.mutedText} font-medium`}>Verified</th>
              <th className={`px-4 py-3 ${t.mutedText} font-medium text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isHidden = hidden.has(r.g_scholar_id);
              return (
                <tr key={r.g_scholar_id} className={`border-b ${t.borderFaint} ${t.hoverBg} ${isHidden ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <a href={`https://scholar.google.com/citations?user=${r.g_scholar_id}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-violet-600 hover:underline font-medium">
                      {r.name}
                    </a>
                    {isHidden && (
                      <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${t.badge.moderate}`}>
                        Hidden
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-3 ${t.subText}`}>{r.university}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.verified ? t.badge.verified : t.badge.unverified}`}>
                      {r.verified ? "Verified" : "Unverified"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => toggleHidden(r.g_scholar_id, isHidden)}
                        title={isHidden ? "Allow this reviewer to be matched again" : "Exclude this reviewer from match results"}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          isHidden
                            ? "bg-violet-600/15 text-violet-600 hover:bg-violet-600/25"
                            : `${t.mutedText} ${t.hoverBg} border ${t.border}`
                        }`}
                      >
                        {isHidden ? "Unhide" : "Hide"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteReviewer(r.g_scholar_id, r.name)}
                        title="Permanently delete this reviewer from the database"
                        className="px-3 py-1 rounded-lg text-xs font-medium text-red-500 border border-red-500/30 hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className={`${t.mutedText} text-center py-8`}>
            {showHiddenOnly ? "No hidden reviewers." : (search || uniFilter !== "all" ? "No reviewers match your filters." : "No reviewers in database.")}
          </p>
        )}
      </div>

      <p className={`${t.mutedText} text-sm mt-4`}>Showing {filtered.length} of {reviewers.length} reviewers</p>
    </div>
  );
}
