"use strict";
const { app, BrowserWindow, Menu, protocol, net, shell, session, dialog, ipcMain } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const { isAllowed, isTrustedUrl, isTrustedSender, UPDATE_API_URL, DOWNLOAD_PREFIX: DEFAULT_DOWNLOAD_PREFIX } = require("./net-policy.js");

// Uygulama adı: menü çubuğu, Hakkında penceresi ve Dock bu adı kullanır
app.setName("logisticedo");

const SCHEME = "app";
const HOST = "logisticedo";
const ROOT = path.join(__dirname, "app");
// Geliştirme: ELECTRON_START_URL=http://localhost:5173 electron .  (Vite sunucusunu açar, ağ kilidi yalnızca bu adrese izin verir)
const DEV_URL = process.env.ELECTRON_START_URL || null;
// Sürüm kontrolü adresi. LGX_UPDATE_URL yalnızca paketlenmemiş (geliştirme) derlemede geçerlidir.
const UPDATE_URL = (!app.isPackaged && process.env.LGX_UPDATE_URL) || UPDATE_API_URL;
// Paket indirme öneki: test sunucusunda (yalnızca paketlenmemiş) o sunucunun /dl/ yolu.
const DOWNLOAD_PREFIX = UPDATE_URL === UPDATE_API_URL ? DEFAULT_DOWNLOAD_PREFIX : new URL(UPDATE_URL).origin + "/dl/";

// ES modülleri ve IndexedDB file:// üzerinde güvenilir çalışmaz; kalıcı, güvenli bir kaynak (origin) için
// özel bir protokol kullanılır. Antetler bu origin'in IndexedDB'sinde kalır.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
]);

// Otomatik testlerde pencere başka pencerelerin arkasında kalabilir; Chromium bu durumda çizim zamanlayıcılarını
// (requestAnimationFrame) durdurur ve pdf.js bekler. Yalnızca test modunda kısıtlama kapatılır.
const TEST_MODE = !!process.env.LGX_TEST_DIR;
if (TEST_MODE) {
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
}

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
app.on("second-instance", () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

async function serveFile(request) {
  const url = new URL(request.url);
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(ROOT, rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const res = await net.fetch(pathToFileURL(file).toString());
    return res;
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

// "Dosyalar cihazdan çıkmaz" vaadini uygulama düzeyinde zorla: uygulama dışına yalnızca sürüm kontrolü için
// tek bir GitHub adresi açıktır (karar net-policy.js'de, testli).
function lockNetwork(ses) {
  ses.webRequest.onBeforeRequest((details, cb) => {
    cb({ cancel: !isAllowed(details.url, { scheme: SCHEME, devUrl: DEV_URL, updateUrl: UPDATE_URL, downloadPrefix: DOWNLOAD_PREFIX, method: details.method, fromRenderer: details.webContentsId != null }) });
  });
}


function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#f3f5f5",
    title: "logisticedo",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
      spellcheck: false,
      backgroundThrottling: !TEST_MODE
    }
  });
  // Pencere ekranın çalışma alanını doldurur (menü çubuğu ve dock hariç); küçültmek için kullanıcı yeniden boyutlandırabilir
  win.once("ready-to-show", () => { win.maximize(); win.show(); });

  // Uygulama içinde başka adrese gidilemez; dış bağlantılar sistem tarayıcısında açılır.
  win.webContents.on("will-navigate", (e, url) => {
    if (!isTrustedUrl(url, { scheme: SCHEME, host: HOST, devUrl: DEV_URL })) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(DEV_URL || `${SCHEME}://${HOST}/index.html`);
  win.on("closed", () => { win = null; });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" }, { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ type: "separator" }, { role: "toggleDevTools" }, { role: "reload" }])
      ]
    },
    { role: "windowMenu" }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Test için: LGX_TEST_DIR verilirse indirmeler sormadan o klasöre kaydedilir. Normalde kaydetme penceresi açılır.
function hookDownloads(ses) {
  const dir = process.env.LGX_TEST_DIR;
  if (!dir) return;
  ses.on("will-download", (_e, item) => item.setSavePath(path.join(dir, item.getFilename())));
}

app.whenReady().then(() => {
  // Geliştirmede (paketlenmemiş) Dock simgesi Electron'unki olur; kendi simgemizi koy
  if (process.platform === "darwin" && app.dock && !app.isPackaged) app.dock.setIcon(path.join(__dirname, "build", "icon.png"));
  hookDownloads(session.defaultSession);
  // Önceki güncellemeden kalanlar: indirilen paket klasörü ve macOS'ta .app.old yedeği
  require("./update-download.js").cleanupDir(path.join(app.getPath("temp"), "logisticedo-update"));
  if (process.platform === "darwin" && app.isPackaged) require("./update-apply.js").finishMacUpdate(process.execPath);
  require("./backup-main.js").register({
    dialog, ipcMain, getWindow: () => win, testDir: process.env.LGX_TEST_DIR || null,
    // yalnızca kendi sayfamızdan gelen istekler (uygulama protokolü ya da geliştirme sunucusu)
    isTrusted: (e) => isTrustedSender(e, { scheme: SCHEME, host: HOST, devUrl: DEV_URL })
  });
  require("./update-main.js").register({
    ipcMain, app, net, shell, updateUrl: UPDATE_URL, downloadPrefix: DOWNLOAD_PREFIX, spawn, tmpRoot: app.getPath("temp"),
    isTrusted: (e) => isTrustedSender(e, { scheme: SCHEME, host: HOST, devUrl: DEV_URL })
  });
  protocol.handle(SCHEME, serveFile);
  lockNetwork(session.defaultSession);
  buildMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
