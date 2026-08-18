const RETIRED_PACKAGE_NAMES = new Set(["@pithos-kit/skills"]);

export function isRetiredPackage(name: string): boolean {
	return RETIRED_PACKAGE_NAMES.has(name);
}
