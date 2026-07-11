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
}

export default function DatabasePage() {
  const { t } = useTheme();
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [uniFilter, setUniFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      const [revRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/reviewers`),
        fetch(`${API_URL}/api/reviewers/stats`),
      ]);
      if (revRes.ok) setReviewers(await revRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = reviewers.filter((r) => {
    const matchesSearch = !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.university.toLowerCase().includes(search.toLowerCase());
    const matchesUni = uniFilter === "all" || r.university === uniFilter;
    return matchesSearch && matchesUni;
  });

  if (loading) {
    return <p className={`${t.mutedText} text-center py-12`}>Loading database...</p>;
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Reviewer Database</h1>
        <p className={t.mutedText}>Browse and search verified academic reviewers</p>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className={`${t.cardBg} border rounded-xl p-4`}>
            <p className={`${t.mutedText} text-xs`}>Total Reviewers</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className={`${t.cardBg} border rounded-xl p-4`}>
            <p className={`${t.mutedText} text-xs`}>Universities</p>
            <p className="text-2xl font-bold">{Object.keys(stats.by_university).length}</p>
          </div>
          <div className={`${t.cardBg} border rounded-xl p-4`}>
            <p className={`${t.mutedText} text-xs`}>Unverified</p>
            <p className="text-2xl font-bold text-amber-500">{stats.unverified_count}</p>
          </div>
          <div className={`${t.cardBg} border rounded-xl p-4`}>
            <p className={`${t.mutedText} text-xs`}>By University</p>
            <div className="text-sm mt-1">
              {Object.entries(stats.by_university).map(([uni, count]) => (
                <span key={uni} className={`inline-block ${t.statBg} rounded-full px-2 py-0.5 text-xs mr-1 mb-1`}>
                  {uni}: {count}
                </span>
              ))}
            </div>
          </div>
        </div>
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
      </div>

      {/* Table */}
      <div className={`${t.cardBg} border rounded-2xl overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={`border-b ${t.border} text-left`}>
              <th className={`px-4 py-3 ${t.mutedText} font-medium`}>Name</th>
              <th className={`px-4 py-3 ${t.mutedText} font-medium`}>University</th>
              <th className={`px-4 py-3 ${t.mutedText} font-medium`}>Verified</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.g_scholar_id} className={`border-b ${t.borderFaint} ${t.hoverBg}`}>
                <td className="px-4 py-3">
                  <a href={`https://scholar.google.com/citations?user=${r.g_scholar_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-violet-600 hover:underline font-medium">
                    {r.name}
                  </a>
                </td>
                <td className={`px-4 py-3 ${t.subText}`}>{r.university}</td>

                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.verified ? t.badge.verified : t.badge.unverified}`}>
                    {r.verified ? "Verified" : "Unverified"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className={`${t.mutedText} text-center py-8`}>
            {search || uniFilter !== "all" ? "No reviewers match your filters." : "No reviewers in database."}
          </p>
        )}
      </div>

      <p className={`${t.mutedText} text-sm mt-4`}>Showing {filtered.length} of {reviewers.length} reviewers</p>
    </div>
  );
}
