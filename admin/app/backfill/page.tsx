'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Nav from '../components/Nav';

type Stats = {
  total: number;
  tagged: number;
  untagged: number;
  evergreen: number;
};

export default function BackfillPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const stopRef = useRef(false);
  const logRef = useRef<HTMLPreElement | null>(null);

  async function loadStats() {
    const supabase = createClient();

    const [totalRes, untaggedRes, evergreenRes] = await Promise.all([
      supabase.from('episodes').select('*', { count: 'exact', head: true }),
      supabase
        .from('episodes')
        .select('*', { count: 'exact', head: true })
        .is('key_theme', null)
        .not('title', 'is', null),
      supabase
        .from('episodes')
        .select('*', { count: 'exact', head: true })
        .gte('evergreen_score', 4),
    ]);

    const total = totalRes.count ?? 0;
    const untagged = untaggedRes.count ?? 0;

    setStats({
      total: total,
      untagged: untagged,
      tagged: total - untagged,
      evergreen: evergreenRes.count ?? 0,
    });
  }

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  function addLog(line: string) {
    setLog((prev) => prev.concat(line));
  }

  async function runOneBatch(): Promise<{ done: boolean; ok: boolean }> {
    const res = await fetch('/api/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchSize: 25 }),
    });

    const data = await res.json();

    if (!data.ok) {
      setError(data.error || 'Backfill failed');
      addLog('ERROR: ' + (data.error || 'unknown'));
      return { done: true, ok: false };
    }

    if (data.tagged === 0 && data.remaining === 0) {
      addLog('Nothing left to tag.');
      return { done: true, ok: true };
    }

    let line = 'Tagged ' + data.tagged + '. Remaining: ' + data.remaining + '.';
    if (Array.isArray(data.failed) && data.failed.length > 0) {
      line += ' Skipped: ' + data.failed.join(', ');
    }
    addLog(line);

    return { done: data.remaining === 0, ok: true };
  }

  async function runAll() {
    setRunning(true);
    setError(null);
    setLog([]);
    stopRef.current = false;

    addLog('Starting. Batches of 25, roughly 20 seconds each.');

    // Hard ceiling so a bug can never loop forever
    for (let i = 0; i < 40; i++) {
      if (stopRef.current) {
        addLog('Stopped.');
        break;
      }

      let result: { done: boolean; ok: boolean };
      try {
        result = await runOneBatch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Request failed');
        addLog('ERROR: request failed');
        break;
      }

      await loadStats();

      if (result.done) {
        if (result.ok) addLog('Finished.');
        break;
      }
    }

    setRunning(false);
  }

  function stop() {
    stopRef.current = true;
  }

  const pct =
    stats && stats.total > 0 ? Math.round((stats.tagged / stats.total) * 100) : 0;

  return (
    <div className="shell">
      <Nav />

      <div className="main">
        <div className="eyebrow">Backfill</div>
        <h1>Archive Tagging</h1>
        <p className="muted" style={{ marginTop: 10, marginBottom: 24 }}>
          Reads each untagged episode and assigns topics, an evergreen score, a one line
          theme, and the guest name. This is what powers From the Vault in the newsletter,
          evergreen social rotation, and related episode links.
        </p>

        {error !== null && <div className="msg msg-error">{error}</div>}

        {stats !== null && (
          <div className="card-grid" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="eyebrow">Episodes</div>
              <h2>{stats.total}</h2>
            </div>
            <div className="card">
              <div className="eyebrow">Tagged</div>
              <h2>{stats.tagged}</h2>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
                {pct}% complete
              </p>
            </div>
            <div className="card">
              <div className="eyebrow">Evergreen</div>
              <h2>{stats.evergreen}</h2>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
                Scored 4 or 5
              </p>
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="eyebrow">Run</div>
          <h3 style={{ marginBottom: 8 }}>Tag the Archive</h3>
          <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
            Runs continuously until everything is tagged. Roughly 15 batches for a full
            back catalog. Safe to stop and resume, and safe to run again later after new
            episodes are added.
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={runAll} disabled={running}>
              {running ? 'Running...' : 'Start Tagging'}
            </button>
            {running && (
              <button className="btn btn-ghost" onClick={stop}>
                Stop After This Batch
              </button>
            )}
          </div>
        </div>

        {log.length > 0 && (
          <div className="card">
            <div className="eyebrow">Progress</div>
            <pre
              ref={logRef}
              style={{
                background: '#0a0a0a',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 6,
                padding: 16,
                fontSize: 12.5,
                lineHeight: 1.7,
                color: '#b0b0b0',
                maxHeight: 320,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                margin: 0,
              }}
            >
              {log.join('\n')}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
