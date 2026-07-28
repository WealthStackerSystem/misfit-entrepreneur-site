'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import Nav from '../components/Nav';
import QuoteCard from '../components/QuoteCard';
import { renderCardPng } from '@/lib/render-card';

type Post = {
  id: string;
  episode_id: string | null;
  platform: string;
  content: string;
  scheduled_for: string | null;
  status: string;
  source: string | null;
  card_quote: string | null;
  image_url: string | null;
};

type EpisodeLite = {
  id: string;
  episode_number: number;
  title: string | null;
  guest_name: string | null;
};

const PLATFORMS = [
  { key: 'x', label: 'X', limit: 280 },
  { key: 'linkedin', label: 'LinkedIn', limit: 3000 },
  { key: 'instagram', label: 'Instagram', limit: 2200 },
];

function fmt(iso: string | null): string {
  if (!iso) return 'Unscheduled';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Unscheduled';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function SocialPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [episodes, setEpisodes] = useState<Record<string, EpisodeLite>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [filter, setFilter] = useState<'upcoming' | 'all' | 'approved' | 'draft'>(
    'upcoming'
  );
  const [platform, setPlatform] = useState('x');
  const [count, setCount] = useState('5');
  const [generating, setGenerating] = useState(false);
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [makingImages, setMakingImages] = useState(false);

  async function load() {
    const supabase = createClient();

    const { data, error: err } = await supabase
      .from('social_posts')
      .select('id, episode_id, platform, content, scheduled_for, status, source, card_quote, image_url')
      .order('scheduled_for', { ascending: true, nullsFirst: false })
      .limit(300);

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const rows = (data as Post[]) ?? [];
    setPosts(rows);

    const ids = Array.from(
      new Set(rows.map((p) => p.episode_id).filter(Boolean))
    ) as string[];

    if (ids.length > 0) {
      const { data: eps } = await supabase
        .from('episodes')
        .select('id, episode_number, title, guest_name')
        .in('id', ids);

      const map: Record<string, EpisodeLite> = {};
      for (const e of (eps as EpisodeLite[]) ?? []) map[e.id] = e;
      setEpisodes(map);

      // Instagram posts written by the Monday job carry a quote but no
      // image yet. Canvas only exists in the browser, so they get rendered
      // and uploaded here, once, the first time the queue is opened.
      const needing = rows.filter(
        (p) =>
          p.platform === 'instagram' &&
          !p.image_url &&
          p.card_quote &&
          p.episode_id &&
          map[p.episode_id]
      );

      if (needing.length > 0) {
        makeMissingImages(needing, map);
      }
    }

    setLoading(false);
  }

  async function makeMissingImages(
    needing: Post[],
    epMap: Record<string, EpisodeLite>
  ) {
    setMakingImages(true);

    for (const p of needing) {
      const ep = p.episode_id ? epMap[p.episode_id] : null;
      if (!ep || !p.card_quote) continue;

      try {
        const png = await renderCardPng({
          quote: p.card_quote,
          attribution: ep.guest_name || 'The Misfit Entrepreneur',
          episodeNumber: ep.episode_number,
          width: 1080,
          height: 1350,
          theme: 'dark',
        });

        const res = await fetch('/api/upload-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'ep-' + ep.episode_number + '-ig-' + p.id.slice(0, 8),
            data: png,
          }),
        });

        const data = await res.json();
        if (!data.ok) continue;

        const supabase = createClient();
        await supabase
          .from('social_posts')
          .update({ image_url: data.url })
          .eq('id', p.id);
      } catch {
        // A failed card should never block the queue from rendering
      }
    }

    setMakingImages(false);
    load();
  }

  useEffect(() => {
    load();
  }, []);

  async function generateEvergreen() {
    setGenerating(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/social-evergreen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: parseInt(count, 10) || 5,
          platform: platform,
        }),
      });

      const raw = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        setError('That took too long. Try a smaller batch.');
        setGenerating(false);
        return;
      }

      if (!data.ok) {
        setError(String(data.error || 'Generation failed'));
        setGenerating(false);
        return;
      }

      setMessage(
        'Queued ' + String(data.count) + ' evergreen posts, one every three days.'
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }

    setGenerating(false);
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

  const now = Date.now();

  const visible = posts.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'approved') return p.status === 'approved';
    if (filter === 'draft') return p.status !== 'approved';
    // upcoming
    if (!p.scheduled_for) return true;
    return new Date(p.scheduled_for).getTime() >= now - 12 * 3600 * 1000;
  });

  const counts = {
    total: posts.length,
    approved: posts.filter((p) => p.status === 'approved').length,
    evergreen: posts.filter((p) => p.source === 'evergreen').length,
  };

  return (
    <div className="shell">
      <Nav />

      <div className="main">
        <div className="eyebrow">Social</div>
        <h1>The Queue</h1>
        <p className="muted" style={{ marginTop: 10, marginBottom: 24 }}>
          Everything scheduled across every episode. Launch week posts are written on
          the episode page. Evergreen posts come from the tagged archive.
        </p>

        {error !== null && <div className="msg msg-error">{error}</div>}
        {message !== null && <div className="msg msg-success">{message}</div>}
        {makingImages && (
          <div className="msg msg-success">
            Building Instagram images. Leave this tab open a moment.
          </div>
        )}

        <div className="card-grid" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="eyebrow">Queued</div>
            <h2>{counts.total}</h2>
          </div>
          <div className="card">
            <div className="eyebrow">Approved</div>
            <h2>{counts.approved}</h2>
          </div>
          <div className="card">
            <div className="eyebrow">Evergreen</div>
            <h2>{counts.evergreen}</h2>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 22 }}>
          <div className="eyebrow">Evergreen</div>
          <h3 style={{ marginBottom: 8 }}>Fill the Gaps</h3>
          <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
            Pulls episodes scoring 4 or 5 that have waited longest, writes a post that
            leads with the idea rather than the episode, and schedules one every three
            days.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ marginBottom: 0, minWidth: 140 }}>
              <label htmlFor="pl">Platform</label>
              <select
                id="pl"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ marginBottom: 0, minWidth: 110 }}>
              <label htmlFor="ct">How many</label>
              <select id="ct" value={count} onChange={(e) => setCount(e.target.value)}>
                <option value="3">3</option>
                <option value="5">5</option>
                <option value="8">8</option>
              </select>
            </div>

            <button className="btn" onClick={generateEvergreen} disabled={generating}>
              {generating ? 'Writing...' : 'Generate Evergreen'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {(['upcoming', 'draft', 'approved', 'all'] as const).map((f) => (
            <button
              key={f}
              className={filter === f ? 'btn' : 'btn btn-ghost'}
              style={{ padding: '7px 16px', fontSize: 11.5 }}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {loading && <p className="muted">Loading...</p>}

        {!loading && visible.length === 0 && (
          <p className="muted">Nothing here yet.</p>
        )}

        {visible.map((p) => {
          const ep = p.episode_id ? episodes[p.episode_id] : null;
          const plat = PLATFORMS.find((x) => x.key === p.platform);
          const over = plat ? p.content.length > plat.limit : false;

          return (
            <div
              key={p.id}
              className="card"
              style={{
                marginBottom: 10,
                borderColor:
                  p.status === 'approved'
                    ? 'rgba(240,180,41,.4)'
                    : 'rgba(255,255,255,.07)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 10,
                  flexWrap: 'wrap',
                }}
              >
                <span className="dim" style={{ fontSize: 11.5 }}>
                  {fmt(p.scheduled_for)} &middot; {plat ? plat.label : p.platform}
                  {p.source === 'evergreen' ? ' \u00b7 evergreen' : ''}
                  {p.status === 'approved' ? ' \u00b7 approved' : ''}
                </span>
                {ep && (
                  <Link
                    href={'/episodes/' + ep.id}
                    style={{ fontSize: 11.5, color: '#8f8f8f' }}
                  >
                    Ep {ep.episode_number}
                  </Link>
                )}
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                {p.image_url && (
                  <img
                    src={p.image_url}
                    alt=""
                    style={{
                      width: 110,
                      height: 'auto',
                      borderRadius: 4,
                      flexShrink: 0,
                      border: '1px solid rgba(255,255,255,.08)',
                    }}
                  />
                )}
                <p
                  style={{
                    fontSize: 14,
                    color: '#d0d0d0',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.65,
                    margin: 0,
                  }}
                >
                  {p.content}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span
                  style={{ fontSize: 11.5, color: over ? '#d97070' : '#5a5a5a' }}
                >
                  {p.content.length}
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '6px 14px', fontSize: 11.5 }}
                  onClick={() => navigator.clipboard.writeText(p.content)}
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
                {ep && (
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '6px 14px', fontSize: 11.5 }}
                    onClick={() => setCardFor(cardFor === p.id ? null : p.id)}
                  >
                    {cardFor === p.id ? 'Hide card' : 'Make card'}
                  </button>
                )}
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

              {cardFor === p.id && ep && (
                <QuoteCard
                  episodeId={ep.id}
                  episodeNumber={ep.episode_number}
                  guestName={ep.guest_name || ''}
                  compact
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
