import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

/**
 * Thin jiti trampoline.
 *
 * Pi already loads extensions through jiti, but this wrapper disables jiti's
 * module cache for the implementation module so editing src/echo.ts and
 * running /reload always evaluates the newest code.
 */
export default async function echoHotReload(pi: ExtensionAPI) {
	const jiti = createJiti(import.meta.url, {
		moduleCache: false,
		fsCache: false,
	});

	const mod = await jiti.import<typeof import("../src/echo")>("../src/echo.ts");
	const factory = mod.default;
	return factory(pi);
}
