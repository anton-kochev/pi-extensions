# @pithos-kit organization cutover checklist

This repository is a clean break. Runtime code, Atlas, and package documentation do not alias, recognize, migrate, or fall back to previous npm identities. Perform the external npm and Pithos steps below after merging and before announcing the coordinated release.

## 1. Create the npm organization packages

Confirm the `@pithos-kit` organization and all short names are available:

| Previous package | New package | First organization version |
|---|---|---|
| `@anton-kochev/pithos.squiggle` | `@pithos-kit/squiggle` | `0.4.0` |
| `@anton-kochev/pithos.echo` | `@pithos-kit/echo` | `0.4.1` |
| `@anton-kochev/pithos.answer` | `@pithos-kit/answer` | `0.2.0` |
| `@anton-kochev/pithos.telos` | `@pithos-kit/telos` | `0.2.0` |
| `@anton-kochev/pithos.aegis` | `@pithos-kit/aegis` | `0.1.0` |
| `@anton-kochev/pithos.guild` | `@pithos-kit/guild` | `0.1.0` |
| `@anton-kochev/pithos.context-bar` | `@pithos-kit/context-bar` | `0.1.0` |
| `@anton-kochev/pithos.skills` | `@pithos-kit/skills` | `0.3.2` |
| none | `@pithos-kit/atlas` | `0.1.0` |

The preserved versions are valid because these are new npm package identities. Existing Git tags already use those versions, so organization releases use the distinct `pithos-kit.<name>-v<version>` namespace. Do not delete or rewrite historical tags.

npm may require a package record before trusted publishing can be configured. Follow npm's current bootstrap procedure if necessary, using a disposable source copy and short-lived granular token. Do not change the versions committed here merely to create package records.

## 2. Configure trusted publishers

For each new package, configure npm trusted publishing with:

- GitHub owner: `anton-kochev`
- Repository: `pithos-kit`
- Matching workflow filename:
  - `publish-pithos.squiggle.yml`
  - `publish-pithos.echo.yml`
  - `publish-pithos.answer.yml`
  - `publish-pithos.telos.yml`
  - `publish-pithos.aegis.yml`
  - `publish-pithos.guild.yml`
  - `publish-pithos.context-bar.yml`
  - `publish-pithos.skills.yml`
  - `publish-pithos.atlas.yml`

Enable public scoped-package publication and verify the repository/branch protection and Actions OIDC settings before tagging.

## 3. Verify the coordinated source release

Before creating tags:

```bash
npm test
cd pithos.atlas
npm ci
npm run catalog:generate
npm test
npm run typecheck
npm pack --dry-run
```

Run every package's tests, typecheck/audit where defined, and `npm pack --dry-run`. Confirm:

- all manifests and lock roots use `@pithos-kit/<short-name>`;
- `pithos.atlas/src/generated/catalog.json` is current;
- all workflows use `pithos-kit.<name>-v*`;
- old npm identities occur only in this administrative checklist;
- Atlas loads on Pi `0.83.0` without startup network access;
- Context Bar still declares and reports Pi `>=0.84.1` rather than hiding the incompatibility.

## 4. Publish the organization packages

Create the preserved-version tags:

```bash
git tag pithos-kit.squiggle-v0.4.0
git tag pithos-kit.echo-v0.4.1
git tag pithos-kit.answer-v0.2.0
git tag pithos-kit.telos-v0.2.0
git tag pithos-kit.aegis-v0.1.0
git tag pithos-kit.guild-v0.1.0
git tag pithos-kit.context-bar-v0.1.0
git tag pithos-kit.skills-v0.3.2
git tag pithos-kit.atlas-v0.1.0
git push origin --tags
```

Publish and verify the eight capability packages before Atlas when sequencing jobs manually; Atlas's bundled catalog works before they are visible, but its first live registry verification should see all organization packages.

For every package, verify:

- the expected version and `latest` dist-tag;
- npm provenance and trusted-publisher evidence;
- the custom `pithosKit` manifest metadata in the public registry response;
- package contents and README rendering;
- install and package-local help behavior in a clean Pi environment.

Then verify Atlas online and with `PI_OFFLINE=1`, including catalog fallback, version labels, Pi compatibility, `/pithos help`, `pithos_info`, `.pithos` validation, and an explicitly confirmed atomic configuration update.

## 5. Update the separate Pithos project

This checkout intentionally does not modify the separate `anton-kochev/pithos` repository. Coordinate a Pithos change that:

1. replaces every previous npm package entry with its exact `@pithos-kit/<short-name>` replacement;
2. preinstalls `@pithos-kit/atlas` in the base/default environment so it can diagnose project configuration even when project packages fail to load;
3. keeps exact `npm:<version>` pins under `pi.extensions`, including `@pithos-kit/skills`;
4. rebuilds generated `.pithos.d/` output from authoritative `.pithos` input rather than editing generated files;
5. accounts for Context Bar's Pi `>=0.84.1` requirement when selecting the new base Pi version;
6. tests a broken/incompatible project configuration and confirms the preinstalled Atlas remains available.

This repository deliberately leaves its own `.pithos` Pi `0.83.0` pin unchanged; Atlas can offer an interactive update for a future rebuild.

## 6. Deprecate previous package identities

Only after all nine organization packages and the Pithos update are verified, deprecate every published version of the previous identities with explicit replacement messages:

```bash
npm deprecate '@anton-kochev/pithos.squiggle@*' 'Moved to @pithos-kit/squiggle'
npm deprecate '@anton-kochev/pithos.echo@*' 'Moved to @pithos-kit/echo'
npm deprecate '@anton-kochev/pithos.answer@*' 'Moved to @pithos-kit/answer'
npm deprecate '@anton-kochev/pithos.telos@*' 'Moved to @pithos-kit/telos'
npm deprecate '@anton-kochev/pithos.aegis@*' 'Moved to @pithos-kit/aegis'
npm deprecate '@anton-kochev/pithos.guild@*' 'Moved to @pithos-kit/guild'
npm deprecate '@anton-kochev/pithos.context-bar@*' 'Moved to @pithos-kit/context-bar'
npm deprecate '@anton-kochev/pithos.skills@*' 'Moved to @pithos-kit/skills'
```

Deprecation communicates replacements but does not redirect installs or migrate `.pithos`; users must select and pin the new packages explicitly.

## 7. Final checks and announcement

- Install every `@pithos-kit/*` package from npm in a clean environment.
- Confirm public badges and registry APIs resolve.
- Confirm each new tag triggers only its matching workflow.
- Confirm all package commands return local `--help`/`-h`, while Atlas uses the single `/pithos help` page.
- Confirm Atlas performs no startup/completion registry calls and exposes no configuration mutation tool action.
- Confirm `.pithos.d/` is generated only by Pithos.
- Announce the clean break with links to the root README, Atlas documentation, and explicit install/configuration examples.
