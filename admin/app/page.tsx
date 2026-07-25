export default function DashboardPage() {
  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">MISFIT ADMIN</div>
        <div className="who">Build check</div>
      </div>

      <div className="nav">
        <a href="/" className="active">Dashboard</a>
        <a href="/">New Episode</a>
        <a href="/">Episodes</a>
        <a href="/">Blog</a>
        <a href="/">Sponsors</a>
        <a href="/">Social</a>
        <a href="/">Settings</a>
      </div>

      <div className="main">
        <div className="eyebrow">Step 3 Complete</div>
        <h1>The build pipeline works.</h1>
        <p className="muted" style={{ marginTop: 12, marginBottom: 28 }}>
          If you are reading this on a Netlify URL, Next.js compiled and
          deployed successfully. Nothing here is connected to Supabase or
          Anthropic yet — that comes next.
        </p>

        <div className="card-grid">
          <div className="card">
            <div className="eyebrow">Next up</div>
            <h3>Authentication</h3>
            <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
              Supabase clients, middleware auth gate, and a login screen.
            </p>
          </div>

          <div className="card">
            <div className="eyebrow">Then</div>
            <h3>New Episode</h3>
            <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
              Paste a transcript, add guest details, generate every asset.
            </p>
          </div>

          <div className="card">
            <div className="eyebrow">After that</div>
            <h3>Generation Engine</h3>
            <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
              Anthropic routes writing show notes, emails, the Minute, and
              social posts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
