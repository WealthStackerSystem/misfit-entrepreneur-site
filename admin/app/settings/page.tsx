'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Nav from '../components/Nav';

type Setting = {
  key: string;
  value: string | null;
  description: string | null;
};

// Keys that need a multi-line textarea rather than a single input
const LONG_FIELDS: string[] = ['youtube_footer', 'standard_intro'];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('settings')
        .select('key, value, description')
        .order('key');

      if (error) {
        setError(error.message);
      } else {
        setSettings((data as Setting[]) ?? []);
      }
      setLoading(false);
    }

    load();
  }, []);

  function updateValue(key: string, value: string) {
    setSettings((prev) =>
      prev.map((s) => (s.key === key ? { ...s, value } : s))
    );
    setSaved(false);
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const supabase = createClient();

    for (const s of settings) {
      const { error } = await supabase
        .from('settings')
        .update({ value: s.value })
        .eq('key', s.key);

      if (error) {
        setError(`Failed on "${s.key}": ${error.message}`);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="shell">
      <Nav />

      <div className="main">
        <div className="eyebrow">Settings</div>
        <h1>Global Values</h1>
        <p className="muted" style={{ marginTop: 10, marginBottom: 26 }}>
          Boilerplate used across every generated asset. Edit here instead of
          hardcoding into prompts.
        </p>

        {error && <div className="msg msg-error">{error}</div>}
        {saved && <div className="msg msg-success">Settings saved.</div>}

        {loading && <p className="muted">Loading…</p>}

        {!loading && (
          <>
            <div className="card">
              {settings.map((s) => (
                <div className="field" key={s.key}>
                  <label htmlFor={s.key}>{s.key.replace(/_/g, ' ')}</label>

                  {LONG_FIELDS.includes(s.key) ? (
                    <textarea
                      id={s.key}
                      value={s.value ?? ''}
                      onChange={(e) => updateValue(s.key, e.target.value)}
                      rows={8}
                    />
                  ) : (
                    <input
                      id={s.key}
                      type="text"
                      value={s.value ?? ''}
                      onChange={(e) => updateValue(s.key, e.target.value)}
                    />
                  )}

                  {s.description && (
                    <p className="dim" style={{ fontSize: 12, marginTop: 5 }}>
                      {s.description}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <button
              className="btn"
              onClick={saveAll}
              disabled={saving}
              style={{ marginTop: 22 }}
            >
              {saving ? 'Saving…' : 'Save All Settings'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
