# UIA shell-private observation path independent PASS

Reviewed frozen native tool commit `9c87f700dfc2b98ba61f6fb7965c663af25c731c` against `094725ff`. The exact source delta is two fixed path replacements from `/sdcard/Download/notes-sync87-uia.xml` to `/data/local/tmp/notes-sync87-uia.xml`, covering matching dump and cat calls. Source SHA256 is `555732cf30d528880e158d6cb7bead593c07fff3e4828a87f7b0e3c22fd158fc`.

The actual guard main() was exercised with an adb stub, never real ADB: exact isolated5584/AVD dispatch; one shell-private UIA dump with unchanged25-second timeout; matching exec-out cat; unchanged successful XML result; foreign5580 refused before any stub invocation. All source outside these two literals is identical, including ownership checks, input guards, retries and receipt logic. No product source changed.

The author's actual cycle09 observation was that saving after TXT focus/ENTER attached the tool XML, not TXT; every public Downloads UIA dump refreshed that picker entry. This is retained as a tool-observation contamination issue, not declared a product save failure. Moving future observations outside public media storage prevents this tool from updating a public Recent item. The old public XML and accidental synthetic attachment are preserved; nothing is deleted. No URI/file-result injection, action retry or gate bypass is introduced.

This is source/host admission only. It neither proves the system accepts the new directory on actual Android nor that subsequent TXT/WAV selections, pairing or sync pass. Sole device author was promptly admitted through `/private/tmp/sync87-uia-private-review-status.md` before this evidence commit; actual native results remain required.
