'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import Nav from '../../components/Nav';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export default function NewEpisodePage() {
  const router = useRouter();

  const [episodeNumber, setEpisodeNumber] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestCompany, setGuestCompany] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestWebsite, setGuestWebsite] = useState('');
  const [guestLinkedin, setGuestLinkedin] = useState('');
  const [workingTitle, setWorkingTitle] = useState('');
  const [libsynId, setLibsynId] = useState('');
  const [libsynEmbed, setLibsynEmbed] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [transcript, setTranscript] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wordCount = transcript.trim()
    ? transcript.trim().split(/\s+/).length
    : 0;

  async function save() {
    setError(null);

    const num = parseInt(episodeNumber, 10);
    if (!num || num < 1) {
      setError('Episode number is required and must be a positive number.');
      return;
    }
    if (!guestName.trim()) {
      setError('Guest name is required. The generator needs it to know who is who in the transcript.');
      return;
    }
    if (wordCount < 200) {
      setError('Transcript looks too short. Paste the full transcript before saving.');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const payload = {
      episode_number: num,
      status: 'draft',
      title: workingTitle.trim() || null,
      slug: workingTitle.trim() ? slugify(workingTitle) : null,
      guest_name: guestName.trim(),
      guest_company: guestCompany.trim() || null,
      guest_email: guestEmail.trim() || null,
      guest_links: {
        website: guestWebsite.trim() || null,
        linkedin: guestLinkedin.trim() || null,
      },
      libsyn_id: libsynId.trim() || null,
      libsyn_player_embed: libsynEmbed.trim() || null,
      release_date: releaseDate || null,
      site_url: `https://misfitentrepreneur.com/episodes/ep-${num}-episode.html`,
      transcript: transcript.trim(),
    };

    const { data, error } = await supabase
      .from('episodes')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      setError(
        error.code === '23505'
          ? `Episode ${num} already exists. Open it from the Episodes tab instead.`
          : error.message
      );
      setSaving(false);
      return;
    }

    router.push(`/episodes/${data.id}`);
  }

  return (
    <div className="shell">
      <Nav />

      <div className="main">
        <div className="eyebrow">New Episode</div>
        <h1>Start an Episode</h1>
        <p className="muted" style={{ marginTop: 10, marginBottom: 26 }}>
          Upload to Libsyn first and schedule it, then paste the details here.
          Everything below feeds the generator.
        </p>

        {error && <div className="msg msg-error">{error}</div>}

        <div className="card" style={{ marginBottom: 18 }}>
          <h3 style={{ marginBottom: 18 }}>Episode</h3>

          <div className="field">
            <label htmlFor="num">Episode Number *</label>
            <input
              id="num"
              type="number"
              value={episodeNumber}
              onChange={(e) => setEpisodeNumber(e.target.value)}
              placeholder="463"
            />
          </div>

          <div className="field">
            <label htmlFor="wt">Working Title</label>
            <input
              id="wt"
              type="text"
              value={workingTitle}
              onChange={(e) => setWorkingTitle(e.target.value)}
              placeholder="Optional — the generator will suggest five"
            />
          </div>

          <div className="field">
            <label htmlFor="rd">Release Date</label>
            <input
              id="rd"
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <h3 style={{ marginBottom: 6 }}>Guest</h3>
          <p className="dim" style={{ fontSize: 12.5, marginBottom: 18 }}>
            Guest name is required. This is what stops the generator from
            confusing you with the guest.
          </p>

          <div className="field">
            <label htmlFor="gn">Guest Name *</label>
            <input
              id="gn"
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Nigel Tunacliffe"
            />
          </div>

          <div className="field">
            <label htmlFor="gc">Company / Role</label>
            <input
              id="gc"
              type="text"
              value={guestCompany}
              onChange={(e) => setGuestCompany(e.target.value)}
              placeholder="Co-Founder & CEO, Coastline Academy"
            />
          </div>

          <div className="field">
            <label htmlFor="ge">Guest Email</label>
            <input
              id="ge"
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="Needed for the launch kit email"
            />
          </div>

          <div className="field">
            <label htmlFor="gw">Guest Website</label>
            <input
              id="gw"
              type="text"
              value={guestWebsite}
              onChange={(e) => setGuestWebsite(e.target.value)}
              placeholder="https://coastlineacademy.com"
            />
          </div>

          <div className="field">
            <label htmlFor="gl">Guest LinkedIn</label>
            <input
              id="gl"
              type="text"
              value={guestLinkedin}
              onChange={(e) => setGuestLinkedin(e.target.value)}
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <h3 style={{ marginBottom: 6 }}>Libsyn</h3>
          <p className="dim" style={{ fontSize:
