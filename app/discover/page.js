"use client";

import { useEffect, useRef, useState } from "react";

// ─── Design Tokens ───────────────────────────────────────────────
const GOLD = "#b99c4f";
const GOLD_LIGHT = "#DFC468";
const GOLD_DARK = "#9A7730";
const GOLD_GRADIENT = "linear-gradient(135deg, #DFC468, #9A7730)";
const BG = "#000";
const SURFACE = "#0d0d0d";
const CARD_BG = "#111111";
const TEXT = "#f0f0f0";
const TEXT_MUTED = "#999";
const TEXT_DIM = "#666";
const BORDER_GOLD = "rgba(185, 156, 79, 0.3)";
const BORDER_GOLD_SUBTLE = "rgba(185, 156, 79, 0.15)";
const CONTAINER_WIDE = 1100;
const CONTAINER_NARROW = 780;
const NAV_BG = "rgba(0, 0, 0, 0.92)";

// ─── Injected CSS ────────────────────────────────────────────────
const INJECTED_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  .fade-section {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.7s ease, transform 0.7s ease;
  }
  .fade-section.visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* ── Sticky Nav ── */
  .sticky-nav {
    position: sticky;
    top: 0;
    z-index: 100;
    height: 60px;
    background: ${NAV_BG};
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid ${BORDER_GOLD_SUBTLE};
  }
  .sticky-nav-inner {
    max-width: ${CONTAINER_WIDE}px;
    margin: 0 auto;
    padding: 0 20px;
    height: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .nav-cta {
    display: inline-block;
    padding: 10px 24px;
    border-radius: 5px;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.5px;
    color: #000;
    background: ${GOLD_GRADIENT};
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .nav-cta:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(185, 156, 79, 0.3);
  }

  /* ── CTA Buttons ── */
  .discover-cta {
    display: inline-block;
    padding: 18px 52px;
    border-radius: 6px;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 0.5px;
    color: #000;
    background: ${GOLD_GRADIENT};
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .discover-cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(185, 156, 79, 0.35);
  }

  /* ── Containers ── */
  .container-wide {
    max-width: ${CONTAINER_WIDE}px;
    margin: 0 auto;
    padding: 0 20px;
  }
  .container-narrow {
    max-width: ${CONTAINER_NARROW}px;
    margin: 0 auto;
    padding: 0 20px;
  }

  /* ── Stats Bar ── */
  .stat-bar {
    display: flex;
    justify-content: center;
    gap: 64px;
  }
  .stat-item { text-align: center; }
  .stat-number {
    font-family: 'Cinzel', serif;
    font-size: 48px;
    font-weight: 700;
    color: ${GOLD_LIGHT};
    line-height: 1.1;
  }
  .stat-label {
    font-family: 'Montserrat', sans-serif;
    font-size: 13px;
    color: ${TEXT_MUTED};
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-top: 8px;
  }

  /* ── Featured In ── */
  .featured-bar {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 48px;
  }
  .featured-logo {
    font-family: 'Montserrat', sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: ${TEXT_DIM};
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  /* ── Grids ── */
  .report-cards-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .steps-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
  }

  /* ── FAQ Accordion ── */
  .faq-item {
    border-bottom: 1px solid ${BORDER_GOLD_SUBTLE};
  }
  .faq-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    padding: 22px 0;
    user-select: none;
  }
  .faq-toggle {
    font-size: 22px;
    color: ${GOLD};
    transition: transform 0.3s ease;
    flex-shrink: 0;
    margin-left: 16px;
  }
  .faq-toggle.open {
    transform: rotate(45deg);
  }
  .faq-answer {
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transition: max-height 0.35s ease, opacity 0.3s ease, padding 0.35s ease;
    padding-bottom: 0;
  }
  .faq-answer.open {
    max-height: 400px;
    opacity: 1;
    padding-bottom: 22px;
  }

  /* ── Hero Headline ── */
  .hero-headline {
    font-family: 'Cinzel', serif;
    color: ${GOLD};
    font-size: 44px;
    line-height: 1.25;
    max-width: 800px;
    margin-bottom: 24px;
    font-weight: 700;
    text-shadow: 0 0 60px rgba(185,156,79,0.15);
  }

  /* ── Responsive ── */
  @media (min-width: 640px) {
    .steps-grid { grid-template-columns: 1fr 1fr 1fr; }
    .report-cards-grid { grid-template-columns: 1fr 1fr; }
  }
  @media (min-width: 900px) {
    .report-cards-grid { grid-template-columns: 1fr 1fr 1fr; }
  }
  @media (max-width: 640px) {
    .hero-headline { font-size: 28px !important; }
    .stat-bar { flex-direction: column; gap: 32px; }
    .stat-number { font-size: 40px; }
    .featured-bar { flex-wrap: wrap; gap: 20px 28px; justify-content: center; }
    .featured-logo { font-size: 13px; }
    .nav-cta { padding: 8px 16px; font-size: 12px; }
    .discover-cta { padding: 16px 36px; font-size: 15px; }
  }
