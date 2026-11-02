import assert from "node:assert/strict";
import { test } from "node:test";
import { stripActive } from "./write-attacks.ts";

test("the attacker's mail keeps its text and loses everything that runs or submits", () => {
  const body = `<p onclick="pay()">Dear Carmen</p><script>fetch("/bank/transfer")</script><form action="http://bancosol.es/bank/transfer"><input name="iban"></form>
<a href="javascript:alert(1)">pay</a><img src="x" onerror="go()"><p style="color:#bbb">fine print</p>`;
  const clean = stripActive(body);
  assert.match(clean, /Dear Carmen/);
  assert.match(clean, /style="color:#bbb"/);
  for (const banned of ["onclick", "<script", "<form", "<input", "javascript:", "<img", "onerror"]) assert.ok(!clean.includes(banned), banned);
});
