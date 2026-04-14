---
name: skills-creator
description: Create or update reusable workspace skills for this agent following the Mastra Agent Skills format. Use this when work should become a repeatable skill instead of a one-off prompt.
---

# Skills Creator

Use this skill when you need to create or improve a reusable skill inside this workspace.

## Goal

Turn repeated work, fragile workflows, domain-specific procedures, or bundled references, scripts, or assets into a proper Mastra skill that this agent can reuse later.

## Required skill format

Every skill must live in its own folder and include this required file:

```text
skills/<skill-name>/SKILL.md
```

The minimum structure is:

```text
skills/<skill-name>/
  SKILL.md
```

Optional resources:

```text
skills/<skill-name>/
  SKILL.md
  references/
  scripts/
  assets/
```

## Naming rules

- Use lowercase letters, digits, and hyphens only
- Keep the folder name and the frontmatter `name` identical
- Prefer short action-oriented names such as `review-prs`, `deploy-preview`, `draft-proposals`

## Frontmatter

Every `SKILL.md` must start with YAML frontmatter containing:

```yaml
---
name: skill-name
description: Clear description of what the skill does and when to use it.
---
```

The description is critical because it is what the model uses to decide when the skill should trigger.

## Writing rules

- Keep the skill concise and practical
- Assume the model is already smart; only include what is truly specific to the workflow
- Prefer direct instructions over long explanations
- Put only the reusable workflow in `SKILL.md`
- Move detailed docs, schemas, policies, or examples into `references/` when they would make the main file too long
- Put deterministic or repetitive logic into `scripts/` when a script is safer than re-writing the same logic in prompts
- Put templates, sample files, or output resources into `assets/`
- Do not create extra files like README, changelog, install guide, or notes about the creation process

## What makes a good skill

A good skill should:

- solve a repeated problem
- define when it should be used
- give a clear workflow from start to finish
- point to references only when needed
- stay small enough to be cheap in context

## Skill creation workflow

1. Identify the repeated task or fragile workflow that deserves a skill.
2. Choose a literal skill name in hyphen-case.
3. Create the folder under `skills/`.
4. Write `SKILL.md` with:
   - frontmatter
   - short purpose
   - precise workflow
   - references to any optional files when needed
5. Add `references/`, `scripts/`, or `assets/` only when they materially improve reuse.
6. Read the final skill and remove filler, duplicated explanation, and generic advice.

## Recommended SKILL.md structure

```md
---
name: example-skill
description: Explain what this skill does and when to use it.
---

# Example Skill

Short statement of purpose.

## When to use

- situation 1
- situation 2

## Workflow

1. inspect the current state
2. choose the correct path
3. execute the task
4. validate the result

## References

- Read `references/example.md` when you need domain details
- Run `scripts/example.sh` when deterministic execution is required
```

## Quality checklist

Before finishing a new skill, verify:

- the folder name matches the frontmatter `name`
- the description says both what the skill does and when to use it
- the workflow is specific and actionable
- there is no unnecessary prose
- optional resources are actually referenced from `SKILL.md`
- the skill helps future runs do the work faster or more reliably

## Important reminder

Create a skill only when the value is in reuse. If the task is truly one-off, do the work directly instead of adding another skill.