`;

// ─── Sub-components ──────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p style={{
      fontFamily: "'Cinzel', serif",
      color: GOLD,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 3,
      marginBottom: 20,
    }}>{children}</p>
  );
}

function Heading({ children, color = TEXT, size = 28 }) {
  return (
    <h2 style={{
      fontFamily: "'Cinzel', serif",
      color,
      fontSize: size,
      lineHeight: 1.35,
      marginBottom: 24,
      fontWeight: 700,
    }}>{children}</h2>
  );
}

function Body({ children }) {
  return (
    <div style={{
      fontFamily: "'Montserrat', sans-serif",
      color: "#e0e0e0",
      fontSize: 16,
      lineHeight: 1.9,
      whiteSpace: "pre-line",
    }}>{children}</div>
  );
}

function GoldCard({ icon, title, description }) {
  return (
    <div style={{
      background: CARD_BG,
      border: `1px solid ${BORDER_GOLD}`,
      borderLeft: `3px solid ${GOLD_DARK}`,
      borderRadius: 12,
      padding: "24px 28px",
    }}>
      <p style={{
        fontFamily: "'Cinzel', serif",
        color: GOLD,
        fontSize: 15,
        fontWeight: 700,
        marginBottom: 8,
        letterSpacing: 0.5,
      }}>{icon} {title}</p>
      <p style={{
        fontFamily: "'Montserrat', sans-serif",
        color: TEXT_MUTED,
        fontSize: 13,
        lineHeight: 1.6,
        margin: 0,
      }}>{description}</p>
    </div>
  );
}

function StepCard({ num, title, desc }) {
  return (
    <div style={{
      background: CARD_BG,
      border: `1px solid ${BORDER_GOLD}`,
      borderRadius: 12,
      padding: "40px 32px",
      textAlign: "center",
    }}>
      <p style={{
        fontFamily: "'Cinzel', serif",
        color: GOLD,
        fontSize: 48,
        fontWeight: 700,
        margin: "0 0 10px 0",
        lineHeight: 1,
      }}>{num}</p>
      <p style={{
        fontFamily: "'Cinzel', serif",
        color: TEXT,
        fontSize: 17,
        fontWeight: 700,
        marginBottom: 12,
      }}>{title}</p>
      <p style={{
        fontFamily: "'Montserrat', sans-serif",
        color: TEXT_MUTED,
        fontSize: 13,
        lineHeight: 1.6,
        margin: 0,
      }}>{desc}</p>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function DiscoverPage() {
  const sectionsRef = useRef([]);
  const [openFAQ, setOpenFAQ] = useState(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.12 }
    );
    sectionsRef.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const addRef = (el) => {
    if (el && !sectionsRef.current.includes(el)) {
      sectionsRef.current.push(el);
    }
  };

  const reportCards = [
    { icon: "\u{1F9E0}", title: "Arousal Template Type", description: "How your brain learned to use sexual behavior as a response to specific emotional states." },
    { icon: "\u{1F52C}", title: "Neuropathway Analysis", description: "Which of the four pathways your system runs on, and why." },
    { icon: "\u{1F517}", title: "Attachment Style", description: "How early relational patterns shaped what you reach for and when." },
    { icon: "\u{1F5FA}\uFE0F", title: "Behavior-Root Mapping", description: "Each unwanted behavior traced directly to the wound underneath it." },
    { icon: "\u{1F9E9}", title: "Confusing Patterns Decoded", description: "The contradictions that make you feel crazy, finally explained." },
    { icon: "\u2696\uFE0F", title: "Co-Coping Behaviors", description: "The \"acceptable\" behaviors connected to the same root \u2014 overwork, control, perfectionism." },
    { icon: "\u{1F30A}", title: "Life Stress Landscape", description: "How your current environment is feeding the cycle." },
    { icon: "\u{1F333}", title: "Generational Lens", description: "Patterns inherited from your family system across generations." },
    { icon: "\u{1F4AC}", title: "Relational Patterns", description: "How the wound shows up in your closest relationships." },
    { icon: "\u{1F50D}", title: "Strategy Audit", description: "Why everything you\u2019ve tried has failed \u2014 specifically." },
    { icon: "\u{1F9ED}", title: "Next-Steps Pathway", description: "A personalized path forward based on your specific root system." },
  ];

  const faqs = [
    { q: "Is this really free?", a: "Yes. Completely free. No credit card. No hidden upsell during the assessment. You take it, you get your full report." },
    { q: "How long does it take?", a: "About 5 minutes. 8 sections. All clicks, no typing required." },
    { q: "Is it private?", a: "100% private. 100% confidential. Your results are secured behind a PIN you create. We never share your information. Ever." },
    { q: "What is this exactly?", a: "The UDRM (Unwanted Desire Root Mapping) is a diagnostic assessment that maps your specific unwanted behaviors to their psychological roots. It\u2019s built on the intersection of Scripture and neuroscience." },
    { q: "Is this a therapy program?", a: "No. This is a diagnostic tool. It shows you what\u2019s driving the behavior. Think of it like an MRI for your patterns. It reveals the root system so you can see why the behavior exists." },
    { q: "What if my situation is too far gone?", a: "The complexity of your situation is not a disqualifier. Men with decades of entrenched patterns have used this assessment and seen their system clearly for the first time. The maze is only impossible from the inside." },
    { q: "Who built this?", a: "Mason Cain, PSAP, PMAP. IITAP credentialed. Unchained Leader has served 10,000+ men across 33 countries and is LegitScript certified." },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: INJECTED_CSS }} />

      <div style={{ background: BG, color: TEXT, minHeight: "100vh" }}>

        {/* ═══════════ STICKY NAV ═══════════ */}
        <nav className="sticky-nav">
          <div className="sticky-nav-inner">
            <img
              src="/images/unchained-logo.png"
              alt="Unchained Leader"
              style={{ height: 32 }}
            />
            <a href="/quiz.html" className="nav-cta">
              Take the Free Assessment
            </a>
          </div>
        </nav>

        {/* ═══════════ SECTION 1: HERO ═══════════ */}
        <section style={{
          minHeight: "calc(100vh - 60px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "60px 20px 40px",
          background: BG,
        }}>
          <h1 className="hero-headline">
            You Don&apos;t Have a Willpower Problem.{"\n"}You Have a Root Problem.
          </h1>

          <p style={{
            fontFamily: "'Montserrat', sans-serif",
            color: "#ccc",
            fontSize: 18,
            lineHeight: 1.7,
            maxWidth: 620,
            marginBottom: 40,
          }}>
            The free 5-minute assessment that maps the behavior you can&apos;t shake to the wound underneath it.
            Used by 10,000+ men across 33 countries.
          </p>

          <a href="/quiz.html" className="discover-cta">
            Take the Free Assessment
          </a>
        </section>

        {/* ═══════════ STATS BAR ═══════════ */}
        <section style={{ background: SURFACE, padding: "48px 0" }}>
          <div className="container-wide">
            <div className="stat-bar">
              <div className="stat-item">
                <div className="stat-number">10,000+</div>
                <div className="stat-label">Men Served</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">33</div>
                <div className="stat-label">Countries</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">~100</div>
                <div className="stat-label">New Men Per Week</div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════ FEATURED IN BAR ═══════════ */}
        <section style={{
          background: BG,
          padding: "32px 0",
          borderTop: `1px solid ${BORDER_GOLD_SUBTLE}`,
          borderBottom: `1px solid ${BORDER_GOLD_SUBTLE}`,
        }}>
          <div className="container-wide">
            <p style={{
              fontFamily: "'Montserrat', sans-serif",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 2,
              color: TEXT_DIM,
              textAlign: "center",
              marginBottom: 16,
            }}>As Featured In</p>
            <div className="featured-bar">
              <span className="featured-logo">Fox News</span>
              <span className="featured-logo">Reuters</span>
              <span className="featured-logo" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <img src="/legitscript-badge.png" alt="LegitScript" style={{ height: 24 }} />
                LegitScript
              </span>
              <span className="featured-logo">IITAP</span>
            </div>
          </div>
        </section>

        {/* ═══════════ SECTION 2: PAIN IDENTIFICATION ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "100px 0", background: BG }}>
          <div className="container-narrow">
            <SectionLabel>Sound Familiar?</SectionLabel>
            <Body>
{`You\u2019ve white-knuckled it. Installed the filters. Deleted the apps. Confessed again. Prayed harder. Maybe tried therapy. Maybe tried a group.

