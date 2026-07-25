'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Nav from '../components/Nav';

type Sponsor = {
  id: string;
  name: string;
  tier: string | null;
  slot: string | null;
  read_copy: string | null;
  shownotes_copy: string | null;
  newsletter_copy: string | null;
  offer_text: string | null;
  offer_url: string | null;
  promo_code: string | null;
  url: string | null;
  logo_url: string | null;
  active: boolean;
};

const EMPTY: Omit<Sponsor, 'id'> = {
  name: '',
  tier: '',
  slot: 'midroll',
  read_copy: '',
  shownotes_copy: '',
  newsletter_copy: '',
  offer_text: '',
  offer_url: '',
  promo_code: '',
  url: '',
  logo_url: '',
  active: true,
};

const TIERS: string[] = [
  'Founding Partner',
  'Presenting Partner',
  'Feature Sponsor',
  'Performance Partner',
  'Spotlight',
];

const SLOTS: string[] = ['preroll', 'midroll', 'misfit3', 'newsletter'];

export default function SponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Sponsor, 'id'>>(EMPTY);
  const [showForm, setShowForm] = useState<boolean>(false);

  async function load() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('sponsors')
      .select('*')
      .order('name');

    if (error) {
      setError(error.message);
    } else {
      setSponsors((data as Sponsor[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function setField(key: keyof Omit<Sponsor, 'id'>, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startNew() {
    setForm(EMPTY);
    setEditingId(null);
    setShowForm(true);
    setError(null);
  }

  function startEdit(s: Sponsor) {
    const { id, ...rest } = s;
    setForm(rest);
    setEditingId(id);
    setShowForm(true);
    setError(null);
  }

  async function save() {
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const supabase = createClient();

    const payload = {
      ...form,
      tier: form.tier || null,
      slot: form.slot || null,
      offer_url: form.offer_url || null,
      url: form.url || null,
      logo_url: form.logo_url || null,
    };

    const { error } = editingId
      ? await supabase.from('sponsors').update(payload).eq('id', editingId)
      : await supabase.from('sponsors').insert(payload);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY);
    load();
  }

  async function toggleActive(s: Sponsor) {
    const supabase = createClient();
    const { error } = await supabase
      .from('sponsors')
      .update({ active: !s.active })
      .eq('id', s.id);

    if (error) {
      setError(error.message);
      return;
    }
    load();
  }

  async function remove(s: Sponsor) {
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return;

    const supabase = createClient();
    const { error } = await supabase.from('sponsors').delete().eq('id', s.id);

    if (error) {
      setError(error.message);
      return;
    }
    load();
  }

  return (
    <div className="shell">
      <Nav />

      <div className="main">
        <div className="eyebrow">Sponsors</div>
        <h1>Sponsor Library</h1>
        <p className="muted" style={{ marginTop: 10, marginBottom: 24 }}>
          Sponsor copy lives here once. Show notes pages and the Misfit Minute
          pull from it, so ending a deal never means editing old pages.
        </p>

        {error && <div className="msg msg-error">{error}</div>}

        {!showForm && (
          <button className="btn" onClick={startNew} style={{ marginBottom: 24 }}>
            + Add Sponsor
          </button>
        )}

        {showForm && (
          <div className="card" style={{ marginBottom: 28 }}>
            <h3 style={{ marginBottom: 18 }}>
              {editingId ? 'Edit Sponsor' : 'New Sponsor'}
            </h3>

            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="tier">Tier</label>
              <select
                id="tier"
                value={form.tier ?? ''}
                onChange={(e) => setField('tier', e.target.value)}
              >
                <option value="">— none —</option>
                {TIERS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="slot">Slot</label>
              <select
                id="slot"
                value={form.slot ?? ''}
                onChange={(e) => setField('slot', e.target.value)}
              >
                {SLOTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="read_copy">Read Copy (what you say on air)</label>
              <textarea
                id="read_copy"
                value={form.read_copy ?? ''}
                onChange={(e) => setField('read_copy', e.target.value)}
                rows={5}
              />
            </div>

            <div className="field">
              <label htmlFor="shownotes_copy">Show Notes Copy</label>
              <textarea
                id="shownotes_copy"
                value={form.shownotes_copy ?? ''}
                onChange={(e) => setField('shownotes_copy', e.target.value)}
                rows={4}
              />
            </div>

            <div className="field">
              <label htmlFor="newsletter_copy">Newsletter Copy</label>
              <textarea
                id="newsletter_copy"
                value={form.newsletter_copy ?? ''}
                onChange={(e) => setField('newsletter_copy', e.target.value)}
                rows={4}
              />
            </div>

            <div className="field">
              <label htmlFor="offer_text">Special Offer Text</label>
              <input
                id="offer_text"
                type="text"
                value={form.offer_text ?? ''}
                onChange={(e) => setField('offer_text', e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="offer_url">Special Offer URL</label>
              <input
                id="offer_url"
                type="text"
                value={form.offer_url ?? ''}
                onChange={(e) => setField('offer_url', e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="promo_code">Promo Code</label>
              <input
                id="promo_code"
                type="text"
                value={form.promo_code ?? ''}
                onChange={(e) => setField('promo_code', e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="url">Website URL</label>
              <input
                id="url"
                type="text"
                value={form.url ?? ''}
                onChange={(e) => setField('url', e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="logo_url">Logo URL</label>
              <input
                id="logo_url"
                type="text"
                value={form.logo_url ?? ''}
                onChange={(e) => setField('logo_url', e.target.value)}
              />
            </div>

            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setField('active', e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Active
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save Sponsor'}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading && <p className="muted">Loading…</p>}

        {!loading && sponsors.length === 0 && !showForm && (
          <p className="muted">No sponsors yet. Add your first one above.</p>
        )}

        {sponsors.length > 0 && (
          <div className="card-grid">
            {sponsors.map((s) => (
              <div className="card" key={s.id}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 10,
                  }}
                >
                  <h3>{s.name}</h3>
                  <span className={s.active ? 'pill pill-published' : 'pill pill-draft'}>
                    {s.active ? 'Active' : 'Off'}
                  </span>
                </div>

                <p className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                  {s.tier || 'No tier'} · {s.slot || 'no slot'}
                </p>

                {s.promo_code && (
                  <p className="dim" style={{ fontSize: 12.5, marginBottom: 12 }}>
                    Code: {s.promo_code}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '7px 14px', fontSize: 12 }}
                    onClick={() => startEdit(s)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '7px 14px', fontSize: 12 }}
                    onClick={() => toggleActive(s)}
                  >
                    {s.active ? 'Turn Off' : 'Turn On'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '7px 14px', fontSize: 12, borderColor: 'rgba(248,81,73,.3)', color: '#f85149' }}
                    onClick={() => remove(s)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
