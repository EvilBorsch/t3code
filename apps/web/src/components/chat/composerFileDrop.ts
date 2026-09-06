import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";

export interface ComposerFileDropPlan {
  attachmentFiles: File[];
  mentionText: string | null;
}

/**
 * Разбирает файлы, брошенные из ОС на композер. Файл с известным абсолютным
 * путём (его умеет отдавать только десктоп через Electron webUtils) становится
 * меншеном — агент прочитает его сам. Картинки и всё, для чего пути нет
 * (браузер, синтетические File из другого приложения), уходят во вложения.
 */
export function planComposerFileDrop(
  files: readonly File[],
  resolvePath: ((file: File) => string) | undefined,
): ComposerFileDropPlan {
  const attachmentFiles: File[] = [];
  const mentions: string[] = [];
  for (const file of files) {
    const path = file.type.startsWith("image/") ? "" : (resolvePath?.(file) ?? "");
    if (path.length === 0) {
      attachmentFiles.push(file);
      continue;
    }
    mentions.push(serializeComposerFileLink(path));
  }
  return {
    attachmentFiles,
    mentionText: mentions.length > 0 ? `${mentions.join(" ")} ` : null,
  };
}
