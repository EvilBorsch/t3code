import { describe, expect, it } from "@effect/vitest";

import { planComposerFileDrop } from "./composerFileDrop.ts";

const makeFile = (name: string, type: string): File => new File([""], name, { type });

describe("planComposerFileDrop", () => {
  it("turns a non-image file into an absolute-path mention", () => {
    const plan = planComposerFileDrop(
      [makeFile("log.txt", "text/plain")],
      () => "/Users/me/Downloads/log.txt",
    );
    expect(plan).toEqual({
      attachmentFiles: [],
      mentionText: "[log.txt](/Users/me/Downloads/log.txt) ",
    });
  });

  it("joins several dropped files into consecutive mentions", () => {
    const paths: Record<string, string> = {
      "a.txt": "/tmp/a.txt",
      "b.log": "/tmp/b.log",
    };
    const plan = planComposerFileDrop(
      [makeFile("a.txt", "text/plain"), makeFile("b.log", "")],
      (file) => paths[file.name] ?? "",
    );
    expect(plan.mentionText).toBe("[a.txt](/tmp/a.txt) [b.log](/tmp/b.log) ");
    expect(plan.attachmentFiles).toEqual([]);
  });

  it("routes images to the attachment flow untouched", () => {
    const image = makeFile("shot.png", "image/png");
    const plan = planComposerFileDrop(
      [image, makeFile("log.txt", "text/plain")],
      () => "/x/log.txt",
    );
    expect(plan.attachmentFiles).toEqual([image]);
    expect(plan.mentionText).toBe("[log.txt](/x/log.txt) ");
  });

  it("attaches every file when the platform cannot resolve paths", () => {
    const file = makeFile("log.txt", "text/plain");
    const plan = planComposerFileDrop([file], undefined);
    expect(plan).toEqual({ attachmentFiles: [file], mentionText: null });
  });

  it("attaches files without a backing path", () => {
    const ghost = makeFile("ghost.txt", "text/plain");
    const plan = planComposerFileDrop([ghost], () => "");
    expect(plan).toEqual({ attachmentFiles: [ghost], mentionText: null });
  });

  it("escapes paths with spaces via the markdown link serializer", () => {
    const plan = planComposerFileDrop(
      [makeFile("my log.txt", "text/plain")],
      () => "/Users/me/My Files/my log.txt",
    );
    expect(plan.mentionText).toBe("[my log.txt](/Users/me/My%20Files/my%20log.txt) ");
  });
});