And it worked. For a while.

Then the cycle came back. The same pattern. The same shame. The same question:

\u201CWhat is wrong with me?\u201D

You\u2019re a leader. A father. A husband. A man of faith. And there is this thing you cannot shake. It contradicts everything you believe about yourself.

So you fight harder. Read another book. Try another strategy. Make another promise.

And nothing changes. Not because you\u2019re weak. Not because you don\u2019t love God enough. Not because something is broken inside you.

Nothing changes because every strategy you\u2019ve tried was aimed at the wrong target.`}
            </Body>
          </div>
        </section>

        {/* ═══════════ SECTION 3: THE REFRAME ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "100px 0", background: SURFACE }}>
          <div className="container-narrow">
            <SectionLabel>Why Nothing Has Worked</SectionLabel>
            <Heading size={30}>You&apos;ve Been Attacking the Smoke Alarm While the House Burns Underground</Heading>
            <Body>
{`The behavior is the symptom. Not the problem.

Every filter, every accountability app, every white-knuckle promise you\u2019ve made was aimed at managing the symptom. That\u2019s not a failure of effort. That\u2019s a failure of targeting.

Your brain created this behavior as a protector. Somewhere in your story, there was a wound. A lie was encoded about that wound. And your nervous system built an escape route to manage the pain of that lie.

