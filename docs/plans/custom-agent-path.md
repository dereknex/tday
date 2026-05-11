- Summary: Add end-to-end custom agent path support so non-PATH installs like mise-managed Gemini can be detected, saved, and launched from Tday.

## Task

- Origin: GitHub issue #3 requests a fix for Gemini CLI installed via mise not being recognized by Tday.
- Research: `path-utils.ts` does not include mise paths; `AgentSettings.bin` already exists; `AgentInfo` does not expose `bin`; `AgentsSection` save logic drops `bin`; install actions only run `npm install -g`.
- Decisions: Solve this as per-agent custom executable path support rather than special-casing mise. Treat a configured path as externally managed and use it as the launch source of truth.
- Assumptions: Users will provide a valid absolute executable path. PATH auto-discovery remains unchanged as the fallback when no custom path is configured.

## Steps

### Step 1
- Step ID: U1
- Result: A configured custom executable path works end to end inside Tday.
- Verification: `pnpm --filter @tday/desktop test -- src/main/__tests__/agent-utils.test.ts src/main/__tests__/path-utils.test.ts` plus a manual Settings check that saves a mise-managed Gemini path, reopens the dialog, and launches Gemini from that saved path.
- Test scenarios: Gemini path under `~/.local/share/mise/.../bin/gemini` is saved and restored; a configured absolute path marks the agent available when the file exists; launching resolves the configured path instead of PATH lookup; custom-path agents do not present misleading npm install controls
- Depends on: none
