import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";

export interface ComposerFileDropPlan {
  imageFiles: File[];
  mentionText: string | null;
  error: string | null;
}

/**
 * Разбирает файлы, брошенные из ОС на композер: картинки уходят во вложения
 * по прежнему пути, остальные превращаются в меншены с абсолютным путём.
 * Путь умеет отдавать только десктоп-сборка (Electron webUtils); в браузере
 * resolvePath отсутствует, и такие файлы дают ошибку вместо меншена.
 */
export function planComposerFileDrop(
  files: readonly File[],
  resolvePath: ((file: File) => string) | undefined,
): ComposerFileDropPlan {
  const imageFiles: File[] = [];
  const mentions: string[] = [];
  let error: string | null = null;
  for (const file of files) {
    if (file.type.startsWith("image/")) {
      imageFiles.push(file);
      continue;
    }
    if (resolvePath === undefined) {
      error = `Cannot attach '${file.name}': referencing files by path requires the desktop app. Use @ to mention workspace files.`;
      continue;
    }
    const path = resolvePath(file);
    if (path.length === 0) {
      // Синтетические File без файла на диске (например, drag из другого
      // приложения) пути не имеют.
      error = `Could not resolve a file path for '${file.name}'.`;
      continue;
    }
    mentions.push(serializeComposerFileLink(path));
  }
  return {
    imageFiles,
    mentionText: mentions.length > 0 ? `${mentions.join(" ")} ` : null,
    error,
  };
}
