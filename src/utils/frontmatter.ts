import { TFile, MetadataCache, App, Notice } from "obsidian";

/**
 * Retrieves the deck name from the frontmatter of a given Obsidian file.
 *
 * This utility reads the metadata cache of a file to extract the `deck` field.
 * If the frontmatter or the `deck` key is missing, a user-facing notice is shown.
 *
 * @param app - The Obsidian App instance.
 * @param file - The TFile from which to read frontmatter metadata.
 * @returns The deck name as a string if present, otherwise undefined.
 */
export function getDeckNameFromFrontmatter(app: App, file: TFile): string | undefined {
  const cache = app.metadataCache.getFileCache(file);
  const frontmatter = cache?.frontmatter;

  if (!frontmatter) {
    new Notice("No frontmatter found in the current file.");
    return;
  }

  if (!frontmatter.deck) {
    new Notice("Missing 'deck' field in frontmatter.");
    return;
  }

  return frontmatter.deck;
}