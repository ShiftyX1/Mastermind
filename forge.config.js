const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

module.exports = {
  packagerConfig: {
    asar: {
      unpack:
        "**/{onnxruntime-node,onnxruntime-common,@huggingface/transformers,sharp,@img}/**",
    },
    extraResource: ["./src/assets/SystemAudioDump"],
    name: "Mastermind",
    icon: "src/assets/logo",
    // use `security find-identity -v -p codesigning` to find your identity
    // for macos signing
    // also fuck apple
    // osxSign: {
    //    identity: '<paste your identity here>',
    //   optionsForFile: (filePath) => {
    //       return {
    //           entitlements: 'entitlements.plist',
    //       };
    //   },
    // },
    // notarize if off cuz i ran this for 6 hours and it still didnt finish
    // osxNotarize: {
    //    appleId: 'your apple id',
    //    appleIdPassword: 'app specific password',
    //    teamId: 'your team id',
    // },
  },
  rebuildConfig: {
    // Ensure onnxruntime-node is rebuilt against Electron's Node.js headers
    // so the native binding matches the ABI used in packaged builds.
    onlyModules: ["onnxruntime-node", "sharp"],
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "mastermind",
        productName: "Mastermind",
        shortcutName: "Mastermind",
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
      },
    },
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: {
        format: "ULFO",
        icon: "src/assets/logo.icns",
        name: "Mastermind",
      },
    },
    {
      name: "@reforged/maker-appimage",
      platforms: ["linux"],
      config: {
        options: {
          name: "Mastermind",
          productName: "Mastermind",
          genericName: "AI Assistant",
          description: "AI assistant for interviews and learning",
          categories: ["Development", "Education"],
          icon: "src/assets/logo.png",
        },
      },
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
