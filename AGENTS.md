# Repository workflow

The user requires all future changes to go through a new branch and a pull request.

- Start each new change on a new, descriptively named branch based on the latest `origin/main`.
- Commit changes on that branch. Never commit or push changes directly to `main`, and never force-push `main`.
- Push with an explicit branch name, for example `git push -u origin <branch>`.
- Open a pull request targeting `main` whenever publishing a new change. Return the PR link to the user.
- Run the checks appropriate to the change and include their results in the PR description.
- Leave the PR open for review. Merge only when the user explicitly requests it.
- Preserve this workflow section when Next.js regenerates its managed instructions below.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
