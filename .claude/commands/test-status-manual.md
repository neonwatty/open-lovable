## Context

- git status: !`git status`
- Explicitly mentioned file to fix: "$ARGUMENTS"

## Your task

Analyze git changes and suggest manual testing ideas to verify new Next.js code works properly.

Steps:
1. Focus primarily on files shown in git status output and any explicitly mentioned files
2. Run `git diff` on the emphasized files to see actual changes 
3. Analyze the changes to understand:
   - New Next.js pages, layouts, or app routes added
   - Modified business logic or behavior
   - UI/UX changes (shadcn/ui components, responsive design)
   - Server Actions and form handling changes
   - API routes or middleware changes
   - Authentication/authorization flow changes
   - Data fetching and caching behavior (SSR/SSG/ISR)
   - Client/Server Component interactions
4. Propose specific manual test cases that cover:
   - Happy path scenarios for new features
   - Page load performance and SSR behavior
   - Form submissions using Server Actions
   - Navigation between app routes
   - Authentication flows and protected routes
   - Mobile responsive behavior
   - Edge cases and error conditions
   - Integration points between components
   - User workflows that touch modified code
   - Data validation and security concerns
   - Accessibility with keyboard navigation
5. Format as actionable test steps a human can follow
6. Include testing in both development and production builds