## Context

- Task ID: "$ARGUMENTS"
- Task details: !`task-master show $ARGUMENTS`

## Your task

Analyze the specified task and suggest manual testing ideas to verify the implementation works properly.

Steps:
1. Review the task details, requirements, and acceptance criteria
2. Identify the core functionality being implemented
3. Analyze what needs to be tested:
   - New features or functionality described in the task
   - Business logic and validation rules
   - User interactions and workflows
   - Data handling and persistence
   - Integration points with existing systems
4. Propose specific manual test cases that cover:
   - Happy path scenarios for the task requirements
   - Edge cases and error conditions
   - User workflows that involve the new functionality
   - Data validation and boundary testing
   - Integration testing with related components
5. Format as actionable test steps a human can follow to verify the task is complete