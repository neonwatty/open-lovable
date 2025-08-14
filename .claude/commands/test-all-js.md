## Context

- Test directory: "$ARGUMENTS"
- Current directory: !`pwd`

## Your task

Run Next.js tests and resolve any resulting errors.
DO NOT commit any code.
DO NOT change the version number.

Steps:
1. If directory argument provided, navigate to that directory first
2. Run appropriate test command:
   - `npm test $ARGUMENTS` (Jest/Vitest tests)
   - `npm run test:e2e $ARGUMENTS` (if e2e tests exist)
   - `npm run build` (to verify Next.js build)
3. Analyze any test failures or errors including:
   - Component test failures
   - Server component rendering issues
   - Next.js App Router specific errors
   - TypeScript compilation errors
4. Fix the underlying issues causing test failures
5. Re-run tests to verify fixes
6. Report final test status