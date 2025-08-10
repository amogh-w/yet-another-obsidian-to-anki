import { AnkiManager } from "./AnkiManager";
import { logDebug, logInfo, logWarn, logError } from "../utils/logger";

/**
 * Regular expression to extract a note ID from a comment.
 * Example: <!-- noteId:123 -->
 */
const NOTE_ID_REGEX: RegExp = /<!--\s*noteId:(\d+)\s*-->/;

/**
 * Regular expression to extract valid note IDs from a comment.
 * Example: <!-- validNoteIds: 123, 456 -->
 */
const VALID_IDS_REGEX: RegExp = /<!--\s*validNoteIds:\s*([\d,\s]+)\s*-->/;

/**
 * FlashcardProcessor handles parsing flashcards from a markdown file,
 * synchronizing them with Anki (add, update, delete), and updating note metadata.
 */
export class FlashcardProcessor {
  /**
   * Constructs a FlashcardProcessor.
   * @param manager - An instance of AnkiManager for note operations.
   */
  constructor(private manager: AnkiManager) {}

  /**
   * Processes markdown content by identifying flashcards, synchronizing them with Anki,
   * and returning the updated content with note ID metadata.
   *
   * Flashcards are recognized by the format:
   *    front ::: back <!-- noteId:123 -->
   *
   * The plugin supports:
   * - Adding new notes (no noteId present)
   * - Updating existing notes (noteId present)
   * - Deleting removed notes (compared with previous validNoteIds)
   *
   * @param content - The raw markdown content of the file.
   * @returns The modified content with updated note IDs and a final validNoteIds comment.
   */
  async process(content: string): Promise<string> {
    const lines: string[] = content.split("\n");
    const noteIdsInFile: number[] = [];
    let updated = false;

    // Iterate through each line to find flashcards and sync with Anki
    for (let i = 0; i < lines.length; i++) {
      const line: string = lines[i];
      const idx: number = line.indexOf(" ::: ");
      if (idx === -1) continue; // Not a flashcard line

      const noteIdMatch: RegExpMatchArray | null = line.match(NOTE_ID_REGEX);
      const front: string = line.slice(0, idx).trim();
      // Remove noteId comment from back before syncing
      let back: string = line.slice(idx + 5).replace(NOTE_ID_REGEX, "").trim();

      if (!front || !back) continue; // Skip incomplete cards

      if (noteIdMatch) {
        // Existing note: update in Anki
        const noteId: number = parseInt(noteIdMatch[1]);
        try {
          logInfo(`Updating noteId ${noteId} with front: "${front}" and back: "${back}"`);
          await this.manager.updateNote(noteId, front, back);
          noteIdsInFile.push(noteId);
        } catch (error) {
          logError(`Failed to update noteId ${noteId}: ${error}`);
          throw error;
        }
      } else {
        // New note: add to Anki, append noteId comment
        try {
          logInfo(`Adding new note with front: "${front}" and back: "${back}"`);
          const newId: number = await this.manager.addNote(front, back);
          lines[i] = `${line} <!-- noteId:${newId} -->`;
          noteIdsInFile.push(newId);
          updated = true;
        } catch (error: any) {
          if (
            error.message.includes("cannot create note because it is a duplicate") ||
            error.message.includes("duplicate")
          ) {
            logWarn(`Duplicate note detected for front: "${front}". Skipping add.`);
          } else {
            logError(`Failed to add new note with front: "${front}" and back: "${back}": ${error}`);
            throw error;
          }
        }
      }
    }

    // Extract previous valid note IDs for deletion comparison
    const prevIds: number[] = this.parseValidNoteIds(content);
    // Determine which notes have been deleted (present before, not found now)
    const deletedIds: number[] = prevIds.filter(id => !noteIdsInFile.includes(id));

    if (deletedIds.length) {
      try {
        logWarn(`Deleting notes with IDs: ${deletedIds.join(", ")}`);
        await this.manager.deleteNotes(deletedIds);
      } catch (error) {
        logError(`Failed to delete notes with IDs ${deletedIds.join(", ")}: ${error}`);
        throw error;
      }
    }

    // Remove any previous validNoteIds comment and append updated one at end
    const cleanedLines: string[] = lines.filter(line => !VALID_IDS_REGEX.test(line));
    cleanedLines.push(`<!-- validNoteIds: ${noteIdsInFile.join(",")} -->`);

    logDebug(`Process completed. Content updated: ${updated}`);

    return cleanedLines.join("\n");
  }

  /**
   * Extracts the list of valid note IDs from a special comment line.
   *
   * Example format: <!-- validNoteIds: 123, 456, 789 -->
   *
   * @param content - The full markdown file content.
   * @returns An array of numeric note IDs.
   */
  private parseValidNoteIds(content: string): number[] {
    const match: RegExpMatchArray | null = content.match(VALID_IDS_REGEX);
    return match
      // Split by comma, trim whitespace, parse to number, filter invalid numbers
      ? match[1].split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n))
      : [];
  }
}