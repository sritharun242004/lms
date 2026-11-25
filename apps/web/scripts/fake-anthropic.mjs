// Local stand-in for the Anthropic Messages API, for Prompt Bot end-to-end runs
// without an API key. Speaks the real wire formats: SSE for streaming, JSON text
// for structured outputs. Run: node scripts/fake-anthropic.mjs (port 4010), then
// start the app with ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=test.
import http from "node:http";

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

function scoreFor(user) {
  const questions = [...user.matchAll(/- id: (\S+)\n {2}question: (.*)\n/g)];
  const written = user.split("<text>")[1] ?? "";
  return questions.map(([, id, q]) => ({
    questionId: id,
    score: written.includes(q) ? 3 : 1,
    reason: written.includes(q) ? "Answered with specifics" : "Only hinted at in the prompt",
  }));
}

const VALID_DRAFT = {
  name: "ignored-by-the-server",
  description:
    'Drafts the monthly board update from rough notes: numbers first, "no surprises" tone. Use when asked for a board update, an investor update or a monthly summary.',
  compatibility: "",
  body:
    "# Board update writer\n\nRead `references/company-context.md` before writing, because the board expects the same framing every month.\n\n1. Ask for this month's numbers if they are missing.\n2. Run `scripts/word_count.py` on the draft and keep it under 400 words.\n",
  references: [{ path: "company-context.md", content: "# Company context\n\n[Add your company's tone of voice here]\n" }],
  scripts: [{ path: "scripts/word_count.py", content: "import sys\nprint(len(sys.stdin.read().split()))\n", purpose: "Counts the words in a draft read from standard input." }],
  assets: [],
};

// Skills Builder shapes, recognised by the JSON schema the app sends.
// FAKE_FIRST_INVALID=1 makes the first generate call fail validation (exercises the retry).
function skillsStructured(props, user) {
  if ("customSkills" in props) {
    console.log("[fake] split");
    return {
      customSkills: [
        { name: "Board Update Writer", purpose: "Drafts the monthly board update from my notes." },
        { name: "board update writer", purpose: "A duplicate name, to check that names are made unique." },
      ],
      catalogMatches: [
        { slug: "impeccable", why: "Polishes the dashboards you review every week." },
        { slug: "not-in-the-catalog", why: "Must be dropped." },
      ],
    };
  }
  if ("body" in props) {
    const retry = user.includes("<validation_errors>");
    console.log(`[fake] generate${retry ? " (retry)" : ""}`);
    return process.env.FAKE_FIRST_INVALID && !retry ? { ...VALID_DRAFT, description: "Uses <angle> brackets" } : VALID_DRAFT;
  }
  return null;
}

function structured(system, user) {
  if (system.includes("assess how well")) return { scores: scoreFor(user) };
  return { note: "unknown structured request" };
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      if (!req.url?.startsWith("/v1/messages")) {
        res.writeHead(404).end();
        return;
      }
      const body = JSON.parse(raw || "{}");
      const system = typeof body.system === "string" ? body.system : JSON.stringify(body.system ?? "");
      const first = body.messages?.[0]?.content;
      const user = typeof first === "string" ? first : JSON.stringify(first ?? "");
      const model = body.model ?? "claude-haiku-4-5";
      const id = `msg_fake_${Date.now()}`;
      if (body.stream) {
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
      const props = body.output_config?.format?.schema?.properties ?? {};
      const payload = skillsStructured(props, user) ?? structured(system, user);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id, type: "message", role: "assistant", model,
          content: [{ type: "text", text: JSON.stringify(payload) }],
          stop_reason: "end_turn", stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 80 },
        }),
      );
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fake anthropic on http://127.0.0.1:${PORT}`));
