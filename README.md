# agents-mcp

An MCP server that dispatches one-shot Claude Code tasks against managed git
projects. It clones repositories, runs Claude Code inside them, captures a rich
structured result from the stream-json event log, and (optionally) opens a pull
request for any changes a task produces.

## Setup

1. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (Postgres).
2. `npm install`
3. `npm run db:migrate` — applies `src/db/schema.sql` (idempotent; safe to re-run).
4. `npm run build && npm start` (or `npm run dev`).

See `.env.example` for all configuration options.

## Concurrency model

The server runs a scheduler with a fixed concurrency limit
(`MAX_CONCURRENT_TASKS`, default 5). Submitted tasks are inserted as `queued`
and an in-process pump claims them atomically (`FOR UPDATE SKIP LOCKED`) up to
the limit. On startup any tasks left `running` from a previous process are reset
to `failed` ("orphaned by server restart"). Each task has a hard timeout
(`TASK_TIMEOUT_MS`) after which the process is sent SIGTERM then SIGKILL.

## Task lifecycle

A task moves through `queued` → `running` → one of:

- `completed` — finished successfully.
- `failed` — non-zero exit, spawn error, timeout, or cancellation.
- `needs_input` — finished cleanly but the final message ends with a question.
  `task_check` surfaces `needs_reply: true` and the `question`. Resume it with
  `task_reply`.

## Rich results (stream-json)

Claude Code is run with `--output-format stream-json --verbose`. The full JSONL
log is written to `<PROJECTS_BASE_DIR>/.task-outputs/<task_id>.txt` and stored in
the task's `output` column. The event stream is parsed into a structured
`result` (JSONB) containing:

- `summary` — the final result text.
- `thinking` — reasoning blocks.
- `tool_calls` — each tool use with its input and (normalized) result.
- `file_changes` — base/head SHA, changed file list, diff stat, and patch
  (truncated past `MAX_PATCH_BYTES`).
- `num_turns`, `cost_usd`, `duration_ms`, `subtype`.

## Auto-PR flow

When `AUTO_PR` is enabled (default) and a successful task produced file changes,
the server stages everything, creates a branch `agents-mcp/task-<id8>`, commits,
and pushes to `origin`. It then tries `gh pr create`; if `gh` is unavailable it
falls back to a GitHub compare URL parsed from the `origin` remote (SSH or HTTPS).
The resulting PR or compare URL is stored on the task as `pr_url`. PRs are never
opened for `needs_input` results. Use SSH clones (or a configured `gh` auth) so
pushes succeed non-interactively.

## /goal prefix and omc delegation

Every prompt is prefixed with `GOAL_PREFIX` (default `/goal `). This integrates
with [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (omc),
which adds orchestration commands. Set `GOAL_PREFIX="/ultrawork "` or
`"/team "` to delegate every task to those workflows, or override per-call via
the `task_submit` `goal_prefix` argument. Run `scripts/setup-omc.sh` to install
omc.

## Question / reply flow

If a task ends with a clarifying question it lands in `needs_input`. Send your
answer with `task_reply` — this resumes the same Claude Code session
(`--resume <session_id>`) with your message and re-runs the post-task pipeline
(including a possible auto-PR). Poll `task_check` again afterwards.

## Tools

### Projects
- `project_setup` — clone a repo and set up a project (env vars optional).
- `project_status` — check whether a project is ready.
- `project_list` — list projects.
- `project_remove` — delete local files and DB records.
- `project_set_env` / `project_get_env` — manage stored env vars.

### Tasks
- `task_submit` `{ project_name, prompt, goal_prefix? }` — queue a task.
- `task_check` `{ task_id }` — poll status / fetch the structured result.
- `task_list` `{ project_name? }` — list tasks.
- `task_reply` `{ task_id, message }` — resume a session (answer a question or
  continue a completed task).
- `task_cancel` `{ task_id }` — terminate a running task.
- `task_logs` `{ task_id, tail_lines? }` — fetch the raw stream-json log
  (last 200 lines by default).

### GitHub / git
- `project_diff` `{ name }` — staged diff of the working tree (files, stat, patch).
- `github_branch` `{ name, branch }` — create/switch a branch.
- `github_commit_push` `{ name, message, branch? }` — commit all changes, and
  push if a branch is given.
- `github_open_pr` `{ name, title, body, base?, branch? }` — open a PR via `gh`
  or return a compare URL fallback.

### Server
- `server_status` — scheduler stats: max concurrency, running/queued counts,
  free capacity, and active task IDs.
