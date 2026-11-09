# Releasing a new till version

The tills update themselves: you publish a version, and each till downloads it,
checks its signature, and installs it when nobody has used it for 15 minutes.
Data, enrollment, printer settings and unsent sales are kept.

## 1. Build

1. Set the new version (`MAJOR.MINOR.PATCH`) in `desktop/src-tauri/tauri.conf.json`,
   `desktop/package.json` and `desktop/src-tauri/Cargo.toml`, then commit.
2. Tag it and push the tag:

   ```sh
   git tag desktop-v0.2.1 && git push origin desktop-v0.2.1
   ```

3. GitHub Actions ("Desktop till release") builds `nguon-pos-deb` and `nguon-pos-nsis`.
   Download both artifacts from the run page and unzip them.

## 2. Sign and upload

This must run on the machine that holds the release key
(`~/nguon-pos-release-key/release-signing.key`). That key is the only thing
that lets a file be installed on the tills, so keep it offline and backed up.

```sh
deploy/release/publish-release.sh 0.2.1 \
  "nguon-pos_0.2.1_amd64.deb" "Nguon POS_0.2.1_x64-setup.exe" \
  "Short note for the back office"
```

The script:

1. signs each installer;
2. checks each signature against the key built into the tills;
3. uploads the installers to the VPS (`~/nguon-pos/releases/0.2.1/`, served at `/releases/`);
4. registers the version.

Pass `-` instead of a file to skip one platform.

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
