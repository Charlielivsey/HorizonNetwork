// Resets the built-in "admin" account's password to "admin" without touching any other data.
// Usage on the VPS:  sudo DATA_DIR=/var/lib/hn-staff-portal node /opt/hn-staff-portal/reset-admin.js && pm2 restart hn-staff-portal

const path = require("path");
const store = require("./lib/store");

store.init(process.env.DATA_DIR || path.join(__dirname, "data"));
const admin = store.findSystemAccount("admin");
if (!admin) {
  console.error("No admin account found.");
  process.exit(1);
}
store.setPassword(admin, "admin");
admin.account.enabled = true;
admin.account.mustChangePassword = true;
store.savePeople();
console.log("The admin password has been reset to: admin");
