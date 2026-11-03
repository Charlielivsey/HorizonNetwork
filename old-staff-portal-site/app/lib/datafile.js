// A JSON file in DATA_DIR holding one module's data. Writes go to a temp file first so a crash
// can't leave a half-written file behind.

const fs = require("fs");
const path = require("path");

function open(dataDir, name, empty) {
  const file = path.join(dataDir, name);
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : empty();
  // Fill in any sections added since the file was first written.
  const blank = empty();
  for (const key of Object.keys(blank)) if (data[key] === undefined) data[key] = blank[key];
  return {
    data,
    save() {
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, file);
    },
  };
}

module.exports = { open };
