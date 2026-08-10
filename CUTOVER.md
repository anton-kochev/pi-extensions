# pithos-kit cutover checklist

The codebase intentionally provides no compatibility aliases or fallback reads. Complete these administrative steps after merging the rebrand and before announcing the new packages.

## 1. Rename the GitHub repository

1. Rename `anton-kochev/pi-extensions` to `anton-kochev/pithos-kit` in GitHub settings.
2. Update local clones if needed:

   ```bash
   git remote set-url origin git@github.com:anton-kochev/pithos-kit.git
   ```

3. Verify repository links, branch protection, Actions permissions, environments, secrets, and any external integrations after the rename.

Do not rewrite Git history or rename historical release tags. New releases use only the dotted tag prefixes.

## 2. Create the new npm packages

| Previous package | New package | Initial dotted release |
|---|---|---|
| `@anton-kochev/squiggle` | `@anton-kochev/pithos.squiggle` | `0.4.0` |
| `@anton-kochev/echo` | `@anton-kochev/pithos.echo` | `0.4.1` |
| `@anton-kochev/answer` | `@anton-kochev/pithos.answer` | `0.2.0` |
| `@anton-kochev/telos` | `@anton-kochev/pithos.telos` | `0.2.0` |
| `@anton-kochev/command-guard` | `@anton-kochev/pithos.aegis` | `0.1.0` |
| `@anton-kochev/guild` | `@anton-kochev/pithos.guild` | `0.1.0` |
| `@anton-kochev/context-bar` | `@anton-kochev/pithos.context-bar` | `0.1.0` |
| `@anton-kochev/pi-skills` | `@anton-kochev/pithos.skills` | `0.3.2` |

Confirm every dotted name is available under the `@anton-kochev` scope before creating release tags.

npm may require a package to exist before its trusted publisher can be configured. Check the current npm workflow before tagging. If a bootstrap publication is required, publish `0.0.0` from a disposable copy of each package with a short-lived granular token, configure trusted publishing, and deprecate the bootstrap version after the real release. Do not change the versions committed in this repository.

Aegis is also a runtime clean break:

- `/command-guard` becomes `/aegis`;
- `.pi/command-guard.json` becomes `.pi/aegis.json`;
- the previous session toggle state is not restored.

No alias or automatic configuration migration is provided.

## 3. Configure npm trusted publishers

For each new package, configure npm trusted publishing with:

- GitHub owner: `anton-kochev`
- Repository: `pithos-kit`
- Workflow filename matching the package:
  - `publish-pithos.squiggle.yml`
  - `publish-pithos.echo.yml`
  - `publish-pithos.answer.yml`
  - `publish-pithos.telos.yml`
  - `publish-pithos.aegis.yml`
  - `publish-pithos.guild.yml`
  - `publish-pithos.context-bar.yml`
  - `publish-pithos.skills.yml`

Revalidate trusted-publisher settings for every package after the GitHub rename; repository redirects do not guarantee OIDC claims will continue matching old settings.

## 4. Publish the first dotted releases

After the renamed repository and trusted publishers are ready, tag the already-versioned manifests:

```bash
git tag pithos.squiggle-v0.4.0
git tag pithos.echo-v0.4.1
git tag pithos.answer-v0.2.0
git tag pithos.telos-v0.2.0
git tag pithos.aegis-v0.1.0
git tag pithos.guild-v0.1.0
git tag pithos.context-bar-v0.1.0
git tag pithos.skills-v0.3.2
git push origin --tags
```

Verify each workflow succeeds and each npm package shows provenance before proceeding.

## 5. Deprecate the previous npm identities

After all dotted packages are available, deprecate every version of each previous package with its exact replacement. For example:

```bash
npm deprecate '@anton-kochev/squiggle@*' 'Moved to @anton-kochev/pithos.squiggle'
npm deprecate '@anton-kochev/command-guard@*' 'Replaced by @anton-kochev/pithos.aegis; configuration and command names changed'
```

Repeat for all rows in the package table. Deprecation communicates the replacement but does not redirect installs; users must install the dotted package explicitly.

## 6. Final checks

- Install each dotted package in a clean Pi environment.
- Update the separate `anton-kochev/pithos` project and its image/default configuration anywhere it installs a previous npm identity.
- Confirm npm and README badges resolve.
- Confirm new tags trigger only their matching workflow.
- Confirm `/aegis` uses `.pi/aegis.json` and no previous command or configuration identity is accepted.
- Announce the clean break and link to the new install commands in the root README.
