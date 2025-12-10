const fs = require("fs-extra");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules/.prisma");
const dest = path.join(__dirname, "..", "prisma-hidden");

fs.copySync(src, dest);
console.log("✅ Copied .prisma => prisma-hidden");
