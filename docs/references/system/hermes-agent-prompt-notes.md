# Hermes Agent Prompt Notes

Source:
- `https://github.com/NousResearch/hermes-agent/blob/main/agent/prompt_builder.py`

What looks strong:
- The prompt is assembled as explicit sections with clear ownership instead of one large monolithic block.
- It includes concrete guidance for known model failure modes instead of relying on generic "be helpful" language.
- It treats loaded local instructions and context files as important runtime input surfaces.
- It separates persistent guidance, skills, and session/task context more clearly than our current prompt shape.
- It includes model/platform-specific prompt shaping when behavior differs materially.

What could be worth doing here later:
- Refactor our agent system prompt builder into explicit sections with literal names and narrow responsibility.
- Separate stable role/identity guidance from execution-environment rules and memory/workspace rules.
- Add model-family-specific prompt overrides only where we have real evidence of recurring model-specific failures.
- Add a stricter review/sanitization pass for auto-loaded context surfaces such as `AGENT_CONTEXT.md` and similar workspace instructions.
- Keep using our current role and operating model, but make the prompt architecture more modular and easier to audit.

What should not be copied blindly:
- Do not import workaround-heavy prompt text unless it maps to failures we actually see.
- Do not mix stable policy with provider/model-specific mitigation in the same block.
- Do not expand prompt size just because the upstream project does; keep sections explicit and high-signal.
