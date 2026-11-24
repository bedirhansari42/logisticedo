"use strict";
/* Renderer'a yalnızca yedekleme (üç işlev) ve güncelleme kontrolü (üç işlev) için dar köprüler verir; Node/Electron'a başka erişim yok. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lgxBackup", {
  chooseFolder: (defaultPath) => ipcRenderer.invoke("lgx:backup:choose-folder", { defaultPath }),
  saveAs: (json, name, dir) => ipcRenderer.invoke("lgx:backup:save-as", { json, name, dir }),
  writeAuto: (dir, json) => ipcRenderer.invoke("lgx:backup:write-auto", { dir, json })
});

// Güncelleme: yüklü sürüm, GitHub'daki en son kararlı release ve release sayfasını tarayıcıda açma
contextBridge.exposeInMainWorld("lgxUpdate", {
  version: () => ipcRenderer.invoke("lgx:update:version"),
  check: () => ipcRenderer.invoke("lgx:update:check"),
  open: (url) => ipcRenderer.invoke("lgx:update:open", url)
});
