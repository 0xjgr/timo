const STYLE = `
:root { --bg: #f7f5f0; --card: #ffffff; --text: #1c1c1a; --dim: #5e5d58; --line: #dedbd2;
  --accent: #1e6b3c; --accent-soft: #e6f2ea; --stop: #b3261e; --stop-soft: #fbeae8; --wait: #8a5a00; --wait-soft: #fbf1dc; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --card: #1f1f1d; --text: #ecebe6; --dim: #a5a39b; --line: #36352f;
  --accent: #7ed39c; --accent-soft: #1a2e21; --stop: #ff8a80; --stop-soft: #3a1f1d; --wait: #f2c14e; --wait-soft: #352a12; } }
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 22px/1.45 "DejaVu Sans", system-ui, sans-serif; }
main { max-width: 480px; min-height: 100%; margin: 0 auto; padding: 24px 16px 32px; display: flex; flex-direction: column; }
.brand { font-weight: bold; letter-spacing: .05em; color: var(--dim); font-size: 16px; }
.stage { flex: 1; display: none; flex-direction: column; justify-content: center; gap: 20px; }
.stage.on { display: flex; }
h1 { font-size: 32px; line-height: 1.2; margin: 0; }
p { margin: 0; }
.dim { color: var(--dim); font-size: 18px; }
.talk { align-self: center; width: 240px; height: 240px; border-radius: 50%; border: 0; background: var(--accent); color: var(--bg);
  font-family: inherit; font-weight: bold; font-size: 28px; line-height: 1.2; cursor: pointer; padding: 24px; }
.talk.live { background: var(--stop); animation: breathe 1.6s ease-in-out infinite; }
.talk:disabled { opacity: .5; }
@keyframes breathe { 50% { transform: scale(.94); } }
.words { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 18px; font-size: 25px; overflow-wrap: anywhere; }
.pair { display: grid; gap: 12px; }
.pair button, .typed button { font-family: inherit; font-weight: bold; font-size: 24px; line-height: 1.2; padding: 20px; border-radius: 12px; cursor: pointer; }
.yes { background: var(--accent); color: var(--bg); border: 0; }
.no { background: transparent; color: var(--text); border: 2px solid var(--line); }
.typed { display: grid; gap: 10px; }
.typed textarea { font: inherit; padding: 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--text); min-height: 4.5em; }
.typed button { background: transparent; color: var(--text); border: 2px solid var(--line); }
details summary { color: var(--dim); font-size: 18px; cursor: pointer; text-align: center; }
.pulse { width: 18px; height: 18px; border-radius: 50%; background: var(--accent); animation: breathe 1.2s ease-in-out infinite; }
.verdict { border-radius: 12px; padding: 20px; }
.verdict.ok { background: var(--accent-soft); } .verdict.ok h1 { color: var(--accent); }
.verdict.stop { background: var(--stop-soft); } .verdict.stop h1 { color: var(--stop); }
.verdict.unsure { background: var(--wait-soft); } .verdict.unsure h1 { color: var(--wait); }
.asking { background: var(--wait-soft); border-radius: 12px; padding: 20px; }
.asking h1 { color: var(--wait); }
iframe { width: 100%; height: 70vh; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
.error { color: var(--stop); font-size: 18px; min-height: 1.4em; text-align: center; }
`;

