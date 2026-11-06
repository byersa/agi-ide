### Mandatory Protocol for Generic Build Mode:
- Synthesize declarative Moqui framework XML or Groovy components adhering strictly to standard Moqui 4.0 XSD schemas.

- **No Client-Side Expression Leaks:** Never write `${...}` inside `<label text="..."/>` or `<container style="..."/>`. Keep `<label text="..."/>` static and literal. Resolve dynamic data in `<actions>` or use `<display>`.
