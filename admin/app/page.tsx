'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Nav from './components/Nav';

type Counts = {
  episodes: number;
  articles: number;
  sponsors: number;
};

export default function DashboardPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [ep, ar, sp] = await Promise.all([
        supabase.from('episodes').select('*', { count: 'exact', head: true }),
        supabase.from('articles').select('*', { count: 'exact', head: true }),
        supabase.from('sponsors').select('*', { count: 'exact', head: true }),
      ]);

      if (ep.error || ar.error || sp.error) {
        setError(
          ep.error?.message || ar.error?.message || sp.error?.message || 'Unknown error'
        );
        return;
      }

      setCounts({
        episodes: ep.count ?? 0,
        articles: ar.count ?? 0,
        sponsors: sp.count ?? 0,
      });
    }

    load();
  }, []);

  return (
    <div className="shell">
      <Nav />

      <div className="main">
        <div className="eyebrow">Dashboard</div>
        <h1>Misfit Production System</h1>

        {error && <div className="msg msg-error" style={{ marginTop: 20 }}>{error}</div>}

        {!counts && !error && (
          <p className="muted" style={{ marginTop: 16 }}>Loading…</p>
        )}

        {counts && (
          <>
            <p className="muted" style={{ marginTop: 12, marginBottom: 28 }}>
              Connected to Supabase. Live counts below.
            </p>

            <div className="card-grid">
              <div className="card">
                <div className="eyebrow">Episodes</div>
                <h2>{counts.episodes}</h2>
                <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
                  Back catalog not yet imported
                </p>
              </div>

              <div className="card">
                <div className="eyebrow">Blog Posts</div>
                <h2>{counts.articles}</h2>
                <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
                  37 existing posts to import
                </p>
              </div>

              <div className="card">
                <div className="eyebrow">Sponsors</div>
                <h2>{counts.sponsors}</h2>
                <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
                  <a href="/sponsors">Manage sponsors →</a>
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
