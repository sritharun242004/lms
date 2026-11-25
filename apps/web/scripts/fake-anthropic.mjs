// Local stand-in for the Anthropic Messages API, for Prompt Bot and Skills Builder end-to-end
// runs without an API key. Speaks the real wire formats: SSE for streaming, JSON for everything
// else (plain text for file analysis, JSON text for structured outputs).
// Run: node scripts/fake-anthropic.mjs (port 4010), then start the app with
//   ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=test
// FAKE_FIRST_INVALID=1 makes the first job-skill draft fail validation (exercises the retry).
// Logs only which kind of call arrived, never request text.
import http from "node:http";
import { enhanceReply, JOB_DRAFT, questionsReply } from "./fake-anthropic-shapes.mjs";

const PORT = Number(process.env.FAKE_ANTHROPIC_PORT ?? 4010);

// Same shape as a real prompt-bot-v3 reply: sections addressed to the AI, no placeholders,
// a numbered Plan, and missing details turned into clarifying questions in the Iteration request.
const ENHANCED = `## Persona
You are an experienced freelance copywriter who wins first clients through short, specific cold emails.

## Context
I am a freelance designer looking for my first paying client. I want to email small business owners who have outdated websites.

## Data
- Offer: a one-page website redesign delivered in two weeks.
- Proof: three practice projects for local cafés.

## Plan
1. Ask the clarifying questions in the Iteration request and wait for my answers.
2. Pick one specific problem with the reader's current website to open with.
3. Draft the email around the one-page redesign offer and the café projects as proof.
4. Cut it to under 150 words and check that every sentence is about the reader.
5. Write two alternative subject lines.

## Output expectations
Write one cold email under 150 words with:
- A subject line under 8 words.
- A first sentence about the reader's business, not about me.
- One low-pressure call to action: a 15-minute call.

## Iteration request
Before you write, ask me these questions and wait for my answers:
1. Which industry should the email target?
2. What tone should it have: formal, friendly or bold?
3. Is there a price or discount to mention?

Then write the email and offer two alternative subject lines.
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
  if ("skills" in props) {
    console.log("[fake] suggest");
    const ids = [...new Set([...user.matchAll(/- id: (\S+)/g)].map((m) => m[1]))];
    return {
      skills: [
        { name: "Board Update Writer", purpose: "Writes the monthly board update and deck from my notes and numbers.", fileIds: [...ids, "file_that_does_not_exist"] },
        { name: "board update writer", purpose: "A near-duplicate name, to check that names are made unique.", fileIds: ids.slice(0, 1) },
      ],
    };
  }
  if ("body" in props && !("assets" in props)) {
    const retry = user.includes("<validation_errors>");
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
