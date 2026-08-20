# Atlas Pi footer patch behaviors

## Patch engine
- [x] Verify the target package identity and version before reading its footer.
- [x] Recognize reviewed full-source digests for explicit Pi versions and reject unknown/local/partial sources.
- [x] Report compatible stock, fully patched, and unsupported/partial states without mutation.
- [x] Apply the complete compact-footer transformation and retain extension-status rendering.
- [x] Remove the patch back to the exact stock source.
- [x] Make apply and remove idempotent.
- [x] Preserve file permissions and replace through a same-directory temporary file.
- [x] Bind mutation to the version and source digest reviewed by Atlas and reject subsequent changes.
- [x] Re-read immediately before replacement and avoid unsupported directory fsync on Windows.
- [x] Support explicit package-directory and JSON CLI options.

## Persistent launcher
- [x] Find the next real `pi` executable on `PATH`, skipping direct and chained aliases of the launcher.
- [x] Derive and validate the owning `@earendil-works/pi-coding-agent` package from its executable.
- [x] Apply the footer patch before launching Pi, including idempotent already-patched startup.
- [x] Refuse unsupported footer/package targets without launching Pi or changing the source.
- [x] Preserve Pi arguments and standard streams.
- [x] Propagate Pi exit codes and terminating signals.
- [x] Ship the launcher as the `pithos-atlas-pi` package executable.

## Atlas integration
- [x] Resolve the active Pi package root and version from the running entry point.
- [x] Parse, document, and complete footer status/apply/remove commands.
- [x] Keep status read-only.
- [x] Require an idle TUI, inactive Plan mode, and explicit confirmation for apply/remove.
- [x] Show the exact Pi version and target path before mutation.
- [x] Keep patch application out of model-callable tools.
- [x] Expose patch status from the Atlas main menu.

## Footer presentation
- [x] Combine cwd/branch/session and provider/model/reasoning on one line.
- [x] Prioritize and safely truncate model identity at narrow widths.
- [x] Handle zero-width rendering.
- [x] Preserve sorted extension status lines.
- [x] Hide token, cache, cost, context-window, and auto-compaction accounting only from the footer.
- [x] Leave Plan mode and Context Bar source unchanged.
