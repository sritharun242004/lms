// Local stand-in for the Anthropic Messages API, for Prompt Bot end-to-end runs
// without an API key. Speaks the real wire formats: SSE for streaming, JSON text
// for structured outputs. Run: node scripts/fake-anthropic.mjs (port 4010), then
// start the app with ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=test.
import http from "node:http";

const PORT = Number(process.env.FAKE_ANTHROPIC_PORT ?? 4010);

const ENHANCED = `## Persona
You are an experienced freelance copywriter who has won first clients through cold outreach.

## Context
The person wants to win their first client with a cold email to [target audience].

## Data
- Offer: [service and outcome]
- Proof: [portfolio link]

## Output expectations
Write one cold email under [word limit] words in a [tone] voice with a low-pressure call to action.

## Iteration request
Offer two subject lines and ask what to adjust.

## Examples
[paste an email you like]
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

function structured(system, user) {
  if (system.includes("classify what kind of task")) return { slug: "writing", confidence: 0.9 };
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
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id, type: "message", role: "assistant", model,
          content: [{ type: "text", text: JSON.stringify(structured(system, user)) }],
          stop_reason: "end_turn", stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 80 },
        }),
      );
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fake anthropic on http://127.0.0.1:${PORT}`));
