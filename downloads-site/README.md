# HN Group Downloads

Public site: downloads.hngroup.org.uk · PM2 hn-downloads · loopback 5100. Cached GitHub release metadata is private in `/var/lib/hn-downloads` and survives updates. The dedicated installer does not change other services. Standard update:

```sh
cd /root/HorizonNetwork && git pull && sudo bash install.sh
```

The page previews all five HN Browser themes, defaulting to Midnight Lavender, and offers macOS Apple-silicon, Windows x64 and Linux x64 (AppImage, for Bazzite and Fedora) installers (Intel Macs are no longer supported) only after those assets exist. HN Secure Network (Mac, Windows, Linux) and HN Group App Manager (Mac, Windows, Linux) come from their own records: `secure-network*.json` and `app-manager-*.json`, served at `/download/secure-network-mac|windows|linux`, `/download/app-manager-mac|windows|linux` and `/download/linux-x64` for the browser's AppImage. The HN Group logo, Plus Jakarta Sans and favicon are copied into its own public assets.

The server polls public releases of the fixed `Charlielivsey/HorizonNetwork` repository every five minutes. It accepts only `browser-vVERSION-RUN` tags and recognised installer names/URLs, preserves a known release if GitHub is unavailable, and streams public GitHub release assets from stable `/download/mac-arm64`, `/download/mac-x64` and `/download/windows-x64` routes. It never accepts an arbitrary URL from a visitor or reads staff data. SHA-256 digests are shown where GitHub supplies them. The first preview installers are not developer-signed/notarised; that status is stated on the page.

DNS must resolve downloads.hngroup.org.uk to 217.154.34.205 before its isolated installer obtains trusted HTTPS. Existing certificate and cache data are preserved. The site is in Links, website control's fixed catalog and the selective root installer. Tests: `node --test downloads-site/test.cjs`.
