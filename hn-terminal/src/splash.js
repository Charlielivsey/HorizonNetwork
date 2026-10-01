const version = new URLSearchParams(location.search).get("v");
if (version) document.getElementById("version").textContent = `v${version} — Horizon Network`;
