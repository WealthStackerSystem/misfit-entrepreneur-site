'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Nav from '../components/Nav';

type Article = {
  id: string;
  slug: string;
  title: string;
  body_html: string | null;
  excerpt: string | null;
  meta_description: string | null;
  word_count: number | null;
  status: string;
  source: string | null;
  publish_date: string | null;
  title_options: string[] | null;
  episodes_linked: number[] | null;
  is_style_reference: boolean | null;
};

type Mode = 'topic' | 'thesis' | 'source';

const MODES: { key: Mode; label: string; hint: string; placeholder: string }[] = [
  {
    key: 'topic',
    label: 'Topic',
    hint: 'Name a subject. The angle gets found for you.',
    placeholder: 'Delegation. Or hiring your first employee.',
  },
  {
    key: 'thesis',
    label: 'Thesis',
    hint: 'Give the argument in a sentence or two. This gives the best results, because the idea is yours.',
    placeholder:
      'Most founders delegate tasks when they should be delegating outcomes, which is why they end up doing the work twice.',
  },
  {
    key: 'source',
    label: 'From a source',
    hint: 'Paste an article. The post answers it rather than summarising it.',
    placeholder: 'What you think about it. Where it is right, where it is wrong.',
  },
];

export default function BlogPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('thesis');
  const [input, setInput] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftMeta, setDraftMeta] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showRefs, setShowRefs] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from('articles')
      .select(
        'id, slug, title, body_html, excerpt, meta_description, word_count, status, source, publish_date, title_options, episodes_linked, is_style_reference'
      )
      .order('publish_date', { ascending: false, nullsFirst: true })
      .limit(200);

    if (err) setError(err.message);
    else setArticles((data as Article[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function generate() {
    if (input.trim().length < 5) {
      setError('Say a bit more about what the post should cover.');
      return;
    }
    if (mode === 'source' && sourceText.trim().length < 100) {
      setError('Paste the article text you want the post to respond to.');
      return;
    }

    setGenerating(true);
    setError(null);
    setMessage(null);

    // Two calls. Writing the post and naming it are separate requests so
    // neither runs up against the function time limit.
    try {
      setStage('Writing the post...');

      const res = await fetch('/api/blog-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'body',
          mode: mode,
          input: input,
          sourceUrl: sourceUrl,
          sourceText: sourceText,
        }),
      });

      const raw = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        setError('The post took too long to write. Try again.');
        setGenerating(false);
        setStage(null);
        return;
      }

      if (!data.ok) {
        setError(String(data.error || 'Generation failed'));
        setGenerating(false);
        setStage(null);
        return;
      }

      const articleId = String(data.id);
      const words = Number(data.words || 0);

      setStage('Naming it...');

      const metaRes = await fetch('/api/blog-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'meta', articleId: articleId, mode: mode, input: 'meta' }),
      });

      const metaRaw = await metaRes.text();
      let metaData: Record<string, unknown>;
      try {
        metaData = JSON.parse(metaRaw);
      } catch {
        // The post itself is saved, so this is recoverable
        setMessage(
          'Post written at ' + words + ' words, but the title step failed. ' +
            'Open the draft and give it a title.'
        );
        setInput('');
        setSourceText('');
        setSourceUrl('');
        setGenerating(false);
        setStage(null);
        load();
        return;
      }

      if (!metaData.ok) {
        setMessage(
          'Post written at ' + words + ' words. Title step failed: ' +
            String(metaData.error || '')
        );
      } else {
        setMessage(
          'Drafted "' + String(metaData.title) + '" at ' + words + ' words.'
        );
      }

      setInput('');
      setSourceText('');
      setSourceUrl('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }

    setGenerating(false);
    setStage(null);
  }

  function openArticle(a: Article) {
    setError(null);
    setMessage(null);
    if (openId === a.id) {
      setOpenId(null);
      return;
    }
    setOpenId(a.id);
    setDraftTitle(a.title);
    setDraftBody(a.body_html || '');
    setDraftMeta(a.meta_description || '');
  }

  async function saveArticle(a: Article) {
    setSaving(true);
    setError(null);

    const plain = draftBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const supabase = createClient();
    const { error: err } = await supabase
      .from('articles')
      .update({
        title: draftTitle,
        body_html: draftBody,
        meta_description: draftMeta,
        word_count: plain.split(/\s+/).filter(Boolean).length,
      })
      .eq('id', a.id);

    if (err) setError(err.message);
    else {
      setMessage('Saved.');
      load();
    }
    setSaving(false);
  }

  async function deleteArticle(a: Article) {
    const warning =
      a.status === 'published'
        ? 'Delete "' + a.title + '"?\n\nThis removes it from the admin only. ' +
          'The live page at /blog/' + a.slug + '.html stays up until you ' +
          'delete that file from the repo.'
        : 'Delete "' + a.title + '"? This cannot be undone.';

    if (!confirm(warning)) return;

    setDeleting(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: err } = await supabase.from('articles').delete().eq('id', a.id);

    if (err) {
      setError(err.message);
    } else {
      setMessage('Deleted.');
      if (openId === a.id) setOpenId(null);
      load();
    }

    setDeleting(false);
  }

  async function toggleReference(a: Article) {
    const supabase = createClient();
    const { error: err } = await supabase
      .from('articles')
      .update({ is_style_reference: !a.is_style_reference })
      .eq('id', a.id);

    if (err) setError(err.message);
    else load();
  }

  async function publish(a: Article) {
    if (!confirm('Publish "' + a.title + '" to misfitentrepreneur.com?')) return;

    setPublishing(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/blog-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: a.id }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(String(data.error || 'Publish failed'));
        setPublishing(false);
        return;
      }

      setMessage('Live at ' + String(data.url) + '. Netlify is deploying now.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    }

    setPublishing(false);
  }

  const refs = articles.filter((a) => a.status === 'reference');
  const posts = articles.filter((a) => a.status !== 'reference');
  const drafts = posts.filter((a) => a.status === 'draft');
  const live = posts.filter((a) => a.status !== 'draft');
  const busy = generating || saving || publishing || deleting;

  const activeMode = MODES.find((m) => m.key === mode) || MODES[0];

  return (
    <div className="shell">
      <Nav />

      <div className="main">
        <div className="eyebrow">Blog</div>
        <h1>Write a Post</h1>
        <p className="muted" style={{ marginTop: 10, marginBottom: 24 }}>
          Written in your voice, using your own writing as the reference, with real
          links into the episode archive where they fit.
        </p>

        {error !== null && <div className="msg msg-error">{error}</div>}
        {message !== null && <div className="msg msg-success">{message}</div>}

        <div className="card" style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {MODES.map((m) => (
              <button
                key={m.key}
                className={mode === m.key ? 'btn' : 'btn btn-ghost'}
                onClick={() => setMode(m.key)}
                disabled={busy}
              >
                {m.label}
              </button>
            ))}
          </div>

          <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
            {activeMode.hint}
          </p>

          {mode === 'source' && (
            <>
              <div className="field">
                <label htmlFor="surl">Source URL</label>
                <input
                  id="surl"
                  type="text"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="field">
                <label htmlFor="stext">Article text</label>
                <textarea
                  id="stext"
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  rows={7}
                  placeholder="Paste the article you want to respond to."
                />
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="inp">
              {mode === 'source' ? 'Your take' : mode === 'thesis' ? 'Your argument' : 'Topic'}
            </label>
            <textarea
              id="inp"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={mode === 'topic' ? 2 : 4}
              placeholder={activeMode.placeholder}
            />
          </div>

          <button className="btn" onClick={generate} disabled={busy}>
            {generating ? stage || 'Writing...' : 'Write the Post'}
          </button>
          {generating && (
            <p className="dim" style={{ fontSize: 12, marginTop: 10 }}>
              This takes about half a minute. Leave the page open.
            </p>
          )}
        </div>

        {loading && <p className="muted">Loading...</p>}

        {drafts.length > 0 && (
          <>
            <h2 style={{ marginBottom: 14 }}>Drafts</h2>
            {drafts.map((a) => (
              <ArticleCard
                key={a.id}
                a={a}
                isOpen={openId === a.id}
                onToggle={() => openArticle(a)}
                draftTitle={draftTitle}
                draftBody={draftBody}
                draftMeta={draftMeta}
                setDraftTitle={setDraftTitle}
                setDraftBody={setDraftBody}
                setDraftMeta={setDraftMeta}
                onSave={() => saveArticle(a)}
                onPublish={() => publish(a)}
                onToggleRef={() => toggleReference(a)}
                onDelete={() => deleteArticle(a)}
                busy={busy}
                saving={saving}
                publishing={publishing}
                deleting={deleting}
              />
            ))}
          </>
        )}

        {live.length > 0 && (
          <>
            <h2 style={{ margin: '30px 0 14px' }}>Published</h2>
            {live.map((a) => (
              <ArticleCard
                key={a.id}
                a={a}
                isOpen={openId === a.id}
                onToggle={() => openArticle(a)}
                draftTitle={draftTitle}
                draftBody={draftBody}
                draftMeta={draftMeta}
                setDraftTitle={setDraftTitle}
                setDraftBody={setDraftBody}
                setDraftMeta={setDraftMeta}
                onSave={() => saveArticle(a)}
                onPublish={() => publish(a)}
                onToggleRef={() => toggleReference(a)}
                onDelete={() => deleteArticle(a)}
                busy={busy}
                saving={saving}
                publishing={publishing}
                deleting={deleting}
              />
            ))}
          </>
        )}

        {refs.length > 0 && (
          <div style={{ marginTop: 30 }}>
            <h2
              onClick={() => setShowRefs(!showRefs)}
              style={{ cursor: 'pointer', marginBottom: 10 }}
            >
              Voice References ({refs.length}) {showRefs ? '\u2212' : '+'}
            </h2>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
              Your own writing. Never published, never in the newsletter. These teach
              the generator how you sound.
            </p>
            {showRefs &&
              refs.map((a) => (
                <div
                  key={a.id}
                  style={{
                    padding: '11px 0',
                    borderBottom: '1px solid rgba(255,255,255,.05)',
                    fontSize: 14,
                    color: '#c8c8c8',
                  }}
                >
                  {a.title}
                  <span className="dim" style={{ fontSize: 11.5, marginLeft: 10 }}>
                    {(a.word_count || 0).toLocaleString()} words
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ArticleCard(props: {
  a: Article;
  isOpen: boolean;
  onToggle: () => void;
  draftTitle: string;
  draftBody: string;
  draftMeta: string;
  setDraftTitle: (s: string) => void;
  setDraftBody: (s: string) => void;
  setDraftMeta: (s: string) => void;
  onSave: () => void;
  onPublish: () => void;
  onToggleRef: () => void;
  onDelete: () => void;
  busy: boolean;
  saving: boolean;
  publishing: boolean;
  deleting: boolean;
}) {
  const a = props.a;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div
        onClick={props.onToggle}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15.5, color: '#e8e8e8', fontWeight: 600 }}>
            {a.title}
          </div>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>
            {a.status} &middot; {(a.word_count || 0).toLocaleString()} words
            {a.publish_date ? ' \u00b7 ' + a.publish_date : ''}
            {a.is_style_reference ? ' \u00b7 style reference' : ''}
            {a.episodes_linked && a.episodes_linked.length > 0
              ? ' \u00b7 links ep ' + a.episodes_linked.join(', ')
              : ''}
          </div>
        </div>
        <span style={{ color: '#8f8f8f', fontSize: 18, flexShrink: 0 }}>
          {props.isOpen ? '\u2212' : '+'}
        </span>
      </div>

      {props.isOpen && (
        <div style={{ marginTop: 18 }}>
          {a.title_options && a.title_options.length > 1 && (
            <div className="field">
              <label>Other titles</label>
              {a.title_options.map((t, i) => (
                <div
                  key={i}
                  onClick={() => props.setDraftTitle(t)}
                  style={{
                    fontSize: 13.5,
                    color: props.draftTitle === t ? '#F0B429' : '#9a9a9a',
                    padding: '5px 0',
                    cursor: 'pointer',
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          )}

          <div className="field">
            <label htmlFor={'t' + a.id}>Title</label>
            <input
              id={'t' + a.id}
              type="text"
              value={props.draftTitle}
              onChange={(e) => props.setDraftTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor={'m' + a.id}>Meta description</label>
            <input
              id={'m' + a.id}
              type="text"
              value={props.draftMeta}
              onChange={(e) => props.setDraftMeta(e.target.value)}
            />
            <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>
              {props.draftMeta.length} of 155
            </div>
          </div>

          <div className="field">
            <label htmlFor={'b' + a.id}>Body</label>
            <textarea
              id={'b' + a.id}
              value={props.draftBody}
              onChange={(e) => props.setDraftBody(e.target.value)}
              rows={20}
              spellCheck={false}
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={props.onSave} disabled={props.busy}>
              {props.saving ? 'Saving...' : 'Save'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={props.onPublish}
              disabled={props.busy}
            >
              {props.publishing ? 'Publishing...' : 'Publish to Site'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={props.onToggleRef}
              disabled={props.busy}
            >
              {a.is_style_reference ? 'Unstar as reference' : 'Star as reference'}
            </button>
            {a.status === 'published' && (
              <a
                className="btn btn-ghost"
                href={'https://misfitentrepreneur.com/blog/' + a.slug + '.html'}
                target="_blank"
                rel="noopener"
              >
                View live
              </a>
            )}

            <button
              className="btn btn-ghost"
              onClick={props.onDelete}
              disabled={props.busy}
              style={{
                marginLeft: 'auto',
                borderColor: 'rgba(220,80,80,.35)',
                color: '#d97070',
              }}
            >
              {props.deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
