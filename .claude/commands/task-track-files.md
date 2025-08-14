## Context

- Task ID: "$ARGUMENTS"
- Current git status: !`git status --porcelain`

## Your task

Capture current file changes and log them to the specified TaskMaster task.

Steps:
1. Validate task ID exists: `task-master show $ARGUMENTS`
2. Capture current git file status: `git status --porcelain`
3. Format file changes into a readable summary
4. Log to TaskMaster: `task-master update-subtask --id=$ARGUMENTS --prompt="File changes logged: [summary]"`
5. Display current task status for reference