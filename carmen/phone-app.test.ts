import assert from "node:assert/strict";
import { test } from "node:test";
import type { Heard } from "../voice/transcribe.ts";
import { checkWav } from "../voice/transcribe.ts";
import { openPhone } from "./phone-app.ts";

function makeWav(rate: number, channels = 1): Buffer {
  const wav = Buffer.alloc(44 + 480);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + 480, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2 * channels, 28);
  wav.writeUInt16LE(2 * channels, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(480, 40);
  return wav;
}

async function openTestPhone(hear: (wav: Buffer) => Promise<Heard>) {
  const phone = await openPhone({ port: 0, hear });
  const url = new URL(phone.url);
  const base = `${url.protocol}//${url.host}`;
  const token = new URLSearchParams(url.hash.slice(1)).get("t")!;
  let cookie = "";
  const post = (path: string, body: string | Buffer, type = "application/json") =>
    fetch(`${base}${path}`, { method: "POST", headers: { "content-type": type, cookie }, body: new Uint8Array(Buffer.from(body)) });
  const login = async () => {
    const res = await post("/api/session", JSON.stringify({ token }));
    cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  };
  const state = async () => (await fetch(`${base}/api/state`, { headers: { cookie } })).json();
  return { phone, base, post, login, state };
}

const heardBill: (wav: Buffer) => Promise<Heard> = async () => ({ ok: true, value: { words: "Timo, paga la luz de octubre", audioMs: 3000, spentUsd: 0.00015 } });

test("phone: a wrong link cannot speak for carmen", async () => {
  const { phone, base, post } = await openTestPhone(heardBill);
  try {
    assert.equal((await post("/api/session", JSON.stringify({ token: "guess" }))).status, 403);
    assert.equal((await post("/api/voice", makeWav(24_000), "audio/wav")).status, 401);
    assert.equal((await post("/api/typed", JSON.stringify({ words: "send 950 euros to lucas" }))).status, 401);
    assert.equal((await fetch(`${base}/api/state`)).status, 401);
  } finally {
    await phone.close();
  }
});

test("phone: nothing starts until carmen confirms what timo heard", async () => {
  const { phone, post, login, state } = await openTestPhone(heardBill);
  try {
    await login();
    let started = "";
    void phone.waitForWords().then((words) => (started = words));
    assert.equal((await post("/api/voice", makeWav(24_000), "audio/wav")).status, 200);
    assert.deepEqual(await state(), { kind: "heard", words: "Timo, paga la luz de octubre" });
    await post("/api/confirm", JSON.stringify({ isConfirmed: false }));
    assert.equal((await state()).kind, "listen");
    assert.equal(started, "");
    await post("/api/voice", makeWav(24_000), "audio/wav");
    await post("/api/confirm", JSON.stringify({ isConfirmed: true }));
    assert.equal(await phone.waitForWords(), "Timo, paga la luz de octubre");
    assert.equal((await state()).kind, "working");
    assert.equal((await post("/api/voice", makeWav(24_000), "audio/wav")).status, 409);
    phone.showDone("Done. Timo paid 84.20 euros to Lumen Energy.", "ok");
    assert.deepEqual(await state(), { kind: "done", words: "Timo, paga la luz de octubre", said: "Done. Timo paid 84.20 euros to Lumen Energy.", tone: "ok", hasCard: false });
    assert.ok(Math.abs(phone.readSpentUsd() - 0.0003) < 1e-9);
  } finally {
    await phone.close();
  }
});

test("phone: a failed transcription asks again and a typed request works the same", async () => {
  const { phone, post, login, state } = await openTestPhone(async () => ({ ok: false, error: "nothing heard" }));
  try {
    await login();
    assert.equal((await post("/api/voice", makeWav(24_000), "audio/wav")).status, 422);
    assert.equal((await state()).kind, "listen");
    assert.equal((await post("/api/typed", "not json")).status, 400);
    assert.equal((await post("/api/typed", JSON.stringify({ words: "Pay the Lumen bill" }))).status, 200);
    assert.deepEqual(await state(), { kind: "heard", words: "Pay the Lumen bill" });
  } finally {
    await phone.close();
  }
});

test("voice: only mono 16-bit wav at 16 or 24 khz goes to the endpoint", () => {
  assert.equal(checkWav(makeWav(24_000)), null);
  assert.equal(checkWav(makeWav(16_000)), null);
  assert.match(checkWav(makeWav(48_000)) ?? "", /48000hz/);
  assert.match(checkWav(makeWav(24_000, 2)) ?? "", /2ch/);
  assert.equal(checkWav(Buffer.from("not audio at all, just some text bytes here to pass the length")), "not a wav file");
});
