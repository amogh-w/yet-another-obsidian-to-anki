import { Plugin, Notice } from "obsidian";

export default class ObsidianToAnkiPlugin extends Plugin {
  async onload() {
    console.log("Obsidian to Anki plugin has been loaded.");

    this.addCommand({
      id: "noop",
      name: "No Operation Command",
      callback: () => new Notice("No operation."),
    });
  }
}