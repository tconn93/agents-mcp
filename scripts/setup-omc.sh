#!/usr/bin/env bash
set -e

# ─────────────────────────────────────────────────────────────────────────────
# setup-omc.sh — provision oh-my-claudecode (omc) for agents-mcp.
#
# omc = oh-my-claudecode  (https://github.com/Yeachan-Heo/oh-my-claudecode)
# It adds higher-level orchestration commands to Claude Code. agents-mcp can
# delegate work to these by setting a GOAL_PREFIX env var so every submitted
# task is prefixed with an omc command, e.g.:
#
#   GOAL_PREFIX="/ultrawork "   # deep, autonomous multi-step execution
#   GOAL_PREFIX="/team "        # multi-agent team-style delegation
#
# Individual tasks can also override the prefix per-call via the task_submit
# `goal_prefix` argument. The default GOAL_PREFIX is "/goal ".
# ─────────────────────────────────────────────────────────────────────────────

npm i -g oh-my-claude-sisyphus@latest
omc setup || echo "omc setup failed or requires interactive session; run '/omc-setup' inside Claude Code"
