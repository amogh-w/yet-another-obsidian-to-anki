/**
 * AnkiManager class is responsible for handling communication with AnkiConnect.
 * It supports deck creation, note addition, note updates, and note deletions.
 */
import { logDebug, logInfo, logWarn, logError } from "../utils/logger";

export class AnkiManager {
  constructor(private deckName: string) {}

  /**
   * Sends a request to AnkiConnect with a given action and parameters.
   * @param action - The AnkiConnect action to perform.
   * @param params - The parameters to include in the request.
   * @returns The result returned by AnkiConnect.
   * @throws Error if AnkiConnect returns an error.
   */
  async request(action: string, params: any): Promise<any> {
    logDebug(`Sending request to AnkiConnect: action=${action}, params=${JSON.stringify(params)}`);
    const response = await fetch("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: 6, params })
    });

    const json = await response.json();
    if (json.error) {
      logError(`AnkiConnect returned error for action=${action}: ${json.error}`);
      throw new Error(json.error);
    }
    logDebug(`AnkiConnect returned result for action=${action}: ${JSON.stringify(json.result)}`);
    return json.result;
  }

  /**
   * Creates a new deck in Anki if it doesn't already exist.
   * @returns The result from AnkiConnect (usually null or the deck ID).
   */
  async createDeck(): Promise<any> {
    logInfo(`Creating deck: ${this.deckName}`);
    return this.request("createDeck", { deck: this.deckName });
  }

  /**
   * Adds a new note with front and back content to the current deck.
   * @param front - The front text of the flashcard.
   * @param back - The back text of the flashcard.
   * @returns The note ID of the newly added note.
   */
  async addNote(front: string, back: string): Promise<number> {
    logInfo(`Adding note to deck ${this.deckName}`);
    return this.request("addNote", {
      note: {
        deckName: this.deckName,
        modelName: "Basic",
        fields: { Front: front, Back: back },
        tags: ["obsidian"]
      }
    });
  }

  /**
   * Updates an existing note in Anki with new front and back content.
   * @param noteId - The ID of the note to update.
   * @param front - The new front text.
   * @param back - The new back text.
   * @returns The result from AnkiConnect.
   */
  async updateNote(noteId: number, front: string, back: string): Promise<any> {
    logInfo(`Updating note ${noteId} in deck ${this.deckName}`);
    return this.request("updateNoteFields", {
      note: {
        id: noteId,
        fields: { Front: front, Back: back }
      }
    });
  }

  /**
   * Deletes notes in Anki by their note IDs.
   * @param noteIds - Array of note IDs to delete.
   * @returns The result from AnkiConnect.
   */
  async deleteNotes(noteIds: number[]): Promise<any> {
    logInfo(`Deleting notes: ${noteIds.join(", ")}`);
    return this.request("deleteNotes", { notes: noteIds });
  }
}