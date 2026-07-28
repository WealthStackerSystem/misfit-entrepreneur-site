'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

type Post = {
  id: string;
  platform: string;
  content: string;
  day_offset: number | null;
  scheduled_for: string | null;
  status: string;
};

const PLATFORMS: { key: string; label: string; limit: number }[] = [
  { key: 'x', label: 'X', limit: 280 },
  { key: 'linkedin', label: 'LinkedIn', limit: 3000 },
  { key: 'instagram', label: 'Instagram', limit: 2200 },
];

function dayLabel(offset: number | null): string {
  if (offset === null || offset === 0) return 'Launch day';
  if (offset === 1) return 'Day after';
  return 'Day +' + offset;
}

export default function SocialPosts({ episodeId }: { episodeId: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from('social_posts')
      .select('id, platform, content, day_offset, scheduled_for, status')
      .eq('episode_id', episodeId)
      .order('platform')
      .order('day_offset');

    if (err) setError(err.message);
    else {
      const rows = (data as Post[]) ?? [];
      setPosts(rows);
      const d: Record<string, string> = {};
      for (const p of rows) d[p.id] = p.content;
      setDrafts(d);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [episodeId]);

  async function generate(platform: string) {
    setRunning(platform);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId: episodeId, platform: platform }),
      });

      const raw = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        setError('That took too long. Try again.');
        setRunning(null);
        return;
      }

      if (!data.ok) {
        setError(String(data.error || 'Generation failed'));
        setRunning(null);
        return;
      }

      setMessage('Wrote ' + String(data.count) + ' ' + platform + ' posts.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }

    setRunning(null);
  }

  async function generateAll() {
    for (const p of PLATFORMS) {
      await generate(p.key);
    }
  }

  async function savePost(p: Post) {
    setSavingId(p.id);
    const supabase = createClient();
    const { error: err } = await supabase
      .from('social_posts')
      .update({ content: drafts[p.id] })
      .eq('id', p.id);

    if (err) setError(err.message);
    else load();
    setSavingId(null);
  }

  async function toggleApprove(p: Post) {
    const supabase = createClient();
    const { error: err } = await supabase
      .from('social_posts')
      .update({ status: p.status === 'approved' ? 'draft' : 'approved' })
      .eq('id', p.id);

    if (err) setError(err.message);
    else load();
  }

  async function removePost(p: Post) {
    if (!confirm('Delete this post?')) return;
    const supabase = createClient();
    const { error: err } = await supabase.from('social_posts').delete().eq('id', p.id);
    if (err) setError(err.message);
    else load();
  }

  const busy = running !== null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="eyebrow">Social</div>
      <h3 style={{ marginBottom: 8 }}>Launch Week Posts</h3>
      <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
        Eight posts spread across the week after release. Edit anything, then approve
        the ones you want to go out.
      </p>

      {error !== null && <div className="msg msg-error">{error}</div>}
      {message !== null && <div className="msg msg-success">{message}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <button className="btn" onClick={generateAll} disabled={busy}>
          {busy ? 'Writing ' + running + '...' : 'Generate All'}
        </button>
        {PLATFORMS.map((p) => (
          <button
            key={p.key}
            className="btn btn-ghost"
            onClick={() => generate(p.key)}
            disabled={busy}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Loading...</p>}

      {PLATFORMS.map((plat) => {
        const mine = posts.filter((p) => p.platform === plat.key);
        if (mine.length === 0) return null;

        return (
          <div key={plat.key} style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 2.5,
                textTransform: 'uppercase',
                color: '#F0B429',
                marginBottom: 12,
              }}
            >
              {plat.label}
            </div>

            {mine.map((p) => {
              const text = drafts[p.id] ?? p.content;
              const over = text.length > plat.limit;
              const dirty = text !== p.content;

              return (
                <div
                  key={p.id}
                  style={{
                    background: '#101010',
                    border:
                      '1px solid ' +
                      (p.status === 'approved'
                        ? 'rgba(240,180,41,.4)'
                        : 'rgba(255,255,255,.07)'),
                    borderRadius: 6,
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                      gap: 10,
                    }}
                  >
                    <span className="dim" style={{ fontSize: 11.5 }}>
                      {dayLabel(p.day_offset)}
                      {p.status === 'approved' ? ' \u00b7 approved' : ''}
                    </span>
                    <span
                      style={{
                        fontSize: 11.5,
                        color: over ? '#d97070' : '#6a6a6a',
                      }}
                    >
                      {text.length}
                      {plat.key === 'x' ? ' / ' + plat.limit : ''}
                    </span>
                  </div>

                  <textarea
                    value={text}
                    onChange={(e) =>
                      setDrafts({ ...drafts, [p.id]: e.target.value })
                    }
                    rows={plat.key === 'x' ? 3 : 7}
                    style={{ fontSize: 13.5, marginBottom: 8 }}
                  />

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {dirty && (
                      <button
                        className="btn"
                        style={{ padding: '6px 14px', fontSize: 11.5 }}
                        onClick={() => savePost(p)}
                        disabled={savingId === p.id}
                      >
                        {savingId === p.id ? 'Saving...' : 'Save'}
                      </button>
                    )}
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '6px 14px', fontSize: 11.5 }}
                      onClick={() => navigator.clipboard.writeText(text)}
                    >
                      Copy
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '6px 14px', fontSize: 11.5 }}
                      onClick={() => toggleApprove(p)}
                    >
                      {p.status === 'approved' ? 'Unapprove' : 'Approve'}
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{
                        padding: '6px 14px',
                        fontSize: 11.5,
                        marginLeft: 'auto',
                        borderColor: 'rgba(220,80,80,.3)',
                        color: '#d97070',
                      }}
                      onClick={() => removePost(p)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
