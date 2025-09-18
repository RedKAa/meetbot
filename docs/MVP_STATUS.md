# Recorder MVP Status

## Done in this pass
- Buffered mixed/per-participant audio until the recorder receives an `AudioFormatUpdate`, so no early chunks are lost.
- Cached per-participant label once and reused it across WAV paths and metadata.
- Extended session metadata to optionally hold archive paths/manifest pointers.
- Documented current recorder behavior and outputs in `docs/RecordingServerNotes.md`.

## Not yet implemented
- Sealing a session folder under `recordings/completed/` after `close()` finishes.
- Generating an `archive.json` manifest and updating `session-summary.json` with archive references.
- Triggering PhoWhisper (or any downstream hand-off) post-archive.
- Automated tests that replay canned payloads against the archiver.
- README quick-start / ops instructions for the full workflow.

