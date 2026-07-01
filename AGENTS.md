# AGENTS.md

## Objective

Keep this project boring, clear, and easy to change.

## Engineering Principles

- Prefer SOLID code patterns when they make responsibilities clearer.
- Do not assume backward compatibility is a design requirement unless the task
  or project documentation explicitly says so.
- Use less code when it is sufficient.
- Prioritize cleanliness, readability, and simplicity.
- Do not maintain multiple code paths when one golden path is enough.
- Code should fail fast for developer errors and invalid configuration.
- Runtime cloud/API weirdness should be handled deliberately with typed parsing,
  logging, or recoverable errors instead of accidental crashes.
- Add or update tests so developers can see expected behavior clearly before
  making future changes.

## Implementation Guidance

- Prefer small functions and narrow interfaces.
- Use dependency injection only where it buys testability or keeps side effects
  contained.
- Avoid broad wrappers, speculative abstractions, and compatibility layers that
  are not required by the current task.
- Parse external inputs defensively, but keep internal invariants explicit.
- Choose the simplest design that satisfies the known requirement.
- When a requirement is ambiguous, clarify it before building multiple possible
  futures into the code.

## Verification

- Prefer fast, focused tests that document the expected behavior.
- Add regression tests for bug fixes.
- Run the smallest relevant verification command for the change, and state what
  was or was not verified.
