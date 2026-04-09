import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("bastion", {
  ping: () => "pong",
});
