# Repository Agent Rules

## 1. Spec-Driven And Test-Driven Development Rule

- Work spec-driven by default.
- Work test-driven for behavior changes: write or update the failing test/contract check before or together with implementation.
- Treat specs as living artifacts, not static background documents.
- Current behavior source of truth is:
  - committed code
  - committed specs/contracts
  - committed conformance examples/generated artifacts
- Do not let code, examples, and specs drift intentionally.
- If committed code, specs, contracts, examples, or generated artifacts disagree, treat it as a defect. Do not choose one silently.
- When a behavior or contract changes:
  - update the implementation
  - update the closest spec/contracts/examples in the same change
  - update tests/conformance checks so the alignment is machine-checked
- Prefer the loop: spec/acceptance criteria -> test/contract -> implementation -> verification.
- Prefer auto-generated or compiler-verified artifacts over manual duplicated descriptions.
- Do not make agents re-derive platform contracts from scratch each time when the repo can carry the contract explicitly.
- Refactors should be spec-guided:
  - preserve stable external behavior unless the task explicitly changes the contract
  - update the spec/examples first or together with the code
  - avoid "break and fix later" when the intended contract is already known

## 2. Repository Working Model

- Product and technical specs live in `spec/`.
- Planning, task state, notes, and durable decisions live in `PM/`.
- Before starting meaningful implementation, check:
  - the closest product spec in `spec/`
  - the relevant technical spec in `spec/technical/`
  - the active board in `PM/kanban.md`
  - the task card in `PM/tasks/`, when one exists
- If the task changes behavior, contracts, architecture, or delivery priority, update the closest spec and PM file in the same change.
- Use `PM/notes/` for temporary discovery and `PM/decisions/` for accepted decisions that should outlive a task.
