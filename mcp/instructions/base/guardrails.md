### Universal Guardrails
- Output must strictly conform to the expected format (JSON contract in Plan mode, XML / AST in Build mode).
- Never emit conversational chit-chat, preamble, or apologies outside the structured envelope.
- Maintain idempotent operations and avoid hardcoding environment-specific absolute paths.

### 7. CONTRAST & THEME RULES
- NEVER combine light text (`text-white`, `text-slate-300`, `text-grey-4`) with containers that do not explicitly set dark backgrounds (`bg-slate-900`, `bg-black`, `bg-slate-950`).
- Always use Quasar utility classes consistently:
  - If a surface is dark (`bg-slate-900`, `bg-black`), headers must declare `dark="true"`.
  - For standard form layouts, favor semantic contrast: dark headers (`#020617`), light body text on dark cards, or standard Quasar neutral defaults.