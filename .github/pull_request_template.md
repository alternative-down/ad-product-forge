## Resumo

<!-- O que mudou, por quê, e o contexto do cluster. -->

## Closes

<!-- GitHub-recognizable syntax. Line start, NO bold, NO parens-suffix, NO comma-sep. -->
Closes #NNNN

<!-- Se múltiplos issues (um por linha):
Closes #NNNN
Closes #MMMM
-->

<!--
L#18 N=12 sub-pattern 5 (NEW Jun 9): markdown bold `**Closes:**` ou parens-suffix
`(Closes #N)` quebra auto-close do GitHub. PM-side PATCH manual needed.

Anti-patterns (NÃO usar):
- `**Closes:**` (bold markdown) — quebra auto-close
- `(Closes #N)` (parens-suffix) — quebra parser
- `Closes #N, #M` (comma-sep N=15+) — falha auto-close
-->

## Escopo

<!-- Declare o escopo do CLUSTER antes de mergear. Não copie de PR anterior. -->
- [ ] Full consolidated fix
- [ ] Foundation only (steps X+Y de Z; follow-up tracked em #N)
- [ ] Partial scope — detalhe o que ficou de fora abaixo

<!--
Se partial/foundation:
Steps remaining: <list com line numbers grep'd contra develop HEAD>
Issue/PR tracking: <ref>
-->

## L#34 SCOPE (verificação)

<!-- Declare o escopo da VERIFICAÇÃO. L#34 SCOPE rule: same command, same cwd, same commit, same workspace. -->
- **Workspace**: <local-forge | CI | test-isolated>
- **TSC count command**: `<exact command>` (cite o PR head SHA)
- **TSC count PR-introduced**: <count> (must be 0 for green)
- **TSC count pre-existing baseline**: <count> (cite develop HEAD SHA + grep output)

<!--
Por que importa (L#34 SCOPE v2):
- Multiple workspaces give different counts. PR body should declare the AUTHORITATIVE scope.
- "TSC 5 → 5" claim vs "0 → 0" actual = L#34 SCOPE ambiguity, NOT fabrication (PR #5621, #5645 Day 7+ AM Jun 9)
- 3 workspace types:
  - local-forge: `npm run typecheck` (your dev box)
  - CI: `turbo typecheck` (CI runner, e.g., turbo typecheck CI scope)
  - test-isolated: scoped per-package TSC
-->

## L#32 PM pre-dispatch check (pre-PR)

<!-- Verifique ANTES de abrir o PR (L#32 12-step, ver patterns/l32-pm-dispatch-content-mismatch-2026-06-07.md): -->
- [ ] Issue body path/line-numbers conferem com develop HEAD (`grep -n <file>`)
- [ ] Cluster scope matches o issue body (canonical), NÃO o dispatch summary
- [ ] `## Closes` syntax é single-line, NO bold, NO parens-suffix (ver seção acima)
- [ ] Local develop ref sync'd: `git fetch origin develop && git branch -f develop origin/develop`
- [ ] Branch forked de `origin/develop`, não de HEAD local

## Verification Commands (L#18 N=11 — MANDATORY)

<!-- Cole o output verbatim. Não resuma. Não copie de PR anterior. CI-parity TSC + scoped vitest. Exit codes obrigatórios. -->

```bash
# CI-parity TSC (per L#18 N=8 + L#43 grep count)
npm run typecheck 2>&1 | tail -20
# Exit code: 0
# Errors TS: <count> (PR-introduced: 0; cite workspace from L#34 SCOPE above)

# Scoped vitest (per L#18 N=11)
npx vitest run apps/forge/src/<modified_dir>/*.test.ts 2>&1 | tail -5
# Files: <N> modified
# Pass: <X>/<X>

# Lint scoped (modified files)
pnpm --filter forge lint -- <files> 2>&1 | tail -10
# Errors: 0, Warnings: <count> (pre-existing baseline)
```

## L#19 Tripwire (renamed/new test)

<!-- Se você renomeou um test, expandiu um assertion, ou adicionou um test como tripwire: -->
- [ ] Test renomeado: <old name> → <new name>
- [ ] Assertion expandida: <before> → <after>
- [ ] Doc-comment invariant: <description>
- [ ] Tripwire behavior: <o que o test pega no revert>

<!-- L#19 sanity-check (L#NN family): modificar source, rodar test, ver falhar, reverter. Tripwire PROVEN. -->

## Risco

- [ ] Baixo
- [ ] Médio
- [ ] Alto

## Rollback

<!-- Como reverter rápido, se necessário -->

## Follow-up (se aplicável)

<!--
Se foundation-only ou partial scope:
- Steps remaining: <list>
- Issue/PR tracking: <ref>
- Cascade owner: <Kaelen|Varek|Aldric|...>
- L#18 N=12 sub-pattern 5 auto-close: PATCH close manual se parens-suffix/bold em Closes
- L#NN family: cross-ref patterns/lnn-family-claim-vs-reality-2026-06-07.md
-->
