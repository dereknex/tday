# Spec: Custom Agent Path For Non-PATH Installs

## Summary

Allow each built-in agent in Tday to use a user-configured executable path so installs managed outside Tday's inherited `PATH` can still be detected and launched.

## Origin

- Source: GitHub issue [#3](https://github.com/unbug/tday/issues/3)
- Trigger: Gemini CLI installed via `mise` is present on disk but not recognized by Tday, and the current Install button does not solve that setup.

## Problem

Tday currently assumes agent CLIs are discoverable through the app process `PATH` or through the built-in npm install flow. That assumption breaks when users manage Node and global CLIs through tools like `mise`, custom symlink trees, or manual binary locations that are valid on disk but absent from Tday's inherited environment.

The backend already has a persisted `bin` field in `AgentSettings`, but the renderer does not expose or preserve it, so users cannot configure a custom executable path end to end.

## Goals

- Let users set a per-agent executable path from Settings.
- Use that path for both detection and launch.
- Preserve the configured path in `agents.json`.
- Make the UI behavior clear when an agent is externally managed instead of installed through Tday.

## Non-Goals

- Auto-detect every version manager such as `mise`, `asdf`, or custom shell activation.
- Introduce a generic per-agent environment editor.
- Redesign the full Agents settings layout.

## Decisions

- Ship a per-agent `custom executable path` flow instead of a `mise`-specific patch.
- Treat a configured path as the source of truth for detection and launch.
- Keep PATH augmentation as best-effort fallback for default installs.
- When a custom path is configured, present the agent as externally managed and avoid implying that Tday's npm Install button controls that binary.

## Acceptance Criteria

- A user can configure Gemini with an absolute executable path outside inherited `PATH`.
- After saving, the agent shows as available when that executable exists and responds to `--version`.
- Launching the agent uses the configured executable path.
- Reopening Settings keeps the configured path intact.
- The install/update/uninstall affordance no longer misleads users when the agent is configured with a custom executable path.

## Risks

- Detection code may assume a PATH lookup even when given an absolute path.
- UI persistence may silently drop `bin` if `AgentInfo` and save logic are not widened together.
- Install-state wording can become ambiguous if default npm-package metadata is still shown next to a custom path.

## Verification Surfaces

- Unit tests around agent detection and settings persistence.
- Manual validation in Settings for a configured custom path.
- `agents.json` round-trip verification for the `bin` field.
