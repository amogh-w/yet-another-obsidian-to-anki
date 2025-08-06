import { Plugin, Notice, TFile } from "obsidian";

/**
 * Yet Another Obsidian To Anki Plugin
 * 
 * This plugin enables users to create, update, and delete Anki flashcards directly from Obsidian notes.
 * It reads flashcard data from the current note, interacts with AnkiConnect to manage decks and notes,
 * and keeps track of note IDs within the file for synchronization.
 */
export default class YetAnotherObsidianToAnkiPlugin extends Plugin {
  /**
   * Retrieves the deck name specified in the frontmatter of the given file.
   * @param {TFile} file - The Obsidian file to extract the deck name from.
   * @returns {string | undefined} The deck name if found; otherwise undefined.
   */
  getDeckName(file: TFile): string | undefined {
    // Retrieve the metadata cache for the file
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;

    if (frontmatter) {
      console.log("Frontmatter found:", frontmatter);
      
      if (frontmatter.deck) {
        // Return the deck name from frontmatter if present
        return frontmatter.deck;
      } else {
        console.warn("Frontmatter is present, but 'deck' is missing.");
        new Notice("Deck name ('deck') is missing in frontmatter.");
      }
    } else {
      console.warn("Cannot read Deck Name. No frontmatter present.");
      new Notice("Cannot read Deck Name.");
    }

    return undefined;
  }

  /**
   * Extracts all note IDs from the given lines of text.
   * Note IDs are expected to be in the format <!-- noteId:123 -->.
   * @param {string[]} lines - Array of lines from the note file.
   * @returns {number[]} Array of extracted note IDs.
   */
  extractNoteIds(lines: string[]): number[] {
    const noteIds: number[] = [];
    const noteIdRegex = /<!--\s*noteId:(\d+)\s*-->/g;
    for (const line of lines) {
      let match;
      while ((match = noteIdRegex.exec(line)) !== null) {
        noteIds.push(parseInt(match[1]));
      }
    }
    return noteIds;
  }

  /**
   * Parses the validNoteIds comment line to retrieve an array of valid note IDs.
   * The comment line format is expected to be <!-- validNoteIds: 123, 456, 789 -->.
   * @param {string[]} lines - Array of lines from the note file.
   * @returns {number[]} Array of valid note IDs parsed from the comment, or empty if none found.
   */
  parseValidNoteIds(lines: string[]): number[] {
    const validNoteIdsRegex = /<!--\s*validNoteIds:\s*([\d,\s]+)\s*-->/;
    for (const line of lines) {
      const match = line.match(validNoteIdsRegex);
      if (match) {
        return match[1]
          .split(",")
          .map(id => parseInt(id.trim()))
          .filter(id => !isNaN(id));
      }
    }
    return [];
  }

  /**
   * Updates or adds the validNoteIds comment line in the given lines.
   * @param {string[]} lines - Array of lines from the note file.
   * @param {number[]} validIds - Array of valid note IDs to include in the comment.
   * @returns {string[]} Updated array of lines with the validNoteIds comment line.
   */
  updateValidNoteIdsComment(lines: string[], validIds: number[]): string[] {
    const validNoteIdsRegex = /<!--\s*validNoteIds:\s*([\d,\s]+)\s*-->/;
    const commentLine = `<!-- validNoteIds: ${validIds.join(",")} -->`;
    let found = false;
    const updatedLines = lines.map(line => {
      if (validNoteIdsRegex.test(line)) {
        found = true;
        return commentLine;
      }
      return line;
    });
    if (!found) {
      // Append the validNoteIds comment line if not found
      updatedLines.push(commentLine);
    }
    return updatedLines;
  }

  /**
   * Called when the plugin is loaded. Adds a ribbon icon to trigger flashcard parsing
   * and synchronization with Anki via AnkiConnect.
   */
  async onload() {
    console.log("Yet Another Obsidian To Anki plugin has been loaded.");

    this.addRibbonIcon("dice", "Parse flashcards in current file", async () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        console.warn("No active file open.");
        new Notice("No active file open.");
        return;
      }

      const deckName = this.getDeckName(activeFile);
      if (!deckName) {
        console.warn("Deck name not found in frontmatter.");
        new Notice("Deck name not found in frontmatter. Please add 'deck' to the frontmatter.");
        return;
      }

      // Attempt to create the deck via AnkiConnect
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
        if (result.error) {
          console.error("Error creating deck via AnkiConnect:", result.error);
          new Notice(`Failed to create deck '${deckName}'.`);
          return;
        } else {
          console.log(`Deck '${deckName}' creation result:`, result);
          new Notice(`Deck '${deckName}' is ready.`);
        }
      } catch (err) {
        console.error("Failed to create deck via AnkiConnect:", err);
        new Notice(`Failed to create deck '${deckName}'.`);
        return;
      }

      const fileContent = await this.app.vault.read(activeFile);
      const lines = fileContent.split('\n');
      let updated = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const idx = line.indexOf(' ::: ');
        if (idx === -1) {
          // Line does not contain flashcard delimiter, skip processing
          continue;
        }

