import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";

const config: ForgeConfig = {
  rebuildConfig: {
    onlyModules: [],
  },
  packagerConfig: {
    asar: {
      unpack: "**/*.node",
      unpackDir: "node_modules/node-pty",
    },
    name: "Bastion",
    // Vite bundles JS, but these external native modules must ship as well.
    // Packager's normal production pruning removes development dependencies.
    ignore: (file) => Boolean(file)
      && file !== "/.vite" && !file.startsWith("/.vite/")
      && file !== "/node_modules" && !file.startsWith("/node_modules/"),
    osxSign: {
      identity: "-",
      identityValidation: false,
      optionsForFile: () => ({ hardenedRuntime: false }),
    },
  },
  makers: [new MakerDMG({}), new MakerZIP({})],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "electron/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "electron/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
  ],
};

export default config;