The behavior is the escape route. It was never the enemy.

The enemy uses bait crafted from wounds you didn\u2019t choose. And he has been running the same play for years because nothing in your strategy has touched the root.

This is why willpower fails. This is why accountability alone doesn\u2019t hold. This is why prayer without understanding feels like shouting into the dark.

The problem was never your effort. It was the map.`}
            </Body>
          </div>
        </section>

        {/* ═══════════ SECTION 4: THE MAZE METAPHOR ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "100px 0", background: BG }}>
          <div className="container-narrow">
            <div style={{
              background: SURFACE,
              border: `1px solid ${BORDER_GOLD}`,
              borderRadius: 16,
              padding: "56px 40px",
              textAlign: "center",
            }}>
              <Heading color={GOLD} size={26}>
                From the Inside, It Looks Impossible.{"\n"}From Above, It&apos;s a Straight Line.
              </Heading>
              <Body>
{`Think of a maze. When you\u2019re inside it, every wall looks the same. Every turn feels random. You start to believe you\u2019ll never get out.

But someone standing above the maze can see the whole thing. Every dead end. Every loop. And the single clear path to the exit.

That\u2019s what this assessment does.

In 5 minutes, it maps the walls of your maze. Your specific behaviors, your patterns, the things that confuse you most. And it connects them to the root underneath.

Not a generic framework. Your specific system.

The complexity of your pattern is not evidence that you\u2019re beyond help. It\u2019s evidence of your assignment. The enemy doesn\u2019t waste ammunition on men with no calling.`}
              </Body>
            </div>
          </div>
        </section>

        {/* ═══════════ SECTION 5: WHAT YOUR ROOT MAP INCLUDES ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "100px 0", background: SURFACE }}>
          <div className="container-wide">
            <SectionLabel>What Your Root Map Includes</SectionLabel>
            <Heading size={30}>A 25+ Page Report Built From Your Specific Answers</Heading>

            <div className="report-cards-grid">
              {reportCards.map((card, i) => (
                <GoldCard key={i} icon={card.icon} title={card.title} description={card.description} />
              ))}
            </div>

            <p style={{
              fontFamily: "'Montserrat', sans-serif",
              color: TEXT_MUTED,
              fontSize: 13,
              textAlign: "center",
              marginTop: 28,
            }}>
              Plus an interactive dashboard where results reveal progressively as you explore them.
            </p>
          </div>
        </section>

        {/* ═══════════ SECTION 6: HOW IT WORKS ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "100px 0", background: BG }}>
          <div className="container-wide" style={{ textAlign: "center" }}>
            <SectionLabel>How It Works</SectionLabel>

            <div className="steps-grid" style={{ marginBottom: 48 }}>
              <StepCard
                num="01"
                title="Take the Assessment"
                desc="8 sections. About 5 minutes. All clicks, no typing. Select everything that applies. There are no wrong answers."
              />
              <StepCard
                num="02"
                title="Get Your Root Map"
                desc="Your personalized 25+ page report is built live from your answers. Watch it generate in real time on your private dashboard."
              />
              <StepCard
                num="03"
                title="See the Path Forward"
                desc="Your report maps every behavior to its root and gives you a clear next step. The maze finally makes sense from above."
              />
            </div>

            <a href="/quiz.html" className="discover-cta">
              Begin My Root Map
            </a>
          </div>
        </section>

        {/* ═══════════ SECTION 7: MASON'S STORY ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "100px 0", background: SURFACE }}>
          <div className="container-narrow">
            <SectionLabel>Why This Exists</SectionLabel>
            <Body>
{`My name is Mason Cain. I spent 17 years fighting this battle. I spent over $12,000 on programs, therapy, courses, books, and accountability tools.

