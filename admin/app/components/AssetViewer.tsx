'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

type AssetRow = {
  id: string;
  asset_type: string;
  content: string | null;
  version: number;
  created_at: string | null;
};

const LABELS: Record<string, string> = {
  show_notes_meta: 'Titles, bio, summary',
  show_notes_sections_a: 'Sections 1 to 4',
  show_notes_sections_b: 'Sections 5 to 7',
  show_notes_extras: 'Quote, Misfit 3, takeaways',
  show_notes_html: 'Published page HTML',
  guest_email_parts: 'Guest email copy',
  youtube_description: 'YouTube package',
  newsletter_html: 'Misfit Minute',
  social_x: 'X post',
  social_linkedin: 'LinkedIn post',
  social_instagram: 'Instagram caption',
  blog_post: 'Blog post',
};

function pretty(raw: string): { text: string; isJson: boolean } {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { text: raw, isJson: false };
  }
  try {
    return { text: JSON.stringify(JSON.parse(trimmed), null, 2), isJson: true };
  } catch {
    return { text: raw, isJson: false };
  }
}

function shortDate(s: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AssetViewer({ episodeId }: { episodeId: string }) {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from('episode_assets')
      .select('id, asset_type, content, version, created_at')
      .eq('episode_id', episodeId)
      .eq('is_current', true)
      .order('asset_type');

    if (err) {
      setError(err.message);
    } else {
      setAssets((data as AssetRow[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [episodeId]);

  function toggle(a: AssetRow) {
    setMessage(null);
    setError(null);

    if (openId === a.id) {
      setOpenId(null);
      return;
    }

    setOpenId(a.id);
    setDraft(pretty(a.content || '').text);
  }

  async function saveAsset(a: AssetRow) {
    setSaving(true);
    setError(null);
    setMessage(null);

    // Anything that was JSON must stay JSON, or the builders will break
    const original = pretty(a.content || '');
    if (original.isJson) {
      try {
        JSON.parse(draft);
      } catch (err) {
        setError(
          'Not valid JSON, so this was not saved. ' +
            (err instanceof Error ? err.message : '')
        );
        setSaving(false);
        return;
      }
    }

    const supabase = createClient();
    const { error: upErr } = await supabase
      .from('episode_assets')
      .update({ content: draft })
      .eq('id', a.id);

    if (upErr) {
      setError(upErr.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setMessage('Saved. Rebuild the preview to see the change.');
    load();
  }

  function copyAsset() {
    if (draft) navigator.clipboard.writeText(draft);
  }

  if (loading) {
    return (
      <div className="card">
        <div className="eyebrow">Generated Assets</div>
        <p className="muted">Loading...</p>
      </div>
    );
  }

  if (assets.length === 0) {
    return null;
  }

  return (
    <div className="card">
      <div className="eyebrow">Generated Assets</div>
      <h3 style={{ marginBottom: 8 }}>Everything for This Episode</h3>
      <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
        Click any asset to read or edit it. Edits are saved straight to the
        database, so rebuild the preview or republish afterward.
      </p>

      {message !== null && <div className="msg msg-success">{message}</div>}
      {error !== null && <div className="msg msg-error">{error}</div>}

      {assets.map((a) => {
        const isOpen = openId === a.id;
        const chars = (a.content || '').length;

        return (
          <div
            key={a.id}
            style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}
          >
            <div
              onClick={() => toggle(a)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                padding: '12px 0',
                cursor: 'pointer',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14.5,
                    color: isOpen ? '#F0B429' : '#e0e0e0',
                    fontWeight: 600,
                  }}
                >
                  {LABELS[a.asset_type] || a.asset_type}
                </div>
                <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {a.asset_type} &middot; v{a.version} &middot;{' '}
                  {chars.toLocaleString()} chars
                  {a.created_at ? ' \u00b7 ' + shortDate(a.created_at) : ''}
                </div>
              </div>
              <span style={{ color: '#8f8f8f', fontSize: 18, flexShrink: 0 }}>
                {isOpen ? '\u2212' : '+'}
              </span>
            </div>

            {isOpen && (
              <div style={{ paddingBottom: 18 }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={18}
                  spellCheck={false}
                  style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 12.5,
                    lineHeight: 1.6,
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                    marginTop: 10,
                  }}
                >
                  <button
                    className="btn"
                    onClick={() => saveAsset(a)}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button className="btn btn-ghost" onClick={copyAsset}>
                    Copy
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setDraft(pretty(a.content || '').text)}
                  >
                    Revert
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
