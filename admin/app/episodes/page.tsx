'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import Nav from '../components/Nav';

type EpisodeRow = {
  id: string;
  episode_number: number;
  title: string | null;
  guest_name: string | null;
  status: string;
  release_date: string | null;
};

function pillClass(status: string): string {
  if (status === 'published') return 'pill pill-published';
  if (status === 'ready' || status === 'scheduled') return 'pill pill-ready';
  if (status === 'error') return 'pill pill-error';
  return 'pill pill-draft';
}

export default function EpisodesPage() {
  const [rows, setRows] = useState<EpisodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('episodes')
        .select('id, episode_number, title, guest_name, status, release_date')
        .order('episode_number', { ascending: false })
        .limit(100);

      if (error) {
        setError(error.message);
      } else {
        setRows((data as EpisodeRow[]) ?? []);
      }
      setLoading(false);
    }

    load();
  }, []);

  return (
    <div className="shell">
      <Nav />

      <div className="main">
        <div className="eyebrow">Episodes</div>
        <h1>Episode Library</h1>

        {error && <div className="msg msg-error" style={{ marginTop: 20 }}>{error}</div>}

        {loading && <p className="muted" style={{ marginTop: 16 }}>Loading…</p>}

        {!loading && rows.length === 0 && (
          <p className="muted" style={{ marginTop: 16 }}>
            No episodes yet. <Link href="/episodes/new">Start one →</Link>
          </p>
        )}

        {rows.length > 0 && (
          <div style={{ marginTop: 24 }}>
            {rows.map((ep) => (
              <Link
                key={ep.id}
                href={`/episodes/${ep.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div
                  className="card"
                  style={{
                    marginBottom: 10,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 2,
                        color: '#F0B429',
                        marginBottom: 4,
                      }}
                    >
                      EP {ep.episode_number}
                    </div>
                    <div style={{ fontSize: 15.5, color: '#e8e8e8', fontWeight: 600 }}>
                      {ep.title || 'Untitled'}
                    </div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                      {ep.guest_name || 'No guest'}
                      {ep.release_date ? ` · ${ep.release_date}` : ''}
                    </div>
                  </div>

                  <span className={pillClass(ep.status)}>{ep.status}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
