'use strict';

// platform#571 (part 2 of #562), extended by #608 and #1069. Pins the
// `extractCandidateNumbers()`/`collectCovered()` algorithms and the
// CLOSING_KEYWORD/NON_CLOSING_MARKER patterns that both
// `closing-keyword-check.yml` and `agent/bin/check-pr-references` carry as
// byte-identical inline copies (neither can `require()` this module
// directly — `closing-keyword-check.yml` never checks out the repo, and
// `check-pr-references` is copied verbatim into every product repo by
// `scripts/bootstrap-product-repo.sh`, so it can't assume a sibling
// `scripts/` directory exists at run time). Keep both inline copies patched
// to match this by hand, same as they're already kept in sync with each
// other today.

// Bare `#NNN` references plus `owner/repo#NNN` cross-repo references,
// skipping "PR #NNN" / "pull request #NNN" mentions.
//
// Three distinguishable forms:
//   - `#NNN` (no prefix) is always a same-repo reference.
//   - `owner/repo#NNN` (prefix contains a `/`) is GitHub's own valid
//     cross-repo closing syntax. Until #1069 these were skipped
//     unconditionally — this check had no way to resolve a number into a
//     repo it doesn't run in. Now they're returned as `crossRepo`
//     candidates and resolved via `gh api repos/{owner}/{repo}/issues/{n}`
//     the same way a same-repo number is, requiring the same
//     closing-keyword/marker coverage.
//   - `reponame#NNN` (no owner) is ambiguous on its own — it satisfies
//     neither GitHub's same-repo (`#NNN`) nor cross-repo (`owner/repo#NNN`)
//     auto-close syntax. `currentRepo` disambiguates it (#608): if
//     `reponame` IS the repo this check runs in, it's a same-repo
//     self-reference with a redundant prefix (still needs its own
//     coverage, `#562`); otherwise it reads like a cross-repo mention but
//     isn't valid GitHub syntax (no owner) — out of scope for #1069 (that
//     gap is `platform#1068`'s role-doc fix: teach agents to always write
//     the full `owner/repo#NNN` form), so it's still skipped here exactly
//     as before.
//
// Returns `{ sameRepo: Set<number>, crossRepo: Map<"owner/repo", Set<number>> }`.
// `crossRepo` keys are lower-cased (GitHub repo paths are case-insensitive)
// so lookups against `collectCovered()`'s output match regardless of the
// casing an author used.
function extractCandidateNumbers(s, currentRepo) {
  const sameRepo = new Set();
  const crossRepo = new Map();
  const re = /#(\d+)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const before = s.slice(0, m.index);
    const wordMatch = before.match(/[A-Za-z0-9_.\-/]*$/);
    const word = wordMatch ? wordMatch[0] : '';
    const context = before.slice(-20).trimEnd();
    if (/\b(pull request|pr)\s*$/i.test(context)) continue;

    if (word.includes('/')) {
      const slash = word.lastIndexOf('/');
      const owner = word.slice(0, slash);
      const repo = word.slice(slash + 1);
      if (!owner || !repo) continue; // malformed (e.g. a leading '/') — skip, same as pre-#1069.
      const key = `${owner}/${repo}`.toLowerCase();
      if (!crossRepo.has(key)) crossRepo.set(key, new Set());
      crossRepo.get(key).add(Number(m[1]));
      continue;
    }

    if (word && currentRepo && word.toLowerCase() !== currentRepo.toLowerCase()) {
      continue; // reponame#NNN naming a different repo — ambiguous shorthand, skip (#608).
    }
    sameRepo.add(Number(m[1]));
  }
  return { sameRepo, crossRepo };
}

// Given text and a keyword pattern (CLOSING_KEYWORD or NON_CLOSING_MARKER,
// below), returns which reference numbers that keyword actually covers, in
// the same `{ sameRepo, crossRepo }` shape as `extractCandidateNumbers()`.
function collectCovered(s, keywordPattern) {
  const sameRepo = new Set();
  const crossRepo = new Map();
  const re = new RegExp(keywordPattern.source, keywordPattern.flags);
  let m;
  while ((m = re.exec(s)) !== null) {
    const listRe = /(?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#(\d+)/g;
    let nm;
    while ((nm = listRe.exec(m[2])) !== null) {
      if (nm[1]) {
        const key = nm[1].toLowerCase();
        if (!crossRepo.has(key)) crossRepo.set(key, new Set());
        crossRepo.get(key).add(Number(nm[2]));
      } else {
        sameRepo.add(Number(nm[2]));
      }
    }
  }
  return { sameRepo, crossRepo };
}

// A single reference item in a closing/marker list: `#NNN` or
// `owner/repo#NNN`. Used to build the list portion of both keyword patterns
// below so a mixed list (`Closes #1, owner/repo#2 and #3`) is covered in
// one match, same as GitHub's own multi-reference closing syntax.
const REF_ITEM = '(?:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)?#\\d+';
const REF_LIST = `(?:${REF_ITEM}(?:\\s*,\\s*|\\s+and\\s+|\\s*&\\s*)?)+`;

const CLOSING_KEYWORD = new RegExp(`\\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\b\\s*:?\\s*(${REF_LIST})`, 'gi');
const NON_CLOSING_MARKER = new RegExp(`\\b(related to|refs?|part of|see|contributes? to|tracked by)\\b\\s*:?\\s*(${REF_LIST})`, 'gi');

module.exports = { extractCandidateNumbers, collectCovered, CLOSING_KEYWORD, NON_CLOSING_MARKER };
