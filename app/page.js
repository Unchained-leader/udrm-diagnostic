export default function Home() {
  return (
    <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif", maxWidth: 600, margin: "0 auto" }}>
      <h1>Unchained AI Guide</h1>
      <p>This is the API server for the Unchained AI Guide (marketing version).</p>
      <p>API endpoint: <code>/api/chat</code></p>
      <p>Chat UI: <code>/chat.html</code></p>
      <p>Status: <strong style={{ color: "green" }}>Running</strong></p>
    </div>
  );
}