// note: the page records raw pcm and writes the wav itself, because the transcribe endpoint
// takes mono 16-bit wav only and the browser's recorder gives webm or mp4
const SCRIPT = `
const RATE = 24000, MAX_MS = 30000;
const $ = (id) => document.getElementById(id);
let current = "", spoken = false, recorder = null;

const show = (kind) => document.querySelectorAll(".stage").forEach((el) => el.classList.toggle("on", el.id === kind));
const say = (text) => { if (!("speechSynthesis" in window)) return; const line = new SpeechSynthesisUtterance(text); line.lang = "en-US"; line.rate = .92; speechSynthesis.cancel(); speechSynthesis.speak(line); };
const post = (path, body, type = "application/json") => fetch(path, { method: "POST", headers: { "content-type": type }, body });

async function start() {
  const token = new URLSearchParams(location.hash.slice(1)).get("t");
  history.replaceState(null, "", "/");
  if (token) await post("/api/session", JSON.stringify({ token }));
  if (!navigator.mediaDevices) { $("talk").disabled = true; $("hint").textContent = "The microphone needs localhost or https. Type it instead."; $("type-box").open = true; }
  poll();
}

async function poll() {
  const res = await fetch("/api/state");
  if (res.status === 401) { show("locked"); return; }
  render(await res.json());
  setTimeout(poll, 1000);
}

function render(stage) {
  const key = stage.kind + (stage.said || "");
  if (key === current) return;
  current = key;
  show(stage.kind);
  if (stage.words !== undefined) document.querySelectorAll(".said-words").forEach((el) => (el.textContent = stage.words));
  if (stage.kind === "listen") { $("talk").disabled = false; $("talk").textContent = "Tap and tell Timo"; }
  if (stage.kind === "done") {
    $("verdict").className = "verdict " + stage.tone;
    $("verdict-head").textContent = { ok: "Done", stop: "Not paid", unsure: "Please check" }[stage.tone];
    $("verdict-text").textContent = stage.said;
    $("card").hidden = !stage.hasCard;
    if (stage.hasCard) $("card").src = "/card";
    if (!spoken) { spoken = true; say($("verdict-head").textContent + ". " + stage.said); }
  }
}

async function record() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const tap = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  tap.onaudioprocess = (event) => chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  source.connect(tap); tap.connect(ctx.destination);
  const timer = setTimeout(() => stop(), MAX_MS);
  const stop = async () => {
    clearTimeout(timer);
    source.disconnect(); tap.disconnect(); stream.getTracks().forEach((track) => track.stop());
    const rate = ctx.sampleRate; await ctx.close();
    return toWav(chunks, rate);
  };
  return { stop };
}

function toWav(chunks, rate) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const input = new Float32Array(total);
  let offset = 0; for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.length; }
  const length = Math.floor(total * RATE / rate);
  const view = new DataView(new ArrayBuffer(44 + length * 2));
  const text = (at, value) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const at = i * rate / RATE, low = Math.floor(at), high = Math.min(low + 1, total - 1);
    const sample = input[low] + (input[high] - input[low]) * (at - low);
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

$("talk").addEventListener("click", async () => {
  $("error").textContent = "";
  if (!recorder) {
    try { recorder = await record(); } catch { $("error").textContent = "Timo cannot use the microphone. Type it instead."; $("type-box").open = true; return; }
    $("talk").classList.add("live"); $("talk").textContent = "Listening. Tap when you are done";
    return;
  }
  const wav = await recorder.stop(); recorder = null;
  $("talk").classList.remove("live"); $("talk").disabled = true; $("talk").textContent = "One moment";
  const res = await post("/api/voice", wav, "audio/wav");
  if (!res.ok) { $("error").textContent = (await res.json()).error; $("talk").disabled = false; $("talk").textContent = "Tap and tell Timo"; return; }
  render(await res.json());
});

$("typed-send").addEventListener("click", async () => {
  const res = await post("/api/typed", JSON.stringify({ words: $("typed").value }));
  if (res.ok) render(await res.json()); else $("error").textContent = (await res.json()).error;
});
$("yes").addEventListener("click", async () => render(await (await post("/api/confirm", JSON.stringify({ isConfirmed: true }))).json()));
$("no").addEventListener("click", async () => render(await (await post("/api/confirm", JSON.stringify({ isConfirmed: false }))).json()));
start();
`;

export function renderPhone(nonce: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Timo</title><style>${STYLE}</style></head>
<body><main>
<div class="brand">TIMO</div>
<section class="stage on" id="listen">
  <h1>What should Timo do?</h1>
  <button class="talk" id="talk">Tap and tell Timo</button>
  <p class="dim" id="hint">Say it the way you would tell a person. Timo asks before it starts.</p>
  <p class="error" id="error" role="alert"></p>
  <details id="type-box"><summary>or type it</summary>
    <div class="typed"><textarea id="typed" maxlength="400" aria-label="What should Timo do"></textarea><button id="typed-send">Send to Timo</button></div>
  </details>
</section>
<section class="stage" id="heard">
  <p class="dim">Timo understood</p>
  <p class="words said-words"></p>
  <div class="pair"><button class="yes" id="yes">Yes, do it</button><button class="no" id="no">No, say it again</button></div>
</section>
<section class="stage" id="working">
  <div class="pulse"></div>
  <h1>Timo is on it</h1>
  <p class="words said-words"></p>
  <p class="dim">Timo checks every account and amount before paying. You can put the phone down.</p>
</section>
<section class="stage" id="asking">
  <div class="asking"><h1>Checking with your family</h1>
  <p>Nothing is paid until they answer.</p></div>
  <p class="words said-words"></p>
</section>
<section class="stage" id="done">
  <div class="verdict" id="verdict"><h1 id="verdict-head"></h1><p id="verdict-text"></p></div>
  <p class="dim">You asked</p>
  <p class="words said-words"></p>
  <iframe id="card" title="What Timo stopped" hidden></iframe>
</section>
<section class="stage" id="locked"><h1>Open the link Timo printed</h1></section>
</main><script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}