Some of them helped. Most of them didn\u2019t. And the ones that didn\u2019t fail because they were bad. They failed because they were aimed at the wrong target.

I was managing behavior. Nobody helped me find the root.

When I finally understood what was underneath the behavior, everything changed. Not slowly. Not incrementally. The maze that had been impossibly complex from the inside became a straight line when I could finally see the whole map.

I built this assessment because I wish someone had handed it to me 17 years ago. It would have saved me a decade of pain, thousands of dollars, and the shame of believing I was the problem.

You\u2019re not the problem. You never were.`}
            </Body>

            <div style={{ marginTop: 36 }}>
              <p style={{
                fontFamily: "'Cinzel', serif",
                color: TEXT,
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 4,
              }}>Mason Cain, PSAP, PMAP</p>
              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                color: TEXT_MUTED,
                fontSize: 12,
                margin: 0,
              }}>IITAP Credentialed &nbsp;&bull;&nbsp; Founder, Unchained Leader</p>
            </div>
          </div>
        </section>

        {/* ═══════════ SECTION 8: FAQ ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "100px 0", background: BG }}>
          <div className="container-wide">
            <div style={{ maxWidth: CONTAINER_NARROW, margin: "0 auto" }}>
              <SectionLabel>Common Questions</SectionLabel>

              {faqs.map((faq, i) => (
                <div key={i} className="faq-item">
                  <div
                    className="faq-header"
                    onClick={() => setOpenFAQ(openFAQ === i ? null : i)}
                  >
                    <span style={{
                      fontFamily: "'Cinzel', serif",
                      color: GOLD,
                      fontSize: 15,
                      fontWeight: 700,
                    }}>{faq.q}</span>
                    <span className={`faq-toggle ${openFAQ === i ? "open" : ""}`}>+</span>
                  </div>
                  <div className={`faq-answer ${openFAQ === i ? "open" : ""}`}>
                    <p style={{
                      fontFamily: "'Montserrat', sans-serif",
                      color: TEXT_MUTED,
                      fontSize: 14,
                      lineHeight: 1.7,
                      margin: 0,
                    }}>{faq.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════ SECTION 9: FINAL CTA ═══════════ */}
        <section ref={addRef} className="fade-section" style={{
          padding: "120px 0 80px",
          textAlign: "center",
          background: SURFACE,
        }}>
          <div className="container-narrow">
            <Heading color={GOLD} size={32}>
              Five Minutes From Now, You Could See the Whole Map
            </Heading>

            <div style={{ maxWidth: 560, margin: "0 auto 44px" }}>
              <Body>
{`You\u2019ve spent years fighting this from the inside of the maze. Trying harder. Promising more. Carrying the weight alone.

Five minutes is all it takes to see your pattern from above. To understand why your brain does what it does. To stop asking \u201Cwhat\u2019s wrong with me\u201D and start asking the right question.

The assessment is free. It\u2019s private. And it might be the first time anything has shown you the root instead of managing the symptom.`}
              </Body>
            </div>

            <a href="/quiz.html" className="discover-cta" style={{ fontSize: 17, padding: "18px 52px" }}>
              Take the Free Assessment Now
            </a>

            <p style={{
              fontFamily: "'Montserrat', sans-serif",
              color: TEXT_DIM,
              fontSize: 12,
              marginTop: 36,
              lineHeight: 1.8,
            }}>
              100% free. 100% private. 100% confidential.
            </p>
            <p style={{
              fontFamily: "'Montserrat', sans-serif",
              color: BORDER_GOLD,
              fontSize: 12,
              marginTop: 8,
              letterSpacing: 1,
            }}>
              #liveunchained
            </p>
          </div>
        </section>

      </div>
    </>
  );
}