        const noteIdMatch = line.match(/<!--\s*noteId:(\d+)\s*-->/);
        const front = line.slice(0, idx).trim();
        // Extract back content ignoring the noteId comment if present
        let back = line.slice(idx + 5).trim();
        if (noteIdMatch) {
          // Remove the noteId comment from back if present
          back = back.replace(/<!--\s*noteId:\d+\s*-->/, '').trim();
        }

        if (!front || !back) {
          console.warn(`Skipping line ${i} due to empty front or back:`, line);
          continue;
        }

        if (!noteIdMatch) {
          // Add new note to Anki
          const note = {
            deckName: deckName,
            modelName: "Basic",
            fields: {
              Front: front,
              Back: back
            },
            tags: ["obsidian"]
          };
          try {
            const addResponse = await fetch("http://localhost:8765", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                action: "addNote",
                version: 6,
                params: {
                  note: note
                }
              })
            });
            const addResult = await addResponse.json();
            if (addResult.error) {
              console.error(`Failed to add note at line ${i}:`, addResult.error);
              new Notice(`Failed to add note at line ${i}: ${addResult.error}`);
            } else {
              const newNoteId = addResult.result;
              console.log(`Note added at line ${i} with noteId: ${newNoteId}`);
              // Append noteId comment to the line
              lines[i] = line + ` <!-- noteId:${newNoteId} -->`;
              updated = true;
              new Notice(`Note added at line ${i}.`);
            }
          } catch (err) {
            console.error(`Failed to add note at line ${i} via AnkiConnect:`, err);
            new Notice(`Failed to add note at line ${i} via AnkiConnect.`);
          }
        } else {
          // Update existing note in Anki
          const noteId = parseInt(noteIdMatch[1]);
          const updateParams = {
            action: "updateNoteFields",
            version: 6,
            params: {
              note: {
                id: noteId,
                fields: {
                  Front: front,
                  Back: back
                }
              }
            }
          };
          try {
            const updateResponse = await fetch("http://localhost:8765", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(updateParams)
            });
            const updateResult = await updateResponse.json();
            if (updateResult.error) {
              console.error(`Failed to update note ${noteId} at line ${i}:`, updateResult.error);
              new Notice(`Failed to update note ${noteId} at line ${i}: ${updateResult.error}`);
            } else {
              console.log(`Note ${noteId} updated successfully at line ${i}.`);
              new Notice(`Note ${noteId} updated successfully at line ${i}.`);
            }
          } catch (err) {
            console.error(`Failed to update note ${noteId} at line ${i} via AnkiConnect:`, err);
            new Notice(`Failed to update note ${noteId} at line ${i} via AnkiConnect.`);
          }
        }
      }

      if (updated) {
        const updatedContent = lines.join('\n');
        try {
          await this.app.vault.modify(activeFile, updatedContent);
          console.log("File updated with note IDs.");
        } catch (err) {
          console.error("Failed to update file with note IDs:", err);
          new Notice("Failed to update file with note IDs.");
        }
      } else {
        console.log("No new notes added, file not updated.");
      }

      // After adding/updating notes, handle deletion of notes removed from the file
      try {
        const currentNoteIds = this.extractNoteIds(lines);
        const previousNoteIds = this.parseValidNoteIds(lines);

        // Determine which notes have been deleted from the file
        const deletedNoteIds = previousNoteIds.filter(id => !currentNoteIds.includes(id));

        if (deletedNoteIds.length > 0) {
          console.log("Deleting notes with IDs:", deletedNoteIds);
          const deleteResponse = await fetch("http://localhost:8765", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              action: "deleteNotes",
              version: 6,
              params: {
                notes: deletedNoteIds
              }
            })
          });
          const deleteResult = await deleteResponse.json();
          if (deleteResult.error) {
            console.error("Failed to delete notes via AnkiConnect:", deleteResult.error);
            new Notice(`Failed to delete notes: ${deleteResult.error}`);
          } else {
            console.log("Successfully deleted notes:", deletedNoteIds);
            new Notice(`Deleted notes: ${deletedNoteIds.join(", ")}`);
          }
        }

        // Update or add the validNoteIds comment line to reflect current notes
        const linesWithoutValidNoteIds = lines.filter(line => !/<!--\s*validNoteIds:\s*[\d,\s]+-->/i.test(line));
        const updatedLinesWithValidNoteIds = this.updateValidNoteIdsComment(linesWithoutValidNoteIds, currentNoteIds);
        const finalContent = updatedLinesWithValidNoteIds.join('\n');

        if (finalContent !== fileContent) {
          try {
            await this.app.vault.modify(activeFile, finalContent);
            console.log("File updated with validNoteIds comment.");
          } catch (err) {
            console.error("Failed to update file with validNoteIds comment:", err);
            new Notice("Failed to update file with validNoteIds comment.");
          }
        }
      } catch (err) {
        console.error("Error during note deletion and validNoteIds update:", err);
        new Notice("Error during note deletion and validNoteIds update.");
      }
    });
  }
}