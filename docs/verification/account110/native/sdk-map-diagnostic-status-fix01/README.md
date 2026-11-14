# SDK collector status output P1 correction

Source `53e3f139d6df9ed68e9395ca585757e3dc49ba23` addresses review `c56f1ccd` P1. Only the collector and its fixture file changed. No native, driver, frontend, transfer behavior or deadline change.

The new observation validator checks root fields and profile/devices/summary/transport/deviceOperation/error: permitted/required fields, finite enums, types, numeric bounds and relationships. It preserves valid error-bearing and failed-operation observations instead of invoking the old acceptance parseStatus that throws early. Both sample and command terminal pass through it. Output is constructed field by field; no summary spread or message/name/subject/ID copying. Untrusted labels map to static other. Missing/invalid successful-command status also reaches validation rather than being skipped by a truthiness check.

Two sentinel fixtures exercise the actual output functions safeStatusSample/safeCommandTerminal. Valid running/failed/error states and finite errors survive; arbitrary state, extra summary.message, unknown root/nested fields, invalid counts/booleans/UUIDs/error enums fail before output. Profile/name/error.message and malicious labels cannot enter serialized output. Only these two affected fixtures ran: 2 passed, 0 failed, 0 skipped. Prior collector20, driver15 and native8 were not rerun. Syntax and whitespace checks passed.

`affected02.tap` is the actual TAP; `receipt.json` pins source bytes and command. SHA256SUMS covers all other files here. Independent Erdos re-review remains pending. No Cargo, shared target, App, account/network operation, live/default library or credential access.
