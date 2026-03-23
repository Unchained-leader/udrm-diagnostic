// ═══════════════════════════════════════════════════════════════
// UNCHAINED AI COACH — Embeddable Chat Widget
// Paste this script tag into GoHighLevel Custom Code block:
// <script src="https://unchained-ai-coach.vercel.app/widget.js"></script>
// ═══════════════════════════════════════════════════════════════

(function () {
  // ── CONFIGURATION ──
  // Change this to your deployed Vercel URL
  const API_URL = window.UNCHAINED_API_URL || "https://unchained-ai-coach.vercel.app/api/chat";
  const WIDGET_TITLE = "Unchained AI Coach";
  const WELCOME_MESSAGE = "Hey brother. I'm your Unchained AI Coach — I know every module, every framework, and every exercise in the program. Whether you need help understanding a concept, walking through an exercise, or processing a trigger right now, I'm here. What's going on?";

  // ── STYLES ──
  const styles = document.createElement("style");
  styles.textContent = `
    #unchained-widget-btn {
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
    #unchained-widget-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 32px rgba(196,135,46,0.4);
    }
    #unchained-widget-btn svg {
      width: 28px;
      height: 28px;
      fill: #C4872E;
    }
    #unchained-chat-panel {
      position: fixed;
      bottom: 176px;
      right: 24px;
      width: 400px;
      max-width: calc(100vw - 48px);
      height: 560px;
      max-height: calc(100vh - 140px);
      background: #000000;
      border-radius: 16px;
      border: 2px solid #C4872E;
      box-shadow: 0 8px 48px rgba(0,0,0,0.4);
      z-index: 99999;
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #unchained-chat-panel.open { display: flex; }
    #unchained-chat-header {
      background: #000000;
      color: #C4872E;
      border-bottom: 1px solid #C4872E;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    #unchained-chat-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #C4872E;
    }
    #unchained-chat-header span {
      font-size: 12px;
      color: #d4a854;
    }
    #unchained-chat-close {
      background: none;
      border: none;
      color: #C4872E;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    #unchained-chat-close:hover { color: #d4a854; }
    #unchained-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background: #111111;
    }
    .unchained-msg {
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
    }
    .unchained-msg.user { align-items: flex-end; }
    .unchained-msg.assistant { align-items: flex-start; }
    .unchained-msg-bubble {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.5;
      word-wrap: break-word;
      white-space: pre-wrap;
    }
    .unchained-msg.user .unchained-msg-bubble {
      background: #C4872E;
      color: #000;
      border-bottom-right-radius: 4px;
    }
    .unchained-msg.assistant .unchained-msg-bubble {
      background: #1a1a1a;
      color: #e0e0e0;
      border: 1px solid #333;
      border-bottom-left-radius: 4px;
    }
    #unchained-chat-input-area {
      display: flex;
      padding: 12px 16px;
      border-top: 1px solid #C4872E;
      background: #000000;
      flex-shrink: 0;
    }
    #unchained-chat-input {
      flex: 1;
      border: 1px solid #333;
      border-radius: 24px;
      padding: 10px 16px;
      font-size: 14px;
      outline: none;
      font-family: inherit;
      resize: none;
      max-height: 80px;
      background: #1a1a1a;
      color: #e0e0e0;
    }
    #unchained-chat-input::placeholder { color: #777; }
    #unchained-chat-input:focus { border-color: #C4872E; }
    #unchained-chat-send {
      background: #C4872E;
      color: #fff;
      border: none;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      margin-left: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.2s;
    }
    #unchained-chat-send:hover { background: #a36e22; }
    #unchained-chat-send:disabled { background: #333; cursor: not-allowed; }
    .unchained-typing {
      display: inline-flex;
      gap: 4px;
      padding: 8px 12px;
    }
    .unchained-typing span {
      width: 8px;
      height: 8px;
      background: #C4872E;
      border-radius: 50%;
      animation: unchainedBounce 1.4s infinite ease-in-out;
    }
    .unchained-typing span:nth-child(2) { animation-delay: 0.2s; }
    .unchained-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes unchainedBounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }
    @media (max-width: 480px) {
      #unchained-chat-panel {
        bottom: 0;
        right: 0;
        width: 100vw;
        height: 100vh;
        max-width: 100vw;
        max-height: 100vh;
        border-radius: 0;
      }
      #unchained-widget-btn { bottom: 90px; right: 16px; }
    }
  `;
  document.head.appendChild(styles);

  // ── BUILD HTML ──
  // Chat button
  const btn = document.createElement("div");
  btn.id = "unchained-widget-btn";
  btn.innerHTML = `<span style="font-family:'Georgia',serif;font-size:22px;font-weight:bold;color:#C4872E;letter-spacing:1px;line-height:1;">AI</span>`;
  document.body.appendChild(btn);

  // Chat panel
  const panel = document.createElement("div");
  panel.id = "unchained-chat-panel";
  panel.innerHTML = `
    <div id="unchained-chat-header">
      <div>
        <h3>${WIDGET_TITLE}</h3>
        <span>Powered by Unchained Leader RNR Methodology</span>
      </div>
      <button id="unchained-chat-close">&times;</button>
    </div>
    <div id="unchained-chat-messages"></div>
    <div id="unchained-chat-input-area">
      <textarea id="unchained-chat-input" placeholder="What's going on?" rows="1"></textarea>
      <button id="unchained-chat-send">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(panel);

  // ── STATE ──
  let messages = [];
  let isStreaming = false;

  const messagesEl = document.getElementById("unchained-chat-messages");
  const inputEl = document.getElementById("unchained-chat-input");
  const sendBtn = document.getElementById("unchained-chat-send");

  // ── FUNCTIONS ──
  function addMessage(role, content) {
    const div = document.createElement("div");
    div.className = `unchained-msg ${role}`;
    div.innerHTML = `<div class="unchained-msg-bubble">${escapeHtml(content)}</div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function showTyping() {
    const div = document.createElement("div");
    div.className = "unchained-msg assistant";
    div.id = "unchained-typing";
    div.innerHTML = `<div class="unchained-msg-bubble"><div class="unchained-typing"><span></span><span></span><span></span></div></div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById("unchained-typing");
    if (el) el.remove();
  }

  async function sendMessage() {
    const content = inputEl.value.trim();
    if (!content || isStreaming) return;

    isStreaming = true;
    sendBtn.disabled = true;
    inputEl.value = "";
    inputEl.style.height = "auto";

    // Add user message
    messages.push({ role: "user", content });
    addMessage("user", content);
    showTyping();

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          userId: window.UNCHAINED_USER_ID || null,
          userName: window.UNCHAINED_USER_NAME || null,
          currentWeek: window.UNCHAINED_CURRENT_WEEK || null,
        }),
      });

      if (!response.ok) throw new Error("API error");

      removeTyping();

      // Create assistant message bubble for streaming
      const assistantDiv = document.createElement("div");
      assistantDiv.className = "unchained-msg assistant";
      const bubble = document.createElement("div");
      bubble.className = "unchained-msg-bubble";
      assistantDiv.appendChild(bubble);
      messagesEl.appendChild(assistantDiv);

      let fullResponse = "";
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                fullResponse += parsed.text;
                // Remove [CRISIS_DETECTED] tag from display
                bubble.textContent = fullResponse.replace("[CRISIS_DETECTED]", "").trim();
                messagesEl.scrollTop = messagesEl.scrollHeight;
              }
            } catch (e) {
              // skip unparseable chunks
            }
          }
        }
      }

      messages.push({ role: "assistant", content: fullResponse.replace("[CRISIS_DETECTED]", "").trim() });
    } catch (error) {
      removeTyping();
      addMessage("assistant", "I'm having trouble connecting right now. Please try again in a moment, or reach out to your coach directly if you need immediate support.");
    }

    isStreaming = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }

  // ── EVENT LISTENERS ──
  btn.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) {
      // Show welcome message on first open
      if (messages.length === 0) {
        addMessage("assistant", WELCOME_MESSAGE);
      }
      inputEl.focus();
    }
  });

  document.getElementById("unchained-chat-close").addEventListener("click", () => {
    panel.classList.remove("open");
  });

  sendBtn.addEventListener("click", sendMessage);

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + "px";
  });
})();
