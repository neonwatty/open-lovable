## Context

- git status: !`git status`
- Explicitly mentioned file to fix: "$ARGUMENTS"

## Your task

Analyze git changes and generate automated test ideas for Next.js/React/shadcn/ui code.

Steps:
1. Focus primarily on files shown in git status output and any explicitly mentioned files
2. Run `git diff` on the emphasized files to see actual changes 
3. Check existing test coverage by examining relevant test files in `__tests__/`, `test/`, or `*.test.js/ts` files
4. Analyze the changes to understand:
   - New Next.js pages, layouts, or route handlers
   - Server Components vs Client Components
   - React components or hooks added/modified
   - Modified component logic or behavior
   - New utility functions or services
   - Next.js API routes or middleware changes
   - shadcn/ui component customizations
   - State management changes (Zustand, Context, etc.)
   - Server actions or form handling
5. Generate specific automated test cases that cover gaps in existing coverage:
   - Server Component tests (SSR rendering, data fetching)
   - Client Component tests (rendering, props, user interactions)
   - Next.js API route tests (request/response handling)
   - Hook tests (custom hooks, state changes)
   - Unit tests for utilities, services, or helper functions
   - Integration tests (API calls, component interactions)
   - Accessibility tests for shadcn/ui components
   - Server action tests (form submissions, mutations)
   - Edge cases and error conditions
6. Write actual JavaScript/TypeScript test code using Jest/Vitest and React Testing Library
7. Include test setup, mocks, assertions, and cleanup as needed
8. Consider Next.js specific testing patterns (mocking next/navigation, next/headers, etc.)