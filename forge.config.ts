import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";

const config: ForgeConfig = {
  packagerConfig: {
    asar: false,
    icon: "./src/frontend/assets/images/logo.ico",
    name: "EvalTech Monitor",
    executableName: "EvalTech-Monitor",
  },
  rebuildConfig: {
    force: false,
  },
  makers: [
    new MakerSquirrel({
      name: "EvalTech_Monitor",
      authors: "EvalTech",
      description: "Aplicación de Monitoreo Remoto",
      setupIcon: "./src/frontend/assets/images/logo.ico",
    }),
    new MakerZIP({}, ["darwin"]),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
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
