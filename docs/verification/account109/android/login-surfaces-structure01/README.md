# Existing Android document: structural difference

2026-11-13. A further read-only product call localized the difference first observed in [preflight01](../login-surfaces-preflight01/README.md). The old candidate remains installed; the new APK was not installed and no authorization or data mutation was requested.

Compared with `9263-debug/synthetic-after-restart.json`, note `321e9d6c-d590-437d-8edb-d6ed2feae3fa` has exactly two added document entries: `/document/content/3` is an attachment node with `type`/`attrs`, and `/document/content/4` is a paragraph node containing only `type`. Every original document entry is deeply equal, and complete plainText is equal. The current workspace's sole attachment descriptor belongs to this note. No attachment bytes were read, and neither the attachment-node reference nor its contents were independently verified by this call. The observations do not prove the time, actor or origin of the addition, or whether the descriptor and node refer to the same attachment.

Native state remains `error`, enabled=false, no profile, with `account_network / coordinator`. The driver closed before this report was written. Only paths, known node types, keys, counts, hashes and finite account diagnostics were saved; no node attributes, descriptor values, body text, file bytes or credentials were archived. `result.json` is the original finite report.

This narrows the unexplained difference to additions, rather than a change to the old text/document prefix. It does not approve replacing the historical pinned baseline or bypassing the smoke's cleanSignedOut gate. Original data/error and the preflight failure remain intact. New-surface and three-device acceptance remain unexecuted.
