# Releasing a new till version

The tills update themselves: you publish a version, and each till downloads it,
checks its signature, and installs it when nobody has used it for 15 minutes.
Data, enrollment, printer settings and unsent sales are kept.

## 1. Build and publish (automatic)

From any computer with the repository:

```sh
deploy/release/release.sh 0.3.9 "Short note for the back office"
```

It sets the version, commits, tags `desktop-v0.3.9` (the note is the tag's
message) and pushes. GitHub then does the rest by itself:

1. **Desktop till release** builds the Windows and Ubuntu installers (~15 min).
2. **Desktop till publish** signs them with the release key, and sends them to
   the server. On the server, `receive-release.sh` checks every signature
   against the key built into the tills, refuses to replace a version that
   already exists, puts the files under `~/nguon-pos/releases/0.3.9/` (served
   at `/releases/`) and registers the version.

To publish a tag that was built already (for example after the setup below):
GitHub → Actions → **Desktop till publish** → Run workflow, with the tag.

### One-time setup

```sh
sh deploy/release/setup-ci.sh
```

Run from the computer that holds the release key
(`~/nguon-pos-release-key/release-signing.key`). It creates GitHub's upload key,
which on the server can **only** run `receive-release.sh` (no shell), checks
that, and lists the three secrets to paste into GitHub (Settings →
Environments → `release`): `RELEASE_SIGNING_KEY`, `RELEASE_SSH_KEY`,
`RELEASE_SSH_KNOWN_HOSTS`. Run it again to replace the upload key.

Security: the release key now also lives in GitHub's secrets. Someone with
your GitHub account could get a version registered, but the tills install
nothing until an admin clicks **Publier aux caisses**. Protect the GitHub
account with two-factor authentication. Keep the offline copy of the key
backed up too.

### By hand (fallback)

`publish-release.sh` still signs, uploads and registers from this computer,
with installers downloaded from the build's run page:

```sh
deploy/release/publish-release.sh 0.3.9 nguon-pos_0.3.9_amd64.deb nguon-pos_0.3.9_x64-setup.exe "Note"
```

## 3. Deploy to the tills

Go to **Administration → Appareils → Versions des caisses** and click
**Publier aux caisses** on the new version.

- Connected tills receive it at once. Offline tills receive it when they reconnect.
- The **Caisses** column counts how many tills already run each version. Each till's own version is shown in its row in the **Appareils** table.
- **Geler** stops all updates, for example during the festival. Tills keep the version they have.

## What a till checks before installing

The till accepts an installer only if all of these hold:

- It was downloaded from the central server, under `/releases/` only.
- Its SHA-256 matches the published value.
- It has an Ed25519 signature over `nguon-pos|<version>|<platform>|<sha256>`, made with the release key. A signature for another version or another OS is refused.
- Its version is newer than the installed one. Downgrades are refused.

**Ubuntu.** The local server runs unprivileged and cannot install anything.
It only leaves a request file. The root unit `nguon-updater` copies the package
to a root-only folder, checks everything again (including the package name
and version), and then runs `dpkg -i`. The result is in `journalctl -t nguon-updater`.

**Windows.** The service (SYSTEM) runs the installer silently, through a
one-off scheduled task `\NguonPOS\Update`. The installer closes the app, and the
task `\NguonPOS\Launch` reopens it for the logged-on user.

## If a till does not update

| Symptom | Cause |
|---|---|
| Version unchanged after 30 minutes | It retries up to 3 times, then reports `FAILED` in its status (`GET http://127.0.0.1:47300/local/v1/status` on the till). |
| `Release signature invalid` | The installer was not signed with the release key. Re-run `publish-release.sh`. |
| `UNSUPPORTED` | No installer was published for that OS. |
