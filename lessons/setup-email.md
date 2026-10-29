Subject: Austin Tech Week, the "software factory" workshop: setup before Thursday, October 29

Hi,

thanks for signing up for the workshop "Build a real agentic SDLC platform from scratch".
See you on Thursday, October 29, at 1:00 PM on the 16th floor of Antone's, 701 Brazos St.

We have 120 minutes and I want us to spend them building, not installing. So I ask for one thing
before the workshop: the setup, about 20 minutes, best at home and not on conference Wi-Fi.
Everything runs in GitHub Codespaces on your fork, in the browser. Nothing to install.

1. Fork https://github.com/ArturSkowronski/tech-week-austin-agentic-sdlc
2. On the fork: Settings → General → Features → tick Issues.
3. On the fork: Code → Codespaces → Create codespace on main (a 4-core machine).
4. In the codespace's terminal: factory start (about 10 minutes), then factory doctor. Everything should be green.

Codespaces is free for GitHub Free accounts: 120 core-hours a month, which is 30 hours on a 4-core
machine. Without a card on file GitHub simply blocks usage when the quota runs out; it does not send a bill.

What we will do: we build a software factory in ten lessons, commit by commit. People write
specifications and scenarios, agents write code, and the factory decides what to accept without a
human, what to send back for rework, and when to stop the line. All on open-source projects: kagent
orchestrates the agents, Argo Workflows runs the line, Kyverno guards the declarations, cosign signs
the ledger, Jaeger shows the traces. Inside is Hobby Wizard, a browser platformer in TypeScript by
VirtusLab, with its real git history, its ADRs and one incident that comes back during the workshop.

Bring:

- a browser logged in to GitHub, with your codespace ready,
- a GitHub account. You get a model key in the room.

If factory doctor is red and you do not know why, reply to this email with the output.

See you there,
Artur
