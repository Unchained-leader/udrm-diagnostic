// ═══════════════════════════════════════════════════════════════
// UNCHAINED AI GUIDE — Embeddable Chat Widget (Marketing Version)
// Paste this script tag into your page:
// <script src="https://YOUR-VERCEL-URL/widget.js"></script>
// ═══════════════════════════════════════════════════════════════

(function () {
  // ── CONFIGURATION ──
  const CHAT_URL = window.UNCHAINED_MKT_CHAT_URL || "https://unchained-leader.com/chat.html";
  const API_BASE = window.UNCHAINED_MKT_API_URL || "https://unchained-leader.com";
  const WIDGET_TITLE = "Unchained AI Guide";

  // ── STYLES ──
  const styles = document.createElement("style");
  styles.textContent = `
    #unchained-mkt-widget-btn {
      position: fixed;
      bottom: 100px;
      right: 24px;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: #000000;
      border: 3px solid #C4872E;
      cursor: pointer;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #unchained-mkt-widget-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 32px rgba(196,135,46,0.4);
    }
    #unchained-mkt-chat-panel {
      position: fixed;
      bottom: 176px;
      right: 24px;
      width: 420px;
      max-width: calc(100vw - 48px);
      height: 600px;
      max-height: calc(100vh - 200px);
      background: #000000;
      border-radius: 16px;
      border: 2px solid #C4872E;
      box-shadow: 0 8px 48px rgba(0,0,0,0.4);
      z-index: 99999;
      display: none;
      overflow: hidden;
    }
    #unchained-mkt-chat-panel.open { display: block; }
    #unchained-mkt-chat-panel iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    #unchained-mkt-close-btn {
      position: absolute;
      top: 12px;
      right: 12px;
      background: rgba(0,0,0,0.7);
      border: 1px solid #333;
      color: #C4872E;
      font-size: 20px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
      transition: background 0.2s;
    }
    #unchained-mkt-close-btn:hover { background: rgba(196,135,46,0.15); }
    @media (max-width: 480px) {
      #unchained-mkt-chat-panel {
        bottom: 0;
        right: 0;
        width: 100vw;
        height: 100vh;
        max-width: 100vw;
        max-height: 100vh;
        border-radius: 0;
      }
      #unchained-mkt-widget-btn { bottom: 90px; right: 16px; }
    }
  `;
  document.head.appendChild(styles);

  // ── BUILD HTML ──
  const btn = document.createElement("div");
  btn.id = "unchained-mkt-widget-btn";
  btn.innerHTML = `<span style="font-family:'Georgia',serif;font-size:22px;font-weight:bold;color:#C4872E;letter-spacing:1px;line-height:1;">AI</span>`;
  btn.title = WIDGET_TITLE;
  document.body.appendChild(btn);

  const panel = document.createElement("div");
  panel.id = "unchained-mkt-chat-panel";
  panel.innerHTML = `
    <button id="unchained-mkt-close-btn">&times;</button>
    <iframe src="${CHAT_URL}" title="${WIDGET_TITLE}"></iframe>
  `;
  document.body.appendChild(panel);

  // ── EVENT LISTENERS ──
  btn.addEventListener("click", () => {
    panel.classList.toggle("open");
  });

  document.getElementById("unchained-mkt-close-btn").addEventListener("click", () => {
    panel.classList.remove("open");
  });
})();
