## Context

- git status: !`git status`
- Explicitly mentioned file to fix: "$ARGUMENTS"

## Your task

Analyze git changes and create temporary Playwright tests to verify new Next.js code works properly through browser automation.

Steps:
1. Focus primarily on files shown in git status output and any explicitly mentioned files
2. Run `git diff` on the emphasized files to see actual changes 
3. Analyze the changes to understand:
   - New Next.js pages, layouts, or app routes added
   - Modified user interactions or behaviors
   - Form submissions and validations (including Server Actions)
   - Next.js App Router navigation and routing changes
   - Authentication flows (NextAuth.js, middleware)
   - Dynamic content updates and SSR/SSG behavior
   - API route integration points visible to users
   - Client/Server Component interactions
4. Create actual Playwright test files for the changes:
   - Generate temporary test files in `tests/temp/` or `e2e/temp/` directory
   - Use proper @playwright/test syntax with `test()` and `expect()`
   - Include realistic selectors and user workflows
   - Add comprehensive assertions for expected behaviors
   - Include proper setup, navigation, and cleanup
   - Test both client-side and server-side rendering behavior
5. Create test files that cover:
   - Page load and SSR/SSG rendering verification
   - Next.js App Router navigation and route transitions
   - User interaction flows (clicks, form fills, navigation)
   - Server Action form submission and validation
   - Authentication and authorization flows (middleware, protected routes)
   - Dynamic content updates and hydration behavior
   - API route responses and error handling
   - Mobile responsive behavior with shadcn/ui components
6. Provide instructions for:
   - Running the temporary tests: `npx playwright test tests/temp/` or `npm run test:e2e`
   - Testing both development and production builds
   - Moving successful tests to permanent test suite
   - Cleaning up temporary test files
7. Create a summary file listing all generated tests and their purposes