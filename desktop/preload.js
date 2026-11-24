"use strict";
/* Renderer'a yalnızca yedekleme (üç işlev) için dar bir köprü verir; Node/Electron'a başka erişim yok. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lgxBackup", {
  chooseFolder: (defaultPath) => ipcRenderer.invoke("lgx:backup:choose-folder", { defaultPath }),
  saveAs: (json, name, dir) => ipcRenderer.invoke("lgx:backup:save-as", { json, name, dir }),
  writeAuto: (dir, json) => ipcRenderer.invoke("lgx:backup:write-auto", { dir, json })
});

