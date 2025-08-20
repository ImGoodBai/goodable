#!/usr/bin/env bash
payload=$(cat)                     # STDIN 소비
cd "$CLAUDE_PROJECT_DIR" || exit 2

TSC_OUT=$(npx --no-install tsc --noEmit 2>&1)
if [ $? -ne 0 ]; then
  echo "$TSC_OUT" >&2             # Claude 에 피드백
  exit 2
fi
exit 0                             # 통과 = 조용히