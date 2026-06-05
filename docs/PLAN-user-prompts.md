# Prompt Log — Travel AI (TAI)

Per the Trilogy "Perfect Plan" method (Step 3): every user intent recorded verbatim,
with the key decisions extracted. Audited against the bead graph before execution
(Step 3 audit) and after, to catch anything lost to context compaction.

---

### Prompt 1 — Build the next resume project
> "yes run the next resume project following the same process [Trilogy article] ...
> reference this to the tee to plan and create the best possible project with clean
> excellent factored code that would be best for recruiters"

**Key decisions:**
- Build the next un-built resume project. Chosen: **Travel AI (TAI)** — the most
  AI/ML-relevant remaining project (FastAPI + OpenAI LLM). Sibling projects
  `asl-cnn-classifier`, `aquify-atx`, `sync-fifo-formal` already exist on GitHub;
  only `travel-ai-tai` and `tempjacket-website` remain. TempJacket is a marketing
  site with a resume-vs-reality mismatch → Travel AI is the clear pick.
- Follow the Trilogy methodology "to the tee": plan-first, research primary sources,
  prompt log, dependency-aware beads, decision gates, named failure scenarios,
  tiered insights, adversarial review, compaction-survival, commit-before-execute.
- Bar: "clean excellent factored code that would be best for recruiters."
- Primary source: `~/Downloads/claude-code-project-prompts/04-travel-ai.md` (the
  exhaustive build spec — followed exactly, corrected only where env requires).

---

### Audit checklist (verify before finalizing — Trilogy Step 3)
- [x] Next un-built project selected with justification → Travel AI.
- [x] Trilogy 10-step recipe mapped to concrete artifacts (this file + PLAN-travel-ai.md).
- [x] "Best for recruiters" → README scalability section, clean commits, CI green,
      polished OpenAPI docs, honest claims (200+ users = designed-for, not measured).
- [x] Code quality bar → ruff + mypy + pytest gates encoded in beads.

### Honesty ledger (carried into README/code, like the ASL 98% caveat)
- Resume says "200+ users." That is a **design target** (stateless async, caching,
  rate limiting, pooling), not a measured load test. README "Scalability Design"
  explains the mechanisms; it does NOT claim a benchmarked 200-user run unless one
  is actually performed. A locust/k6 smoke test is optional (bead B-LOAD).
- No real `OPENAI_API_KEY` in this environment → the **mock provider** is the default
  and is what every test and the demo run against. The OpenAI path is implemented and
  unit-tested via mocking, but not exercised against the live API here. README says so.
