import { Plugin, Notice } from "obsidian";

export default class ObsidianToAnkiPlugin extends Plugin {
  async onload() {
    console.log("Obsidian to Anki plugin has been loaded.");

    this.addRibbonIcon("dice", "Parse flashcards in current file", async () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        const fileContent = await this.app.vault.read(activeFile);
        // Parse lines with ' ::: ' as flashcards
        const flashcards: { front: string; back: string }[] = [];
        fileContent.split('\n').forEach(line => {
          const idx = line.indexOf(' ::: ');
          if (idx !== -1) {
            const front = line.slice(0, idx).trim();
            const back = line.slice(idx + 5).trim();
            if (front && back) {
              flashcards.push({ front, back });
            }
          }
        });
        console.log("Parsed flashcards:", flashcards);
        if (flashcards.length > 0) {
          new Notice(`Found ${flashcards.length} flashcard(s) in this file.`);
        } else {
          new Notice("No flashcards found in this file.");
        }
      } else {
        console.log("No active file open.");
        new Notice("No active file open.");
      }
    });
  }
}