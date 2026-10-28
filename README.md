# Timo

An errand agent for people who can't spot a scam, with a firewall that checks where every
payment detail came from before money moves.

In Spanish, *timo* means a scam. It is also the thymus, the organ that teaches immune
cells to tell self from foreign. Timo does the same with the values an agent types.

Work in progress, built during the Meta Global AI Developer Hackathon (Oct 26 - Nov 4, 2026).

## Vocabulary
The same words are used in the code, the UI and the video.

| Word | Meaning |
|---|---|
| errand | a task the user asks for ("pay the October power bill") |
| request | the user's transcribed words. Origin `request` |
| ledger | the household's confirmed payees: name, IBAN, domains, logo, usual amounts. Origin `ledger`. Only the guardian writes it |
| source | anything the agent read: an email, a page, a PDF, a photo. Origin `foreign` |
| origin | `request`, `ledger` or `foreign` |
| sensitive value | an IBAN, amount, beneficiary, stored secret or login URL |
| trace | the sources a normalized value appears in |
| commit | the moment a value leaves: a submit click or an outgoing POST |
| gate | the click gate and the network gate; both ask the same policy engine |
| verdict | `allow`, `ask` (the guardian) or `deny`, always with the rule that fired |
| guardian | a family member who approves `ask` verdicts and owns the ledger |
| second reader | an open-weights model that reads each source and may only escalate |
| lens | the view that colors each value by its origin |
| teach card | one screen for the user after a block: the scam that was avoided |
| driver | `screen` (computer use on screenshots) or `dom` (tools over the page) |

## Why
An agent that pays bills reads untrusted mail and pages on the way. In our first test,
a fake invoice that only swapped the IBAN made the agent pay the attacker 7 times out of 9,
and the model API's own injection check never fired: there was no instruction to detect,
only a wrong number. The loud version of the attack ("note to AI assistants") failed 0 of 9.

## Threat model
- **Assets:** money, household secrets (bank login), and the user's attention.
- **Trusted:** the user's request, the ledger, Timo's own code.
- **Untrusted:** everything the agent reads, including real mail from a known sender
  whose account was taken over.
- **The attacker can** send mail under any display name, from lookalike or compromised
  domains; host cloned portals; hide text; put values in images and QR codes; and call
  the user to dictate an IBAN.
- **Out of scope:** a compromised device or browser, the guardian's account, a malicious
  bank, the model provider, and actions that carry no sensitive value.

Properties the engine keeps:
1. A sensitive value with no trace is denied. The whole form is judged at commit, so
   rebuilding a value piece by piece does not help.
2. No model can turn a deny into an allow.
3. A new IBAN always goes to the guardian, whatever its origin, the user's own words included.
4. The ledger is never written from the agent's flow.

## Limitations
- Spoken replies use the browser's speech synthesis.
- The demo runs against a toy world with fictional brands; nothing real is paid.

## AI tools used
Listed at submission.
