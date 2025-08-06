import { Plugin, Notice, TFile } from "obsidian";

export default class ObsidianToAnkiPlugin extends Plugin {
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

  async checkAddableNotes(notes: any[]) {
    // Check with AnkiConnect which notes can be added without errors
    try {
      const response = await fetch("http://localhost:8765", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "canAddNotesWithErrorDetail",
          version: 6,
          params: {
            notes: notes
          }
        })
      });

      const result = await response.json();

      if (result.error) {
        console.error("Error checking addable notes:", result.error);
        return [];
      }

      // Log the status of each note's addability
      result.result.forEach((noteResult: any, index: number) => {
        if (noteResult.canAdd) {
          console.log(`Note ${index} can be added.`);
        } else {
          console.warn(`Note ${index} cannot be added: ${noteResult.error}`);
        }
      });

      return result.result.map((noteResult: any) => noteResult.canAdd);
    } catch (err) {
      console.error("Failed to check addable notes via AnkiConnect:", err);
      return [];
    }
  }

  async onload() {
    console.log("Obsidian to Anki plugin has been loaded.");

    this.addRibbonIcon("dice", "Parse flashcards in current file", async () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        // Retrieve deck name from file frontmatter
        const deckName = this.getDeckName(activeFile);
        if (deckName) {
          console.log("Deck Name:", deckName);

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
            } else {
              console.log(`Deck '${deckName}' creation result:`, result);
              new Notice(`Deck '${deckName}' is ready.`);
            }
          } catch (err) {
            console.error("Failed to create deck via AnkiConnect:", err);
            new Notice(`Failed to create deck '${deckName}'.`);
          }

          // Read the content of the active file
          const fileContent = await this.app.vault.read(activeFile);
          const lines = fileContent.split('\n');

          // Parse lines containing ' ::: ' as flashcards
          const flashcards: { front: string; back: string }[] = [];
          lines.forEach(line => {
            const idx = line.indexOf(' ::: ');
            if (idx !== -1) {
              const front = line.slice(0, idx).trim();
              const back = line.slice(idx + 5).trim();
              if (front && back) {
                flashcards.push({ front, back });
              } else {
                console.warn("Skipped flashcard with empty front or back:", line);
              }
            }
          });

          if (flashcards.length > 0) {
            console.log("Parsed flashcards:", flashcards);
            new Notice(`Found ${flashcards.length} flashcard(s) in this file.`);
          } else {
            console.info("No flashcards found in this file.");
            new Notice("No flashcards found in this file.");
            return; // Exit early if no flashcards to process
          }

          // Prepare notes for Anki
          const notes = flashcards.map(flashcard => ({
            deckName: deckName,
            modelName: "Basic",
            fields: {
              Front: flashcard.front,
              Back: flashcard.back
            },
            tags: ["obsidian"]
          }));

          console.log("Prepared notes for Anki:", notes);

          // Check which notes can be added
          const canAddArray = await this.checkAddableNotes(notes);

          // Add notes that can be added or update existing ones
          for (let i = 0; i < notes.length; i++) {
            if (canAddArray[i]) {
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
                      note: notes[i]
                    }
                  })
                });
                const addResult = await addResponse.json();
                if (addResult.error) {
                  console.error(`Failed to add note ${i}:`, addResult.error);
                  new Notice(`Failed to add note ${i}: ${addResult.error}`);
                } else {
                  const noteId = addResult.result;
                  console.log(`Note ${i} added with noteId: ${noteId}`);

                  // Append noteId comment to corresponding line if not already present
                  for (let j = 0; j < lines.length; j++) {
                    const idx = lines[j].indexOf(' ::: ');
                    if (idx !== -1) {
                      const front = lines[j].slice(0, idx).trim();
                      const back = lines[j].slice(idx + 5).trim();
                      if (front === flashcards[i].front && back === flashcards[i].back) {
                        if (!lines[j].includes(`<!-- noteId:`)) {
                          lines[j] = lines[j] + ` <!-- noteId:${noteId} -->`;
                        }
                        break;
                      }
                    }
                  }
                }
              } catch (err) {
                console.error(`Failed to add note ${i} via AnkiConnect:`, err);
                new Notice(`Failed to add note ${i} via AnkiConnect.`);
              }
            } else {
              // Note cannot be added, check if noteId exists in the line and update note
              let noteIdFound = false;
              for (let j = 0; j < lines.length; j++) {
                const idx = lines[j].indexOf(' ::: ');
                if (idx !== -1) {
                  const front = lines[j].slice(0, idx).trim();
                  const backAndComment = lines[j].slice(idx + 5).trim();
                  const noteIdMatch = lines[j].match(/<!--\s*noteId:(\d+)\s*-->/);
                  if (front === flashcards[i].front && backAndComment.startsWith(flashcards[i].back) && noteIdMatch) {
                    const noteId = parseInt(noteIdMatch[1]);
                    noteIdFound = true;
                    // Prepare updateNote request
                    const updateParams = {
                      action: "updateNoteFields",
                      version: 6,
                      params: {
                        note: {
                          id: noteId,
                          fields: {
                            Front: flashcards[i].front,
                            Back: flashcards[i].back
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
                        console.error(`Failed to update note ${noteId}:`, updateResult.error);
                        new Notice(`Failed to update note ${noteId}: ${updateResult.error}`);
                      } else {
                        console.log(`Note ${noteId} updated successfully.`);
                        new Notice(`Note ${noteId} updated successfully.`);
                      }
                    } catch (err) {
                      console.error(`Failed to update note ${noteId} via AnkiConnect:`, err);
                      new Notice(`Failed to update note ${noteId} via AnkiConnect.`);
                    }
                    break;
                  }
                }
              }
              if (!noteIdFound) {
                console.info(`Skipping note ${i} as it cannot be added and no noteId found.`);
              }
            }
          }

          // Update the file with appended noteId comments
          const updatedContent = lines.join('\n');
          try {
            await this.app.vault.modify(activeFile, updatedContent);
            console.log("File updated with note IDs.");
          } catch (err) {
            console.error("Failed to update file with note IDs:", err);
            new Notice("Failed to update file with note IDs.");
          }
        } else {
          console.warn("Deck name not found in frontmatter.");
          new Notice("Deck name not found in frontmatter. Please add 'deck' to the frontmatter.");
        }
      } else {
        console.warn("No active file open.");
        new Notice("No active file open.");
      }
    });
  }
}