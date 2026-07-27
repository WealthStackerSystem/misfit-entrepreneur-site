'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import Nav from '../../../components/Nav';

type GuestLinks = {
  website?: string | null;
  linkedin?: string | null;
};

export default function EditEpisodePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [episodeNumber, setEpisodeNumber] = useState('');
  const [title, setTitle] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestCompany, setGuestCompany] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestWebsite, setGuestWebsite] = useState('');
  const [guestLinkedin, setGuestLinkedin] = useState('');
  const [libsynId, setLibsynId] = useState('');
  const [libsynEmbed, setLibsynEmbed] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [transcript, setTranscript] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from('episodes')
        .select('*')
        .eq('id', id)
        .single();

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const ep = data as Record<string, unknown>;
      const links = (ep.guest_links as GuestLinks) || {};

      setEpisodeNumber(String(ep.episode_number ?? ''));
      setTitle((ep.title as string) || '');
      setGuestName((ep.guest_name as string) || '');
      setGuestCompany((ep.guest_company as string) || '');
      setGuestEmail((ep.guest_email as string) || '');
      setGuestWebsite(links.website || '');
      setGuestLinkedin(links.linkedin || '');
      setLibsynId((ep.libsyn_id as string) || '');
      setLibsynEmbed((ep.libsyn_player_embed as string) || '');
      setYoutubeUrl((ep.youtube_url as string) || '');
      setReleaseDate((ep.release_date as string) || '');
      setTranscript((ep.transcript as string) || '');
      setNotes((ep.notes as string) || '');

      setLoading(false);
    }

    load();
  }, [id]);

  async function save() {
    setError(null);
    setSaved(false);

    const num = parseInt(episodeNumber, 10);
    if (!num || num < 1) {
      setError('Episode number is required and must be a positive number.');
      return;
    }

    if (guestName.trim().length === 0) {
      setError('Guest name is required.');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const payload = {
      episode_number: num,
      title: title.trim().length > 0 ? title.trim() : null,
      guest_name: guestName.trim(),
      guest_company: guestCompany.trim().length > 0 ? guestCompany.trim() : null,
      guest_email: guestEmail.trim().length > 0 ? guestEmail.trim() : null,
      guest_links: {
        website: guestWebsite.trim().length > 0 ? guestWebsite.trim() : null,
        linkedin: guestLinkedin.trim().length > 0 ? guestLinkedin.trim() : null,
      },
      libsyn_id: libsynId.trim().length > 0 ? libsynId.trim() : null,
      libsyn_player_embed: libsynEmbed.trim().length > 0 ? libsynEmbed.trim() : null,
      youtube_url: youtubeUrl.trim().length > 0 ? youtubeUrl.trim() : null,
      release_date: releaseDate.length > 0 ? releaseDate : null,
      site_url: 'https://misfitentrepreneur.com/episodes/ep-' + num + '-episode.html',
      transcript: transcript.trim().length > 0 ? transcript.trim() : null,
      notes: notes.trim().length > 0 ? notes.trim() : null,
    };

    const { error: upErr } = await supabase
      .from('episodes')
      .update(payload)
      .eq('id', id);

    if (upErr) {
      if (upErr.code === '23505') {
        setError('Episode number ' + num + ' is already used by another episode.');
      } else {
        setError(upErr.message);
      }
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
  }

  const trimmedTranscript = transcript.trim();
  const wordCount =
    trimmedTranscript.length > 0 ? trimmedTranscript.split(/\s+/).length : 0;

  return (
    <div className="shell">
      <Nav />

      <div className="main">
        <div className="eyebrow">Edit Episode</div>
        <h1>Episode Details</h1>
        <p className="muted" style={{ marginTop: 10, marginBottom: 24 }}>
          <Link href={`/episodes/${id}`}>Back to episode</Link>
        </p>

        {error !== null && <div className="msg msg-error">{error}</div>}
        {saved && (
          <div className="msg msg-success">
            Saved. Republish the page to push changes to the site.
          </div>
        )}

        {loading && <p className="muted">Loading...</p>}

        {!loading && (
          <>
            <div className="card" style={{ marginBottom: 18 }}>
              <h3 style={{ marginBottom: 18 }}>Episode</h3>

              <div className="field">
                <label htmlFor="num">Episode Number (required)</label>
                <input id="num" type="number" value={episodeNumber} onChange={(e) => setEpisodeNumber(e.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="ti">Title</label>
                <input id="ti" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Set from the title picker, or override here" />
                <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>
                  {title.length} characters
                </div>
              </div>

              <div className="field">
                <label htmlFor="rd">Release Date</label>
                <input id="rd" type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
              </div>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <h3 style={{ marginBottom: 18 }}>Guest</h3>

              <div className="field">
                <label htmlFor="gn">Guest Name (required)</label>
                <input id="gn" type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="gc">Company or Role</label>
                <input id="gc" type="text" value={guestCompany} onChange={(e) => setGuestCompany(e.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="ge">Guest Email</label>
                <input id="ge" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="Needed to send the launch kit" />
              </div>

              <div className="field">
                <label htmlFor="gw">Guest Website</label>
                <input id="gw" type="text" value={guestWebsite} onChange={(e) => setGuestWebsite(e.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="gl">Guest LinkedIn</label>
                <input id="gl" type="text" value={guestLinkedin} onChange={(e) => setGuestLinkedin(e.target.value)} />
              </div>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <h3 style={{ marginBottom: 6 }}>Distribution</h3>
              <p className="dim" style={{ fontSize: 12.5, marginBottom: 18 }}>
                Add the Libsyn embed after you upload and schedule the episode. The player replaces the pending notice on the show notes page.
              </p>

              <div className="field">
                <label htmlFor="lid">Libsyn Episode ID</label>
                <input id="lid" type="text" value={libsynId} onChange={(e) => setLibsynId(e.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="lem">Libsyn Player Embed Code</label>
                <textarea id="lem" value={libsynEmbed} onChange={(e) => setLibsynEmbed(e.target.value)} rows={4} placeholder="Paste the full iframe embed from Libsyn" />
              </div>

              <div className="field">
                <label htmlFor="yt">YouTube URL</label>
                <input id="yt" type="text" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
              </div>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <h3>Transcript</h3>
                <span className="dim" style={{ fontSize: 12.5 }}>{wordCount.toLocaleString()} words</span>
              </div>
              <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={10} />
              <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>
                Changing the transcript does not regenerate anything. Rerun the generator afterward if you edit this.
              </p>
            </div>

            <div className="card" style={{ marginBottom: 22 }}>
              <h3 style={{ marginBottom: 14 }}>Private Notes</h3>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Anything you want to remember about this episode. Never published." />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn" onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="btn btn-ghost" onClick={() => router.push('/episodes/' + id)}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
