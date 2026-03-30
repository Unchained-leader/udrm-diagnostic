"use client";

import { useEffect, useRef } from "react";

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

// ─── Responsive Style Injection ──────────────────────────────────
const INJECTED_CSS = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .fade-section {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.7s ease, transform 0.7s ease;
  }
  .fade-section.visible {
    opacity: 1;
    transform: translateY(0);
  }
  .discover-cta {
    display: inline-block;
    padding: 16px 40px;
    border-radius: 6px;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 15px;
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
  .discover-container {
    max-width: 720px;
    margin: 0 auto;
    padding: 0 20px;
  }
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
  @media (min-width: 640px) {
    .report-cards-grid { grid-template-columns: 1fr 1fr; }
    .steps-grid { grid-template-columns: 1fr 1fr 1fr; }
  }
`;

// ─── Sub-components ──────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p style={{
      fontFamily: "'Cinzel', serif",
      color: GOLD,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 2.5,
      marginBottom: 20,
    }}>{children}</p>
  );
}

function Heading({ children, color = TEXT, size = 26 }) {
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
      fontSize: 15,
      lineHeight: 1.85,
      whiteSpace: "pre-line",
    }}>{children}</div>
  );
}

function GoldCard({ title, description }) {
  return (
    <div style={{
      background: CARD_BG,
      border: `1px solid ${BORDER_GOLD}`,
      borderRadius: 12,
      padding: "18px 20px",
    }}>
      <p style={{
        fontFamily: "'Cinzel', serif",
        color: GOLD,
        fontSize: 13,
        fontWeight: 700,
        marginBottom: 6,
        letterSpacing: 0.5,
      }}>{title}</p>
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
      padding: "28px 24px",
      textAlign: "center",
    }}>
      <p style={{
        fontFamily: "'Cinzel', serif",
        color: GOLD,
        fontSize: 36,
        fontWeight: 700,
        margin: "0 0 8px 0",
      }}>{num}</p>
      <p style={{
        fontFamily: "'Cinzel', serif",
        color: TEXT,
        fontSize: 15,
        fontWeight: 700,
        marginBottom: 10,
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

function FAQ({ q, a }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{
        fontFamily: "'Cinzel', serif",
        color: GOLD,
        fontSize: 14,
        fontWeight: 700,
        marginBottom: 6,
      }}>{q}</p>
      <p style={{
        fontFamily: "'Montserrat', sans-serif",
        color: TEXT_MUTED,
        fontSize: 14,
        lineHeight: 1.7,
        margin: 0,
      }}>{a}</p>
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      width: 60,
      height: 1,
      background: BORDER_GOLD,
      margin: "60px auto",
    }} />
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function DiscoverPage() {
  const sectionsRef = useRef([]);

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

  // Report feature cards data
  const reportCards = [
    { title: "Arousal Template Type", description: "How your brain learned to use sexual behavior as a response to specific emotional states." },
    { title: "Neuropathway Analysis", description: "Which of the four pathways your system runs on, and why." },
    { title: "Attachment Style", description: "How early relational patterns shaped what you reach for and when." },
    { title: "Behavior-Root Mapping", description: "Each unwanted behavior traced directly to the wound underneath it." },
    { title: "Confusing Patterns Decoded", description: "The contradictions that make you feel crazy, finally explained." },
    { title: "Co-Coping Behaviors", description: "The \"acceptable\" behaviors connected to the same root \u2014 overwork, control, perfectionism." },
    { title: "Life Stress Landscape", description: "How your current environment is feeding the cycle." },
    { title: "Generational Lens", description: "Patterns inherited from your family system across generations." },
    { title: "Relational Patterns", description: "How the wound shows up in your closest relationships." },
    { title: "Strategy Audit", description: "Why everything you\u2019ve tried has failed \u2014 specifically." },
    { title: "Next-Steps Pathway", description: "A personalized path forward based on your specific root system." },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: INJECTED_CSS }} />

      <div style={{ background: BG, color: TEXT, minHeight: "100vh" }}>

        {/* ═══════════ SECTION 1: HERO ═══════════ */}
        <section style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "60px 20px 40px",
        }}>
          <img
            src="/images/unchained-logo.png"
            alt="Unchained Leader"
            style={{ height: 56, marginBottom: 48 }}
          />

          <h1 style={{
            fontFamily: "'Cinzel', serif",
            color: GOLD,
            fontSize: 30,
            lineHeight: 1.3,
            maxWidth: 640,
            marginBottom: 24,
            fontWeight: 700,
          }}>
            You Don&apos;t Have a Willpower Problem.{"\n"}You Have a Root Problem.
          </h1>

          <p style={{
            fontFamily: "'Montserrat', sans-serif",
            color: "#ccc",
            fontSize: 16,
            lineHeight: 1.7,
            maxWidth: 540,
            marginBottom: 36,
          }}>
            The free 5-minute assessment that maps the behavior you can&apos;t shake to the wound underneath it.
            Used by 10,000+ men across 33 countries.
          </p>

          <a href="/quiz.html" className="discover-cta">
            Take the Free Assessment
          </a>

          <p style={{
            fontFamily: "'Montserrat', sans-serif",
            color: TEXT_DIM,
            fontSize: 11,
            letterSpacing: 0.5,
            marginTop: 48,
            maxWidth: 520,
          }}>
            IITAP Credentialed &nbsp;&middot;&nbsp; LegitScript Certified &nbsp;&middot;&nbsp; Featured in Fox News &amp; Reuters &nbsp;&middot;&nbsp; 10,000+ Men &nbsp;&middot;&nbsp; 33 Countries
          </p>
        </section>

        {/* ═══════════ SECTION 2: PAIN IDENTIFICATION ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "80px 0" }}>
          <div className="discover-container">
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

        <Divider />

        {/* ═══════════ SECTION 3: THE REFRAME ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "80px 0" }}>
          <div className="discover-container">
            <SectionLabel>Why Nothing Has Worked</SectionLabel>
            <Heading>You&apos;ve Been Attacking the Smoke Alarm While the House Burns Underground</Heading>
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

        <Divider />

        {/* ═══════════ SECTION 4: THE MAZE METAPHOR ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "80px 0" }}>
          <div className="discover-container">
            <div style={{
              background: SURFACE,
              border: `1px solid ${BORDER_GOLD}`,
              borderRadius: 16,
              padding: "48px 32px",
              textAlign: "center",
            }}>
              <Heading color={GOLD} size={22}>
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

        <Divider />

        {/* ═══════════ SECTION 5: WHAT YOUR ROOT MAP INCLUDES ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "80px 0" }}>
          <div className="discover-container">
            <SectionLabel>What Your Root Map Includes</SectionLabel>
            <Heading>A 25+ Page Report Built From Your Specific Answers</Heading>

            <div className="report-cards-grid">
              {reportCards.map((card, i) => (
                <GoldCard key={i} title={card.title} description={card.description} />
              ))}
            </div>

            <p style={{
              fontFamily: "'Montserrat', sans-serif",
              color: TEXT_MUTED,
              fontSize: 13,
              textAlign: "center",
              marginTop: 24,
            }}>
              Plus an interactive dashboard where results reveal progressively as you explore them.
            </p>
          </div>
        </section>

        <Divider />

        {/* ═══════════ SECTION 6: HOW IT WORKS ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "80px 0" }}>
          <div className="discover-container" style={{ textAlign: "center" }}>
            <SectionLabel>How It Works</SectionLabel>

            <div className="steps-grid" style={{ marginBottom: 40 }}>
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

        <Divider />

        {/* ═══════════ SECTION 7: MASON'S STORY ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "80px 0" }}>
          <div className="discover-container">
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

            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 20,
              alignItems: "center",
              marginTop: 32,
              paddingTop: 24,
              borderTop: `1px solid ${BORDER_GOLD}`,
            }}>
              <img
                src="/legitscript-badge.png"
                alt="LegitScript Certified"
                style={{ height: 40 }}
              />
              <span style={{ fontFamily: "'Montserrat', sans-serif", color: TEXT_DIM, fontSize: 12 }}>
                10,000+ men across 33 countries
              </span>
              <span style={{ fontFamily: "'Montserrat', sans-serif", color: TEXT_DIM, fontSize: 12 }}>
                ~100 new men start every week
              </span>
              <span style={{ fontFamily: "'Montserrat', sans-serif", color: TEXT_DIM, fontSize: 12 }}>
                Featured in Fox News, Reuters
              </span>
            </div>
          </div>
        </section>

        <Divider />

        {/* ═══════════ SECTION 8: FAQ ═══════════ */}
        <section ref={addRef} className="fade-section" style={{ padding: "80px 0" }}>
          <div className="discover-container">
            <SectionLabel>Common Questions</SectionLabel>

            <FAQ
              q="Is this really free?"
              a="Yes. Completely free. No credit card. No hidden upsell during the assessment. You take it, you get your full report."
            />
            <FAQ
              q="How long does it take?"
              a="About 5 minutes. 8 sections. All clicks, no typing required."
            />
            <FAQ
              q="Is it private?"
              a="100% private. 100% confidential. Your results are secured behind a PIN you create. We never share your information. Ever."
            />
            <FAQ
              q="What is this exactly?"
              a="The UDRM (Unwanted Desire Root Mapping) is a diagnostic assessment that maps your specific unwanted behaviors to their psychological roots. It's built on the intersection of Scripture and neuroscience."
            />
            <FAQ
              q="Is this a therapy program?"
              a="No. This is a diagnostic tool. It shows you what's driving the behavior. Think of it like an MRI for your patterns. It reveals the root system so you can see why the behavior exists."
            />
            <FAQ
              q="What if my situation is too far gone?"
              a="The complexity of your situation is not a disqualifier. Men with decades of entrenched patterns have used this assessment and seen their system clearly for the first time. The maze is only impossible from the inside."
            />
            <FAQ
              q="Who built this?"
              a="Mason Cain, PSAP, PMAP. IITAP credentialed. Unchained Leader has served 10,000+ men across 33 countries and is LegitScript certified."
            />
          </div>
        </section>

        <Divider />

        {/* ═══════════ SECTION 9: FINAL CTA ═══════════ */}
        <section ref={addRef} className="fade-section" style={{
          padding: "100px 0 60px",
          textAlign: "center",
        }}>
          <div className="discover-container">
            <Heading color={GOLD} size={24}>
              Five Minutes From Now, You Could See the Whole Map
            </Heading>

            <div style={{ maxWidth: 540, margin: "0 auto 40px" }}>
              <Body>
{`You\u2019ve spent years fighting this from the inside of the maze. Trying harder. Promising more. Carrying the weight alone.

Five minutes is all it takes to see your pattern from above. To understand why your brain does what it does. To stop asking \u201Cwhat\u2019s wrong with me\u201D and start asking the right question.

The assessment is free. It\u2019s private. And it might be the first time anything has shown you the root instead of managing the symptom.`}
              </Body>
            </div>

            <a href="/quiz.html" className="discover-cta" style={{ fontSize: 16, padding: "18px 48px" }}>
              Take the Free Assessment Now
            </a>

            <p style={{
              fontFamily: "'Montserrat', sans-serif",
              color: TEXT_DIM,
              fontSize: 12,
              marginTop: 32,
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
