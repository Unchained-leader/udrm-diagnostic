// ═══════════════════════════════════════════════════════════════
// GoHighLevel CRM Integration
// Creates contacts, adds tags, stores notes with diagnostic data
// ═══════════════════════════════════════════════════════════════

const GHL_API_BASE = "https://services.leadconnectorhq.com";

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}

// ── Create or update a contact ──
export async function createOrUpdateContact({ email, name, phone, tags = [] }) {
  if (!process.env.GHL_API_KEY || !process.env.GHL_LOCATION_ID) {
    console.log("GHL credentials not configured — skipping CRM sync");
    return null;
  }

  const nameParts = (name || "").trim().split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  // First try to find existing contact by email
  try {
    const searchRes = await fetch(
      `${GHL_API_BASE}/contacts/search/duplicate?locationId=${process.env.GHL_LOCATION_ID}&email=${encodeURIComponent(email)}`,
      { headers: getHeaders() }
    );
    const searchData = await searchRes.json();

    if (searchData.contact && searchData.contact.id) {
      // Contact exists — update with tags
      const contactId = searchData.contact.id;
      const existingTags = searchData.contact.tags || [];
      const mergedTags = [...new Set([...existingTags, ...tags])];

      const updateRes = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({
          firstName: firstName || searchData.contact.firstName,
          lastName: lastName || searchData.contact.lastName,
          phone: phone || searchData.contact.phone,
          tags: mergedTags,
        }),
      });
      const updateData = await updateRes.json();
      console.log("GHL contact updated:", contactId);
      return contactId;
    }
  } catch (e) {
    console.log("GHL search failed, creating new contact:", e.message);
  }

  // Create new contact
  try {
    const createRes = await fetch(`${GHL_API_BASE}/contacts/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        locationId: process.env.GHL_LOCATION_ID,
        firstName,
        lastName,
        email,
        phone: phone || "",
        tags,
        source: "Root Genre Diagnostic",
      }),
    });
    const createData = await createRes.json();
    const contactId = createData.contact?.id;
    console.log("GHL contact created:", contactId);
    return contactId;
  } catch (e) {
    console.error("GHL contact creation failed:", e.message);
    return null;
  }
}

// ── Add a note to a contact (stores diagnostic data) ──
export async function addContactNote(contactId, noteBody) {
  if (!process.env.GHL_API_KEY || !contactId) return;

  try {
    await fetch(`${GHL_API_BASE}/contacts/${contactId}/notes`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ body: noteBody }),
    });
    console.log("GHL note added to contact:", contactId);
  } catch (e) {
    console.error("GHL note creation failed:", e.message);
  }
}

// ── Add tags to a contact ──
export async function addContactTags(contactId, tags) {
  if (!process.env.GHL_API_KEY || !contactId) return;

  try {
    // Get existing tags first
    const res = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
      headers: getHeaders(),
    });
    const data = await res.json();
    const existingTags = data.contact?.tags || [];
    const mergedTags = [...new Set([...existingTags, ...tags])];

    await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ tags: mergedTags }),
    });
    console.log("GHL tags added:", tags);
  } catch (e) {
    console.error("GHL tag update failed:", e.message);
  }
}

// ── Store full diagnostic conversation as a note ──
export async function storeDiagnosticData(contactId, messages, analysis) {
  if (!contactId) return;

  // Build a readable summary for the coaching team
  const userMessages = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.replace(/\[PROGRESS:\d+\]/g, "").trim())
    .filter(Boolean);

  let noteContent = `═══ ROOT GENRE DIAGNOSTIC DATA ═══\n`;
  noteContent += `Generated: ${new Date().toISOString()}\n\n`;

  if (analysis) {
    noteContent += `Root Narrative Type: ${analysis.rootNarrativeType || "N/A"}\n`;
    noteContent += `Root Statement: "${analysis.rootNarrativeStatement || "N/A"}"\n`;
    noteContent += `Neuropathway: ${analysis.neuropathway || "N/A"}\n`;
    noteContent += `Core Emotion: ${analysis.coreEmotionManaged || "N/A"}\n`;
    noteContent += `Shame Architecture: ${analysis.shameArchitecture || "N/A"}\n`;
    noteContent += `Age First Exposure: ${analysis.ageFirstExposure || "N/A"}\n`;
    noteContent += `Strategies Tried: ${analysis.strategiesCount || "N/A"}\n`;
    noteContent += `Years Fighting: ${analysis.yearsFighting || "N/A"}\n\n`;
    noteContent += `Key Insight: ${analysis.keyInsight || "N/A"}\n\n`;
  }

  noteContent += `═══ RAW CONVERSATION ═══\n`;
  for (const msg of messages) {
    const clean = msg.content
      .replace(/\[PROGRESS:\d+\]/g, "")
      .replace(/\[CRISIS_DETECTED\]/g, "")
      .replace(/\[CONTACT_CAPTURE\]/g, "")
      .replace(/\[BOOKING_CTA\]/g, "")
      .trim();
    if (clean) {
      noteContent += `\n[${msg.role === "assistant" ? "GUIDE" : "USER"}]:\n${clean}\n`;
    }
  }

  await addContactNote(contactId, noteContent);
}
