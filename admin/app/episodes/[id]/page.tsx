'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { buildShowNotesHtml, type ShowNotesData, type Section } from '@/lib/shownotes-template';
import { stripFences } from '@/lib/anthropic';
import Nav from '../../components/Nav';

type Episode = {
  id: string;
  episode_number: number;
  title: string | null;
  guest_name: string | null;
  guest_company: string | null;
  status: string;
  release_date: string | null;
  transcript: string | null;
};

type Asset = {
  asset_type: string;
  content: string | null;
  version: number;
};

const STEPS: { type: string; label: string }[] = [
  { type: 'show_notes_meta', label: 'Titles, bio, and summary' },
  { type: 'show_notes_sections_a', label: 'Sections 1 to 4' },
  { type: 'show_notes_sections_b', label: 'Sections 5 to 7' },
  { type: 'show_notes_extras', label: 'Quote, Misfit 3, takeaways, clips' },
];

export default function EpisodeDetailPage() {
  const params = useParams();
  const id = String(params.id);

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [done, setDone] = useState<string[]>([]);
  const [output, setOutput] = useState('');
  const outputRef = useRef<HTMLPreElement | null>(null);

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [customTitle, setCustomTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleSaved, setTitleSaved] = useState(false);

  async function load() {
    const supabase = createClient();

    const { data: ep, error: epErr } = await supabase
      .from('episodes')
      .select('id, episode_number, title, guest_name, guest_company, status, release_date, transcript')
      .eq('id', id)
      .single();

    if (epErr) {
      setError(epErr.message);
      setLoading(false);
      return;
    }

    setEpisode(ep as Episode);

    const { data: as } = await supabase
      .from('episode_assets')
      .select('asset_type, content, version')
      .eq('episode_id', id)
      .eq('is_current', true);

    const rows = (as as Asset[]) ?? [];
    setAssets(rows);

    // Pull title options out of the meta asset
    const meta = rows.find((r) => r.asset_type === 'show_notes_meta');
    if (meta && meta.content) {
      try {
        const parsed = JSON.parse(stripFences(meta.content));
        if (Array.isArray(parsed.title_options)) {
          setTitleOptions(parsed.title_options as string[]);
        }
      } catch {
        // ignore parse issues here; buildPreview reports them properly
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  async function saveTitle(chosen: string) {
    if (chosen.trim().length === 0) return;

    setSavingTitle(true);
    setTitleSaved(false);
    setError(null);

    const supabase = createClient();
    const { error: upErr } = await supabase
      .from('episodes')
      .update({ title: chosen.trim() })
      .eq('id', id);

    if (upErr) {
      setError(upErr.message);
      setSavingTitle(false);
      return;
    }

    setSavingTitle(false);
    setTitleSaved(true);
    setPreviewHtml(null);
    load();
  }

  async function runOne(assetType: string): Promise<boolean> {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodeId: id, assetType }),
    });

    if (!res.ok) {
      const text = await res.text();
      setError(text || 'Generation failed on ' + assetType);
      return false;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      setError('No response stream');
      return false;
    }

    const decoder = new TextDecoder();
    let acc = '';

    while (true) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      acc += decoder.decode(value, { stream: true });
      setOutput(acc);
    }

    if (acc.indexOf('[GENERATION ERROR]') !== -1) {
      setError('Model returned an error on ' + assetType);
      return false;
    }

    return true;
  }

  async function runAll() {
    setRunning(true);
    setError(null);
    setDone([]);
    setOutput('');
    setPreviewHtml(null);

    for (let i = 0; i < STEPS.length; i++) {
      setStepIndex(i);
      setOutput('');

      let ok = false;
      try {
        ok = await runOne(STEPS[i].type);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        ok = false;
      }

      if (!ok) {
        setRunning(false);
        setStepIndex(-1);
        load();
        return;
      }

      setDone((prev) => prev.concat(STEPS[i].type));
    }

    setRunning(false);
    setStepIndex(-1);
    load();
  }

  async function runSingle(assetType: string) {
    setRunning(true);
    setError(null);
    setOutput('');
    setPreviewHtml(null);
    setStepIndex(STEPS.findIndex((s) => s.type === assetType));

    try {
      await runOne(assetType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }

    setRunning(false);
    setStepIndex(-1);
    load();
  }

  async function buildPreview() {
    setBuilding(true);
    setError(null);

    try {
      const supabase = createClient();

      const { data: rows } = await supabase
        .from('episode_assets')
        .select('asset_type, content')
        .eq('episode_id', id)
        .eq('is_current', true);

      if (!rows || rows.length === 0) {
        setError('No generated assets yet. Run the generator first.');
        setBuilding(false);
        return;
      }

      const merged: ShowNotesData = {};
      let sections: Section[] = [];

      for (const r of rows) {
        if (!r.content) continue;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(stripFences(r.content));
        } catch {
          setError('Could not parse ' + r.asset_type + '. Regenerate that step and try again.');
          setBuilding(false);
          return;
        }

        if (Array.isArray(parsed.sections)) {
          sections = sections.concat(parsed.sections as Section[]);
        }

        Object.keys(parsed).forEach((k) => {
          if (k !== 'sections') {
            (merged as Record<string, unknown>)[k] = parsed[k];
          }
        });
      }

      merged.sections = sections;

      const { data: ep } = await supabase
        .from('episodes')
        .select('episode_number, title, guest_name, guest_company, release_date, libsyn_player_embed, guest_links, transcript')
        .eq('id', id)
        .single();

      if (!ep) {
        setError('Could not load episode data.');
        setBuilding(false);
        return;
      }

      const { data: sp } = await supabase
        .from('sponsors')
        .select('name, tier, shownotes_copy, offer_url, url')
        .eq('active', true);

      const epRecord = ep as Record<string, unknown>;

      const html = buildShowNotesHtml(
        merged,
        {
          episode_number: epRecord.episode_number as number,
          title: (epRecord.title as string) || null,
          guest_name: (epRecord.guest_name as string) || null,
          guest_company: (epRecord.guest_company as string) || null,
          release_date: (epRecord.release_date as string) || null,
          libsyn_player_embed: (epRecord.libsyn_player_embed as string) || null,
          guest_links: (epRecord.guest_links as { website?: string | null; linkedin?: string | null }) || null,
        },
        sp ? (sp as { name: string; tier: string | null; shownotes_copy: string | null; offer_url: string | null; url: string | null }[]) : [],
        (epRecord.transcript as string) || ''
      );

      setPreviewHtml(html);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Build failed');
    }

    setBuilding(false);
  }

  function copyHtml() {
    if (previewHtml) {
      navigator.clipboard.writeText(previewHtml);
    }
  }

  const wordCount = episode?.transcript
    ? episode.transcript.trim().split(/\s+/).length
    : 0;

  function hasAsset(type: string): boolean {
    return assets.some((a) => a.asset_type === type);
  }

  return (
    <div className="shell">
      <Nav />

      <div className="main">
        {loading && <p className="muted">Loading...</p>}
        {error !== null && <div className="msg msg-error">{error}</div>}

        {episode !== null && (
          <>
            <div className="eyebrow">Episode {episode.episode_number}</div>
            <h1>{episode.title || 'Untitled'}</h1>
            <p className="muted" style={{ marginTop: 8, marginBottom: 24 }}>
              {episode.guest_name}
              {episode.guest_company ? ' - ' + episode.guest_company : ''}
              {' | '}
              {wordCount.toLocaleString()} word transcript
              {' | '}
              <span className="pill pill-draft">{episode.status}</span>
            </p>

            <div className="card" style={{ marginBottom: 20 }}>
              <div className="eyebrow">Generate</div>
              <h3 style={{ marginBottom: 8 }}>Show Notes</h3>
              <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>
                Runs in four short passes so no single call times out. About 90 seconds total.
              </p>

              <div style={{ marginBottom: 18 }}>
                {STEPS.map((s, i) => {
                  const isDone = done.indexOf(s.type) !== -1 || hasAsset(s.type);
                  const isActive = stepIndex === i;
                  const color = isActive ? '#F0B429' : isDone ? '#e8e8e8' : '#8f8f8f';
                  const marker = isActive ? '> ' : isDone ? 'OK ' : '- ';

                  return (
                    <div
                      key={s.type}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 0',
                        borderBottom: '1px solid rgba(255,255,255,.05)',
                        fontSize: 14,
                        color: color,
                      }}
                    >
                      <span>{marker}{s.label}</span>
                      {!running && (
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '5px 12px', fontSize: 11.5 }}
                          onClick={() => runSingle(s.type)}
                        >
                          {isDone ? 'Redo' : 'Run'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button className="btn" onClick={runAll} disabled={running || building}>
                {running ? 'Generating...' : 'Generate All Show Notes'}
              </button>
            </div>

            {titleOptions.length > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="eyebrow">Choose Title</div>
                <h3 style={{ marginBottom: 8 }}>Episode Title</h3>
                <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
                  Pick one or write your own. This is what appears on the page, in search results, and in the schema markup.
                </p>

                {titleSaved && <div className="msg msg-success">Title saved.</div>}

                {titleOptions.map((opt, i) => {
                  const isChosen = episode.title === opt;
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 14,
                        padding: '11px 0',
                        borderBottom: '1px solid rgba(255,255,255,.05)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, color: isChosen ? '#F0B429' : '#d8d8d8' }}>
                          {isChosen ? 'SELECTED  ' : ''}{opt}
                        </div>
                        <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>
                          {opt.length} characters
                          {opt.length > 120 ? '  (over 120)' : ''}
                        </div>
                      </div>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '6px 14px', fontSize: 11.5, flexShrink: 0 }}
                        onClick={() => saveTitle(opt)}
                        disabled={savingTitle}
                      >
                        {isChosen ? 'Current' : 'Use'}
                      </button>
                    </div>
                  );
                })}

                <div className="field" style={{ marginTop: 20, marginBottom: 12 }}>
                  <label htmlFor="ct">Or write your own</label>
                  <input
                    id="ct"
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Custom title"
                  />
                  <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>
                    {customTitle.length} characters
                  </div>
                </div>

                <button
                  className="btn"
                  onClick={() => saveTitle(customTitle)}
                  disabled={savingTitle || customTitle.trim().length === 0}
                >
                  {savingTitle ? 'Saving...' : 'Use Custom Title'}
                </button>
              </div>
            )}

            <div className="card" style={{ marginBottom: 20 }}>
              <div className="eyebrow">Assemble</div>
              <h3 style={{ marginBottom: 8 }}>Show Notes Page</h3>
              <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
                Merges the four generated pieces into the finished page.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn" onClick={buildPreview} disabled={building || running}>
                  {building ? 'Building...' : 'Build Preview'}
                </button>
                {previewHtml !== null && (
                  <button className="btn btn-ghost" onClick={copyHtml}>
                    Copy HTML
                  </button>
                )}
              </div>
            </div>

            {previewHtml !== null && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="eyebrow">Preview</div>
                <iframe
                  srcDoc={previewHtml}
                  title="Show notes preview"
                  style={{
                    width: '100%',
                    height: 700,
                    border: '1px solid rgba(255,255,255,.1)',
                    borderRadius: 6,
                    background: '#0e0e0e',
                  }}
                />
              </div>
            )}

            {(output.length > 0 || running) && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="eyebrow">Live Output</div>
                <pre
                  ref={outputRef}
                  style={{
                    background: '#0a0a0a',
                    border: '1px solid rgba(255,255,255,.08)',
                    borderRadius: 6,
                    padding: 16,
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    color: '#b0b0b0',
                    maxHeight: 360,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    margin: 0,
                  }}
                >
                  {output}
                </pre>
              </div>
            )}

            {assets.length > 0 && (
              <div className="card">
                <div className="eyebrow">Saved Assets</div>
                {assets.map((a) => (
                  <div
                    key={a.asset_type}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: '1px solid rgba(255,255,255,.06)',
                      fontSize: 14,
                    }}
                  >
                    <span>{a.asset_type}</span>
                    <span className="dim" style={{ fontSize: 12.5 }}>
                      v{a.version} | {(a.content || '').length.toLocaleString()} chars
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
