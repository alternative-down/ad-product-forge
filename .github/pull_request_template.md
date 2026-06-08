## Resumo

<!-- O que mudou, por quê, e o contexto do cluster. Refs #N ou Closes #N (single-line). -->

## Escopo

<!-- Declare o escopo ANTES de mergear. Não copie de PR anterior. -->
- [ ] Full consolidated fix
- [ ] Foundation only (steps X+Y de Z; follow-up tracked em #N)
- [ ] Partial scope — detalhe o que ficou de fora abaixo

<!--
Se partial/foundation:
Steps remaining: <list com line numbers grep'd contra develop HEAD>
Issue/PR tracking: <ref>
-->

## L#32 PM pre-dispatch check (pre-PR)

<!-- Verifique ANTES de abrir o PR (L#32 12-step, ver patterns/l32-pm-dispatch-content-mismatch-2026-06-07.md): -->
- [ ] Issue body path/line-numbers conferem com develop HEAD (`grep -n <file>`)
- [ ] Cluster scope matches o issue body (canonical), NÃO o dispatch summary
- [ ] `Closes #N` é single-line (N=15+ quirk: comma-sep falha auto-close; parens-suffix quebra parser — PATCH manual)
- [ ] Local develop ref sync'd: `git fetch origin develop && git branch -f develop origin/develop`
- [ ] Branch forked de `origin/develop`, não de HEAD local

## Verification Commands (L#18 N=11 — MANDATORY)

<!-- Cole o output verbatim. Não resuma. Não copie de PR anterior. CI-parity TSC + scoped vitest. Exit codes obrigatórios. -->

```bash
# CI-parity TSC (per L#18 N=8 + L#43 grep count)
npm run typecheck 2>&1 | tail -20
# Exit code: 0
# Errors TS: <count> (PR-introduced: 0)

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
- L#18 N=15 auto-close: PATCH close manual se parens-suffix em Closes
- L#NN family: cross-ref patterns/lnn-family-claim-vs-reality-2026-06-07.md
-->
