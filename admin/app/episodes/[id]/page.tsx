'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { buildShowNotesHtml, type ShowNotesData, type Section } from '@/lib/shownotes-template';
import { buildGuestEmailHtml, type GuestEmailParts } from '@/lib/guest-email-template';
import {
  buildYouTubeDescription,
  buildChapterLines,
  chapterWarning,
  type YouTubeParts,
} from '@/lib/youtube-template';
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

type Sponsor = {
  id: string;
  name: string;
  tier: string | null;
  slot: string | null;
};

type Pick = {
  sponsor_id: string;
  slot: string;
};

const SLOTS: { key: string; label: string; note: string }[] = [
  { key: 'preroll', label: 'Pre-roll', note: 'Shown as Presented By' },
  { key: 'midroll', label: 'Mid-roll', note: 'Shown as Also Supported By' },
  { key: 'misfit3', label: 'Misfit 3 naming rights', note: 'Line inside the Misfit 3 section' },
  { key: 'newsletter', label: 'Newsletter', note: 'The Minute only, not the page' },
];

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

  const [emailHtml, setEmailHtml] = useState<string | null>(null);
  const [buildingEmail, setBuildingEmail] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [savingSponsors, setSavingSponsors] = useState(false);
  const [sponsorsSaved, setSponsorsSaved] = useState(false);

  const [ytText, setYtText] = useState<string | null>(null);
  const [ytNote, setYtNote] = useState<string | null>(null);
  const [ytThumb, setYtThumb] = useState<string | null>(null);
  const [buildingYt, setBuildingYt] = useState(false);

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

    const { data: allSponsors } = await supabase
      .from('sponsors')
      .select('id, name, tier, slot')
      .eq('active', true)
      .order('name');

    setSponsors((allSponsors as Sponsor[]) ?? []);

    const { data: epSponsors } = await supabase
      .from('episode_sponsors')
      .select('sponsor_id, slot')
      .eq('episode_id', id);

    setPicks((epSponsors as Pick[]) ?? []);

    const meta = rows.find((r) => r.asset_type === 'show_notes_meta');
    if (meta && meta.content) {
      try {
        const parsed = JSON.parse(stripFences(meta.content));
        if (Array.isArray(parsed.title_options)) {
          setTitleOptions(parsed.title_options as string[]);
        }
      } catch {
        // buildPreview surfaces parse problems properly
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
    setEmailHtml(null);
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
    setStepIndex(STEPS.findIndex((s) => s.type === assetType));

    if (assetType === 'guest_email_parts') {
      setEmailHtml(null);
    } else if (assetType === 'youtube_description') {
      setYtText(null);
    } else {
      setPreviewHtml(null);
    }

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
        if (r.asset_type.indexOf('show_notes_') !== 0) continue;
        // show_notes_html is the assembled page saved at publish time,
        // not JSON, so it must never reach the merge.
        if (r.asset_type === 'show_notes_html') continue;

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

      // Mirror the publish route: episode picks first, all active as fallback
      let previewSponsors: {
        name: string;
        tier: string | null;
        slot: string | null;
        shownotes_copy: string | null;
        offer_url: string | null;
        url: string | null;
      }[] = [];

      const { data: pickedRows } = await supabase
        .from('episode_sponsors')
        .select('slot, position, sponsors(name, tier, shownotes_copy, offer_url, url)')
        .eq('episode_id', id)
        .order('position');

      if (pickedRows && pickedRows.length > 0) {
        for (const row of pickedRows as unknown as {
          slot: string | null;
          sponsors: {
            name: string;
            tier: string | null;
            shownotes_copy: string | null;
            offer_url: string | null;
            url: string | null;
          } | null;
        }[]) {
          if (!row.sponsors) continue;
          previewSponsors.push({
            name: row.sponsors.name,
            tier: row.sponsors.tier,
            slot: row.slot,
            shownotes_copy: row.sponsors.shownotes_copy,
            offer_url: row.sponsors.offer_url,
            url: row.sponsors.url,
          });
        }
      }

      if (previewSponsors.length === 0) {
        const { data: sp } = await supabase
          .from('sponsors')
          .select('name, tier, slot, shownotes_copy, offer_url, url')
          .eq('active', true);
        previewSponsors = (sp as typeof previewSponsors) || [];
      }

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
        previewSponsors,
        (epRecord.transcript as string) || ''
      );

      setPreviewHtml(html);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Build failed');
    }

    setBuilding(false);
  }

  async function buildGuestEmail() {
    setBuildingEmail(true);
    setError(null);

    try {
      const supabase = createClient();

      const { data: rows } = await supabase
        .from('episode_assets')
        .select('asset_type, content')
        .eq('episode_id', id)
        .eq('is_current', true);

      const emailAsset = rows?.find((r) => r.asset_type === 'guest_email_parts');

      if (!emailAsset || !emailAsset.content) {
        setError('Generate the guest email copy first.');
        setBuildingEmail(false);
        return;
      }

      let parts: GuestEmailParts;
      try {
        parts = JSON.parse(stripFences(emailAsset.content));
      } catch {
        setError('Could not parse guest email output. Regenerate it.');
        setBuildingEmail(false);
        return;
      }

      const { data: ep } = await supabase
        .from('episodes')
        .select('episode_number, title, guest_name, guest_company, release_date')
        .eq('id', id)
        .single();

      if (!ep) {
        setError('Could not load episode data.');
        setBuildingEmail(false);
        return;
      }

      const { data: settingsRows } = await supabase
        .from('settings')
        .select('key, value');

      const s: Record<string, string> = {};
      if (settingsRows) {
        for (const row of settingsRows) {
          if (row.value) s[row.key] = row.value;
        }
      }

      const epRecord = ep as Record<string, unknown>;

      const html = buildGuestEmailHtml(
        parts,
        {
          episode_number: epRecord.episode_number as number,
          title: (epRecord.title as string) || null,
          guest_name: (epRecord.guest_name as string) || null,
          guest_company: (epRecord.guest_company as string) || null,
          release_date: (epRecord.release_date as string) || null,
        },
        s.calendly_url || '#',
        s.apple_podcasts_url || '#',
        s.spotify_url || '#',
        s.youtube_channel_url || '#'
      );

      setEmailHtml(html);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Build failed');
    }

    setBuildingEmail(false);
  }

  async function publish() {
    const ok = confirm(
      'Publish this page to misfitentrepreneur.com? It will be live within about two minutes.'
    );
    if (!ok) return;

    setPublishing(true);
    setError(null);
    setPublishResult(null);

    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId: id }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error || 'Publish failed');
        setPublishing(false);
        return;
      }

      const idxNote =
        data.index === 'added'
          ? ' Added to the podcast page index.'
          : data.index === 'updated'
          ? ' Podcast page index updated.'
          : '';

      setPublishResult(
        'Page ' + data.action + ' at ' + data.url + '.' + idxNote + ' Netlify is deploying now.'
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    }

    setPublishing(false);
  }

  function isPicked(sponsorId: string, slot: string): boolean {
    return picks.some((p) => p.sponsor_id === sponsorId && p.slot === slot);
  }

  function togglePick(sponsorId: string, slot: string) {
    setSponsorsSaved(false);
    setPicks((prev) => {
      const at = prev.findIndex(
        (p) => p.sponsor_id === sponsorId && p.slot === slot
      );
      if (at !== -1) {
        return prev.filter((_, i) => i !== at);
      }
      // Only one sponsor can hold the Misfit 3 naming rights
      const cleaned =
        slot === 'misfit3' ? prev.filter((p) => p.slot !== 'misfit3') : prev;
      return cleaned.concat({ sponsor_id: sponsorId, slot: slot });
    });
  }

  async function saveSponsors() {
    setSavingSponsors(true);
    setError(null);
    setSponsorsSaved(false);

    const supabase = createClient();

    const { error: delErr } = await supabase
      .from('episode_sponsors')
      .delete()
      .eq('episode_id', id);

    if (delErr) {
      setError(delErr.message);
      setSavingSponsors(false);
      return;
    }

    if (picks.length > 0) {
      const order: Record<string, number> = {
        preroll: 1,
        midroll: 2,
        misfit3: 3,
        newsletter: 4,
      };

      const rows = picks.map((p) => ({
        episode_id: id,
        sponsor_id: p.sponsor_id,
        slot: p.slot,
        position: order[p.slot] || 9,
      }));

      const { error: insErr } = await supabase
        .from('episode_sponsors')
        .insert(rows);

      if (insErr) {
        setError(insErr.message);
        setSavingSponsors(false);
        return;
      }
    }

    setSavingSponsors(false);
    setSponsorsSaved(true);
    setPreviewHtml(null);
  }

  async function buildYouTube() {
    setBuildingYt(true);
    setError(null);

    try {
      const supabase = createClient();

      const { data: rows } = await supabase
        .from('episode_assets')
        .select('asset_type, content')
        .eq('episode_id', id)
        .eq('is_current', true);

      const asset = rows?.find((r) => r.asset_type === 'youtube_description');

      if (!asset || !asset.content) {
        setError('Generate the YouTube copy first.');
        setBuildingYt(false);
        return;
      }

      let parts: YouTubeParts;
      try {
        parts = JSON.parse(stripFences(asset.content));
      } catch {
        setError('Could not parse the YouTube output. Regenerate it.');
        setBuildingYt(false);
        return;
      }

      const { data: ep } = await supabase
        .from('episodes')
        .select('episode_number, title, guest_name, guest_company, guest_links')
        .eq('id', id)
        .single();

      if (!ep) {
        setError('Could not load episode data.');
        setBuildingYt(false);
        return;
      }

      const { data: settingsRows } = await supabase
        .from('settings')
        .select('key, value');

      const s: Record<string, string> = {};
      if (settingsRows) {
        for (const row of settingsRows) {
          if (row.value) s[row.key] = row.value;
        }
      }

      const epRecord = ep as Record<string, unknown>;

      const text = buildYouTubeDescription(
        parts,
        {
          episode_number: epRecord.episode_number as number,
          title: (epRecord.title as string) || null,
          guest_name: (epRecord.guest_name as string) || null,
          guest_company: (epRecord.guest_company as string) || null,
          guest_links:
            (epRecord.guest_links as { website?: string | null; linkedin?: string | null }) ||
            null,
        },
        s.youtube_footer || ''
      );

      const lines = buildChapterLines(parts.chapters);

      setYtText(text);
      setYtNote(chapterWarning(lines));
      setYtThumb(parts.thumbnail_phrase || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Build failed');
    }

    setBuildingYt(false);
  }

  function copyYouTube() {
    if (ytText) {
      navigator.clipboard.writeText(ytText);
    }
  }

  function copyHtml() {
    if (previewHtml) {
      navigator.clipboard.writeText(previewHtml);
    }
  }

  function copyEmailHtml() {
    if (emailHtml) {
      navigator.clipboard.writeText(emailHtml);
    }
  }

  const wordCount = episode?.transcript
    ? episode.transcript.trim().split(/\s+/).length
    : 0;

  function hasAsset(type: string): boolean {
    return assets.some((a) => a.asset_type === type);
  }

  const busy =
    running || building || buildingEmail || publishing || buildingYt || savingSponsors;

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
              {' | '}
              <Link href={`/episodes/${id}/edit`}>Edit details</Link>
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
                      {!busy && (
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

              <button className="btn" onClick={runAll} disabled={busy}>
                {running ? 'Generating...' : 'Generate All Show Notes'}
              </button>
            </div>

            {titleOptions.length > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="eyebrow">Choose Title</div>
                <h3 style={{ marginBottom: 8 }}>Episode Title</h3>
                <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
                  Pick one or write your own. This appears on the page, in search results, and in the schema markup.
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
              <div className="eyebrow">Sponsors</div>
              <h3 style={{ marginBottom: 8 }}>This Episode</h3>
              <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
                Pick which sponsors run in which slot. If you pick none, every active
                sponsor appears, which is the old behaviour.
              </p>

              {sponsorsSaved && (
                <div className="msg msg-success">
                  Saved. Rebuild the preview to see the change.
                </div>
              )}

              {sponsors.length === 0 && (
                <p className="muted" style={{ fontSize: 14 }}>
                  No active sponsors. Add one in the Sponsors tab.
                </p>
              )}

              {sponsors.map((sp) => (
                <div
                  key={sp.id}
                  style={{
                    padding: '14px 0',
                    borderBottom: '1px solid rgba(255,255,255,.05)',
                  }}
                >
                  <div style={{ fontSize: 15, color: '#e8e8e8', fontWeight: 600 }}>
                    {sp.name}
                  </div>
                  <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>
                    {sp.tier || 'No tier'}
                  </div>
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    {SLOTS.map((slot) => (
                      <label
                        key={slot.key}
                        title={slot.note}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 7,
                          fontSize: 12.5,
                          letterSpacing: 0,
                          textTransform: 'none',
                          fontWeight: 500,
                          color: isPicked(sp.id, slot.key) ? '#F0B429' : '#8f8f8f',
                          marginBottom: 0,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isPicked(sp.id, slot.key)}
                          onChange={() => togglePick(sp.id, slot.key)}
                          style={{ width: 'auto', margin: 0 }}
                        />
                        {slot.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {sponsors.length > 0 && (
                <button
                  className="btn"
                  onClick={saveSponsors}
                  disabled={busy}
                  style={{ marginTop: 18 }}
                >
                  {savingSponsors ? 'Saving...' : 'Save Sponsors'}
                </button>
              )}
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
              <div className="eyebrow">Assemble</div>
              <h3 style={{ marginBottom: 8 }}>Show Notes Page</h3>
              <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
                Merges the four generated pieces into the finished page.
              </p>
              {error !== null && (
                <div className="msg msg-error" style={{ marginBottom: 14 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn" onClick={buildPreview} disabled={busy}>
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

            <div className="card" style={{ marginBottom: 20 }}>
              <div className="eyebrow">Publish</div>
              <h3 style={{ marginBottom: 8 }}>Push to Live Site</h3>
              <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
                Commits the page to GitHub at episodes/ep-{episode.episode_number}-episode.html. Netlify deploys within about two minutes. Safe to run again after any change.
              </p>

              {publishResult !== null && (
                <div className="msg msg-success">{publishResult}</div>
              )}

              <button className="btn" onClick={publish} disabled={busy}>
                {publishing ? 'Publishing...' : 'Publish to Site'}
              </button>
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
              <div className="eyebrow">Guest Email</div>
              <h3 style={{ marginBottom: 8 }}>Launch Day Email</h3>
              <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
                Writes the personalized opener plus three ready-to-post social posts in the guest voice, then assembles the full email. Reads the show notes, so run those first.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => runSingle('guest_email_parts')}
                  disabled={busy}
                >
                  {hasAsset('guest_email_parts') ? 'Regenerate Copy' : 'Generate Copy'}
                </button>
                <button className="btn" onClick={buildGuestEmail} disabled={busy}>
                  {buildingEmail ? 'Building...' : 'Build Email'}
                </button>
                {emailHtml !== null && (
                  <button className="btn btn-ghost" onClick={copyEmailHtml}>
                    Copy HTML
                  </button>
                )}
              </div>
            </div>

            {emailHtml !== null && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="eyebrow">Email Preview</div>
                <iframe
                  srcDoc={emailHtml}
                  title="Guest email preview"
                  style={{
                    width: '100%',
                    height: 700,
                    border: '1px solid rgba(255,255,255,.1)',
                    borderRadius: 6,
                    background: '#e8e8e8',
                  }}
                />
              </div>
            )}

            <div className="card" style={{ marginBottom: 20 }}>
              <div className="eyebrow">YouTube</div>
              <h3 style={{ marginBottom: 8 }}>Description and Chapters</h3>
              <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
                Writes the episode intro, the learn bullets, chapter timestamps from the transcript, hashtags, and a thumbnail phrase. Appends your standard footer from Settings.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => runSingle('youtube_description')}
                  disabled={busy}
                >
                  {hasAsset('youtube_description') ? 'Regenerate Copy' : 'Generate Copy'}
                </button>
                <button className="btn" onClick={buildYouTube} disabled={busy}>
                  {buildingYt ? 'Building...' : 'Build Description'}
                </button>
                {ytText !== null && (
                  <button className="btn btn-ghost" onClick={copyYouTube}>
                    Copy Description
                  </button>
                )}
              </div>
            </div>

            {ytThumb !== null && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="eyebrow">Thumbnail Phrase</div>
                <h2 style={{ marginTop: 4 }}>{ytThumb}</h2>
              </div>
            )}

            {ytNote !== null && (
              <div className="msg msg-error" style={{ marginBottom: 20 }}>
                {ytNote}
              </div>
            )}

            {ytText !== null && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="eyebrow">Description</div>
                <textarea
                  value={ytText}
                  onChange={(e) => setYtText(e.target.value)}
                  rows={22}
                  style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
                />
                <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>
                  {ytText.length.toLocaleString()} of 5,000 characters. Editable before you copy.
                  Chapter times show as __:__ because Riverside timestamps do not survive the
                  Camtasia edit. Fill them in while you are in Camtasia.
                </p>
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
