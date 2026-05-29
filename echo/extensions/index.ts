// Direct re-export of the extension factory.
//
// Pi loads this entry through its own jiti instance, which is configured with
// the alias map that resolves the bundled `@earendil-works/*` + `typebox`
// runtime packages. Spawning a second `createJiti()` here (the old hot-reload
// trampoline) breaks under pi >= 0.77.0: the child jiti does not inherit those
// aliases, so `src/echo.ts`'s runtime imports of `@earendil-works/pi-coding-agent`
// and `@earendil-works/pi-tui` fail to resolve at load time.
export { default } from "../src/echo";
