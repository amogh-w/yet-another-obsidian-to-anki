import { Plugin, Notice, TFile } from "obsidian";

export default class ObsidianToAnkiPlugin extends Plugin {
  getDeckName(file: TFile) {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;

    if(frontmatter) {
     return(frontmatter.deck);
    } else {
        console.log("Cannot read Deck Name.");
        new Notice("Cannot read Deck Name.");
    }
  }

  async onload() {
    console.log("Obsidian to Anki plugin has been loaded.");

    this.addRibbonIcon("dice", "Parse flashcards in current file", async () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        const deckName = this.getDeckName(activeFile);
        console.log("Deck Name:", deckName);

        // Send request to create deck
        if (deckName) {
          try {
            const response = await fetch("http://localhost:8765", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                action: "createDeck",
                version: 6,
                params: {
                  deck: deckName
                }
              })
            });
            const result = await response.json();
            console.log("Anki Connect Response:", result);
          } catch (err) {
            console.error("Failed to create deck via AnkiConnect:", err);
          }
        }

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