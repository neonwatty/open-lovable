## Context

- git status: !`git status`
- Explicitly mentioned file to fix: "$ARGUMENTS"

## Your task

Run comprehensive pre-commit testing analysis by executing all three test status commands in parallel.

Steps:
1. Use the Task tool to launch three parallel agents:
   - Next.js testing analysis: Execute /test-status-js command
   - Playwright testing analysis: Execute /test-status-playwright command  
   - Manual testing analysis: Execute /test-status-manual command

2. Wait for all three analyses to complete

3. Provide a succinct summary with:
   - **STATUS**: READY/NEEDS_WORK/BLOCKED
   - **Next.js Tests Needed**: Brief list of missing test coverage (components, API routes, server actions)
   - **E2E Tests Needed**: Brief list of missing Playwright test coverage  
   - **Manual Tests**: 3-5 key manual verification steps
   - **Build Status**: Next.js build success/failure
   - **Type Errors**: TypeScript compilation issues (if any)
   - **Blockers**: Critical issues preventing commit (if any)

DO NOT commit any code.