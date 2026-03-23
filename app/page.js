export default function Home() {
  return (
    <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif", maxWidth: 600, margin: "0 auto" }}>
      <h1>Unchained AI Coach</h1>
      <p>This is the API server. The chat widget is embedded in your GoHighLevel membership area.</p>
      <p>API endpoint: <code>/api/chat</code></p>
      <p>Status: <strong style={{ color: "green" }}>Running</strong></p>
    </div>
  );
}
