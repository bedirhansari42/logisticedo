"use strict";
/* electron-builder afterSign: Apple sertifikamız yok, ama paketin bütününe "ad-hoc" mühür koyarız (codesign -s -).
   Böylece .app tutarlı olur ve macOS imzasız paketlere sıkılaştığında da çalışır. Yalnızca macOS derlemelerinde. */
const path = require("node:path");
const { execFileSync } = require("node:child_process");

module.exports = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
};
