import { Plugin } from "obsidian";
import { AnkiManager } from "./src/core/AnkiManager";
import { FlashcardProcessor } from "./src/core/FlashcardProcessor";
import { getDeckNameFromFrontmatter } from "./src/utils/frontmatter";
import { logDebug, logInfo, logWarn, logError } from "./src/utils/logger";

/**
 * Main class for the Yet Another Obsidian To Anki Plugin.
 * 
 * This plugin allows users to synchronize markdown-based flashcards from their
 * current Obsidian note to Anki via AnkiConnect. Flashcards are parsed and note IDs are tracked
 * directly inside the markdown file using comment tags.
 */
export default class YetAnotherObsidianToAnkiPlugin extends Plugin {
  /**
   * Called automatically by Obsidian when the plugin is loaded.
   * Adds a ribbon icon to the sidebar, which on click:
   * - Retrieves the current active file
   * - Extracts the deck name from its frontmatter
   * - Creates the Anki deck (if needed)
   * - Processes flashcards (adds/updates/deletes)
   * - Modifies the note if changes were made
   */
  async onload() {
    logInfo("Plugin loaded.");

    this.addRibbonIcon("dice", "Sync flashcards with Anki", async () => {
      const file = this.app.workspace.getActiveFile();
      if (!file) {
        logWarn("No active file open.");
        return;
      }

      const deckName = getDeckNameFromFrontmatter(this.app, file);
      if (!deckName) {
        logWarn("Deck name not found in frontmatter.");
        return;
      }

      const content = await this.app.vault.read(file);

      const manager = new AnkiManager(deckName);

      // Ensure the deck exists in Anki before syncing
      await manager.createDeck();

      // Parse the file and return updated content with noteId metadata
      const updatedContent = await new FlashcardProcessor(manager).process(content);

      // Update the file only if changes were made
      if (updatedContent && updatedContent !== content) {
        await this.app.vault.modify(file, updatedContent);
        logInfo("File updated successfully.");
      }
    });
  }
}