// Local stand-in for the Anthropic Messages API, for Prompt Bot and Skills Builder end-to-end
// runs without an API key. Speaks the real wire formats: SSE for streaming, JSON for everything
// else (plain text for file analysis, JSON text for structured outputs).
// Run: node scripts/fake-anthropic.mjs (port 4010), then start the app with
//   ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=test
// FAKE_FIRST_INVALID=1 makes the first job-skill draft fail validation (exercises the retry).
// Logs only which kind of call arrived, never request text.
import http from "node:http";
import { enhanceReply, JOB_DRAFT, pluginSuggestionReply, questionsReply, subSkillDraft, subSkillName } from "./fake-anthropic-shapes.mjs";

const PORT = Number(process.env.FAKE_ANTHROPIC_PORT ?? 4010);

// Same shape as a real prompt-bot-v4 reply: an elaborate prose prompt with Persona, Context,
// Data/Details, Plan and Instructions; key facts in bold, inline-numbered details, no placeholders,
// and missing details turned into clarifying questions in the Instructions.
const ENHANCED = `## Persona
You are an **expert B2B copywriter with 15 years of experience**, 8 of them writing direct-response campaigns for design and web agencies. For the last 5 years you have specialised in **cold emails that help freelancers win their first clients**, and you know how to open with the reader's problem, keep every sentence about them, and earn a reply without sounding like a sales pitch.

## Context
I am a **freelance designer looking for my first paying client**. I am reaching out to **small business owners whose websites are outdated**: their sites still work, but they look old, are hard to use on a phone and do not show how good the business really is.

I want a short email that feels personal rather than mass-produced, shows that I have actually looked at their website, and makes it easy for them to say yes to a quick conversation.

## Data/Details
My offer is **a one-page website redesign delivered in two weeks**. As proof of my work I can point to **three practice projects for local cafés**, such as 1) a refreshed menu and opening-hours page, 2) a clearer layout for mobile visitors and 3) a simple contact and booking section. The email should be **under 150 words**, with a subject line under 8 words and one low-pressure call to action: **a 15-minute call**.

## Plan
1. Ask me the clarifying questions below and wait for my answers.
2. Pick one specific problem with the reader's current website to open with.
3. Draft the email around the one-page redesign offer, with the café projects as proof.
4. Cut it to under 150 words and check that every sentence is about the reader.
5. Write two alternative subject lines.

## Instructions
Please help me **win my first client with a cold email** to a small business owner with an outdated website. Before you write anything, ask me which industry the email should target, what tone it should have (formal, friendly or bold), and whether there is a price or discount to mention, then wait for my answers. Let's start by writing **one cold email under 150 words**, followed by two alternative subject lines.
`;

// The six sections ANALYSE_SYSTEM asks for, with real hex values.
const ANALYSIS = `## Colours
- Primary navy \`#1F4E79\` for titles and chart series one.
- Accent orange \`#E07A1F\` for highlights and call-outs.
- Background white \`#FFFFFF\`, body text near-black \`#1A1A1A\`.

## Fonts
- Headings: Montserrat, bold.
- Body: Source Sans Pro, 11–18 pt.

## Layout
16:9 slides (13.33 × 7.5 in). Layouts used: Title Slide, Title and Content, Two Content.

## Structure
Title slide, then one slide per topic: revenue and runway (chart), hiring plan (table).

## Tone and content
Numbers first, short bullet points, no surprises.

## Reusing this file
Start from the original file and reuse its master and layouts instead of recreating the design.
`;

function scoreFor(user) {
  const questions = [...user.matchAll(/- id: (\S+)\n {2}question: (.*)\n/g)];
  const written = user.split("<text>")[1] ?? "";
  return questions.map(([, id, q]) => ({
    questionId: id,
    score: written.includes(q) ? 3 : 1,
    reason: written.includes(q) ? "Answered with specifics" : "Only hinted at in the prompt",
  }));
}

/** The job-skill draft (see fake-anthropic-shapes.mjs): its body carries its own "Before you start" section. */
const VALID_JOB_DRAFT = JOB_DRAFT;

/** Every block type in the first user message, so analysis calls can be told apart without reading their text. */
function blockTypes(content) {
  return Array.isArray(content) ? content.map((block) => block?.type).filter((type) => typeof type === "string") : ["text"];
}

/** The text the app wrote into the first user message (string content, or the text blocks of an array). */
function userText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

// Skills Builder shapes, recognised by the JSON schema the app sends.
function skillsStructured(props, user) {
  if ("brief" in props) {
    console.log("[fake] enhance-task");
    return { brief: enhanceReply(user).brief };
  }
  if ("questions" in props && "perUseInputs" in props) {
    const { kind, regenerate, reply } = questionsReply(user);
    console.log(`[fake] questions ${kind}${regenerate ? " (regenerate)" : ""}`);
    return reply;
  }
  if ("main" in props && "subSkills" in props) {
    const { kind, reply } = pluginSuggestionReply(user);
    console.log(`[fake] suggest-plugin ${kind}`);
    return reply;
  }
  if ("body" in props && !("assets" in props)) {
    const retry = user.includes("<validation_errors>");
    const sub = subSkillName(user);
    if (sub) {
      console.log(`[fake] generate sub ${sub}${retry ? " (retry)" : ""}`);
      return subSkillDraft(sub);
    }
    console.log(`[fake] generate${retry ? " (retry)" : ""}`);
    return process.env.FAKE_FIRST_INVALID && !retry ? { ...VALID_JOB_DRAFT, description: "Uses <angle> brackets, which the validator rejects" } : VALID_JOB_DRAFT;
  }
  return null;
}

function structured(system, user) {
  if (system.includes("assess how well")) {
    console.log("[fake] score");
    return { scores: scoreFor(user) };
  }
  return { note: "unknown structured request" };
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function message(res, id, model, text, outputTokens) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id, type: "message", role: "assistant", model,
      content: [{ type: "text", text }],
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: outputTokens },
    }),
  );
}

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
        res.writeHead(404).end();
        return;
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        res.writeHead(400).end();
        return;
      }
      const system = typeof body.system === "string" ? body.system : JSON.stringify(body.system ?? "");
      const first = body.messages?.[0]?.content;
      const user = userText(first);
      const model = body.model ?? "claude-haiku-4-5";
      const id = `msg_fake_${Date.now()}`;

      if (body.stream) {
        console.log("[fake] enhance");
        res.writeHead(200, { "content-type": "text/event-stream" });
        send(res, "message_start", {
          type: "message_start",
          message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } },
        });
        send(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
        for (const piece of ENHANCED.match(/.{1,12}/gs) ?? []) {
          send(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: piece } });
          await new Promise((r) => setTimeout(r, 15));
        }
        send(res, "content_block_stop", { type: "content_block_stop", index: 0 });
        send(res, "message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 180 } });
        send(res, "message_stop", { type: "message_stop" });
        res.end();
        return;
      }

      // File analysis: plain text reply (no output_config.format); the block types say what was sent.
      if (system.includes("style guide") && !body.output_config?.format) {
        const types = blockTypes(first);
        const kind = types.includes("document") ? "pdf" : types.includes("image") ? "image" : "text";
        console.log(`[fake] analyse ${kind}`);
        await new Promise((r) => setTimeout(r, 400)); // long enough for the UI to show "Analysing…"
        message(res, id, model, ANALYSIS, 300);
        return;
      }

      const props = body.output_config?.format?.schema?.properties ?? {};
      const payload = skillsStructured(props, user) ?? structured(system, user);
      message(res, id, model, JSON.stringify(payload), 80);
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fake anthropic on http://127.0.0.1:${PORT}`));
