// Resets the built-in admin login to admin@hngroup.org.uk / admin and clears its sign-in code
// (a new one is set at the next sign-in), without touching any other data.
// Usage on the VPS:  sudo DATA_DIR=/var/lib/hn-staff-portal node /opt/hn-staff-portal/reset-admin.js && pm2 restart hn-staff-portal

const path = require("path");
const store = require("./lib/store");

store.init(process.env.DATA_DIR || path.join(__dirname, "data"));
const admin = store.findSystemAccount(store.ADMIN_USERNAME);
if (!admin) {
  console.error("No admin account found.");
  process.exit(1);
}
store.setPassword(admin, "admin");
admin.account.enabled = true;
admin.account.mustChangePassword = true;
delete admin.account.code;
store.savePeople();
console.log(`Admin login reset to: ${store.ADMIN_USERNAME} / admin`);
