import { Buffer } from "node:buffer";

import type * as NanoTokenizerModule from "gpt-tokenizer/model/gpt-5-nano-2025-08-07";

import {
  publicCommitEvidenceClass,
  PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT,
} from "@/lib/github-activity-public-summary";
import type {
  PublicCommitEvidence,
  PublicCommitEvidenceClass,
  PublicCommitFileEvidence,
  PublicCommitSummaryRepositoryContext,
} from "@/lib/github-activity-public-summary";

export const PUBLIC_COMMIT_SUMMARY_MAX_REQUEST_INPUT_TOKENS = 240_000;

const REQUEST_FRAMING_TOKEN_RESERVE = 64;
const SAMPLE_MANIFEST_TOKEN_RESERVE = 128;
const CHANGED_LINES_PER_SAMPLE = 18;
const MAX_CHANGED_LINE_BYTES = 1000;
const MAX_EXTREME_MESSAGE_BYTES = 16_000;
const MAX_EXACT_MODEL_INPUT_BYTES = 4_000_000;
const MAX_EXACT_PATCH_LINE_BYTES = 64_000;
const MAX_PARSED_PATCH_BYTES = 16_000_000;
const MAX_PARSED_SINGLE_PATCH_BYTES = 1_000_000;
const MAX_SAMPLE_BYTES = 7000;
const METADATA_LINES_PER_SAMPLE = 12;
const MAX_RETAINED_PATCH_LINES = 100_000;
const COMPACT_INPUT_VERSION = "deterministic-diff-v2";
const NO_DISALLOWED_SPECIAL_TOKENS = new Set<string>();
const taskInstruction = `Before answering, silently complete: “A person using this product can now …” Use that answer as the result when the evidence supports one. Otherwise describe the furthest downstream developer or operational result. Prefer visible behavior over its backing implementation; when visible options narrow feed, search, or listing results, call them filters.`;
const providerCapInstruction = `providerFileCapReached means GitHub returned its 3,000-file ceiling, so the returned file list may itself be incomplete.`;

const evidenceClassWeight: Readonly<Record<PublicCommitEvidenceClass, number>> =
  {
    product: 6,
    supporting: 2,
    "low-signal": 1,
  };

const evidenceClassOrder: readonly PublicCommitEvidenceClass[] = [
  "product",
  "supporting",
  "low-signal",
];

const fullEvidenceClassOrder: Readonly<
  Record<PublicCommitEvidenceClass, number>
> = {
  "low-signal": 0,
  supporting: 1,
  product: 2,
};

const evidenceClassRank = new Map(
  evidenceClassOrder.map((evidenceClass, index) => [evidenceClass, index])
);

interface PatchChangedLine {
  omittedBytes: number;
  ordinal: number;
  text: string;
}

interface PatchEditBlock {
  changedLines: readonly PatchChangedLine[];
  contextLinesBefore: number;
  index: number;
}

interface PatchHunk {
  changedLineCount: number;
  contextLines: number;
  editBlocks: readonly PatchEditBlock[];
  header: string;
  index: number;
  trailingContextLines: number;
}

interface PatchSample {
  blockIndex: number | null;
  changedLines: readonly PatchChangedLine[];
  hunkIndex: number | null;
  kind: "changes" | "metadata" | "raw";
  metadataLineEnd: number | null;
  metadataLineStart: number | null;
  metadataLines: readonly string[];
  partiallyCompactedMetadataLineIndexes: readonly number[];
  patchIndex: number;
}

interface RawPatchCompaction {
  evidenceLines: readonly string[];
  omittedBytes: number;
  originalBytes: number;
  originalLines: number;
}

interface UniquePatchEvidence {
  evidenceClass: PublicCommitEvidenceClass;
  fileIds: readonly string[];
  firstFilename: string;
  hunks: readonly PatchHunk[];
  index: number;
  metadataLines: readonly string[];
  patch: string;
  rawCompaction: RawPatchCompaction | null;
  samples: readonly PatchSample[];
}

type NanoTokenizer = typeof NanoTokenizerModule;

export interface BuildCommitPublicSummaryModelInputOptions {
  maxRequestInputTokens?: number;
}

let tokenizerPromise: Promise<NanoTokenizer> | undefined;
let systemPromptTokenCountPromise: Promise<number> | undefined;

const tokenizer = async () => {
  tokenizerPromise ??= import("gpt-tokenizer/model/gpt-5-nano-2025-08-07");
  return await tokenizerPromise;
};

const utf8Length = (value: string) => Buffer.byteLength(value, "utf-8");

const requestDefinitelyFits = (modelInput: string, maximum: number) =>
  utf8Length(PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT) +
    utf8Length(modelInput) +
    REQUEST_FRAMING_TOKEN_RESERVE <=
  maximum;

const countTextTokens = async (value: string) => {
  const { countTokens } = await tokenizer();
  return countTokens(value, {
    disallowedSpecial: NO_DISALLOWED_SPECIAL_TOKENS,
  });
};

const systemPromptTokenCount = async () => {
  systemPromptTokenCountPromise ??= countTextTokens(
    PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT
  );
  return await systemPromptTokenCountPromise;
};

const modelInputFitsTokenBudget = async (
  modelInput: string,
  maximum: number
) => {
  const allowed =
    maximum - (await systemPromptTokenCount()) - REQUEST_FRAMING_TOKEN_RESERVE;
  if (allowed < 1) {
    return false;
  }
  const { isWithinTokenLimit } = await tokenizer();
  return (
    isWithinTokenLimit(modelInput, allowed, {
      disallowedSpecial: NO_DISALLOWED_SPECIAL_TOKENS,
    }) !== false
  );
};

export const countCommitPublicSummaryRequestTokens = async (
  modelInput: string
) =>
  (await systemPromptTokenCount()) +
  (await countTextTokens(modelInput)) +
  REQUEST_FRAMING_TOKEN_RESERVE;

const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const publicCommitFileMetadata = (file: PublicCommitFileEvidence) =>
  JSON.stringify(
    {
      additions: file.additions,
      deletions: file.deletions,
      filename: file.filename,
      previousFilename: file.previousFilename,
      status: file.status,
    },
    null,
    2
  );

const fullEvidencePriority = (file: PublicCommitFileEvidence) =>
  fullEvidenceClassOrder[publicCommitEvidenceClass(file)];

const sortedCommitFiles = (files: readonly PublicCommitFileEvidence[]) =>
  files.toSorted((left, right) => compareText(left.filename, right.filename));

const exactModelInputTokenProbeIsSafe = (value: string) => {
  if (utf8Length(value) > MAX_EXACT_MODEL_INPUT_BYTES) {
    return false;
  }
  let lineStart = 0;
  while (lineStart <= value.length) {
    const newline = value.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? value.length : newline;
    const codeUnits = lineEnd - lineStart;
    if (
      codeUnits > MAX_EXACT_PATCH_LINE_BYTES / 4 &&
      utf8Length(value.slice(lineStart, lineEnd)) > MAX_EXACT_PATCH_LINE_BYTES
    ) {
      return false;
    }
    if (newline === -1) {
      break;
    }
    lineStart = newline + 1;
  }
  return true;
};

const repositoryEvidenceFrom = (
  repository: PublicCommitSummaryRepositoryContext
) => JSON.stringify(repository, null, 2);

const commitEvidenceFrom = (
  commit: PublicCommitEvidence,
  includeProviderFileCap = false
) =>
  JSON.stringify(
    {
      committedAt: commit.committedAt,
      message: commit.message,
      parents: commit.parents,
      ...(includeProviderFileCap
        ? { providerFileCapReached: commit.providerFileCapReached }
        : {}),
      sha: commit.sha,
      stats: commit.stats,
    },
    null,
    2
  );

const buildFullModelInput = (
  commit: PublicCommitEvidence,
  repository: PublicCommitSummaryRepositoryContext,
  sortedFiles: readonly PublicCommitFileEvidence[]
) => {
  const evidenceOrder = sortedFiles.toSorted(
    (left, right) => fullEvidencePriority(left) - fullEvidencePriority(right)
  );
  const fileIndex = sortedFiles.map(publicCommitFileMetadata);
  const providerCapReached = commit.providerFileCapReached;
  const changes = evidenceOrder.map((file) => {
    const metadata = publicCommitFileMetadata(file);
    return `FILE\n${metadata}\nGITHUB-RETURNED PATCH\n${file.patch ?? "[patch unavailable from GitHub]"}`;
  });
  if (providerCapReached) {
    return `REPOSITORY EVIDENCE\n${repositoryEvidenceFrom(repository)}\n\nCOMMIT EVIDENCE\n${commitEvidenceFrom(commit, true)}\n${providerCapInstruction}\n\nCOMPLETE GITHUB-RETURNED CHANGED FILE INDEX\n${fileIndex.join("\n\n")}\n\nGITHUB-RETURNED CHANGED FILES AND PATCH EVIDENCE\n${changes.join("\n\n")}\n\nEND OF EVIDENCE\n${taskInstruction}`;
  }
  return `REPOSITORY EVIDENCE\n${repositoryEvidenceFrom(repository)}\n\nCOMMIT EVIDENCE\n${commitEvidenceFrom(commit)}\n\nCOMPLETE GITHUB-RETURNED CHANGED FILE INDEX\n${fileIndex.join("\n\n")}\n\nGITHUB-RETURNED CHANGED FILES AND PATCH EVIDENCE\n${changes.join("\n\n")}\n\nEND OF EVIDENCE\n${taskInstruction}`;
};

const parsePatch = (
  patch: string
): { hunks: readonly PatchHunk[]; metadataLines: readonly string[] } => {
  const metadataLines: string[] = [];
  const hunks: {
    changedLineCount: number;
    contextLines: number;
    editBlocks: {
      changedLines: PatchChangedLine[];
      contextLinesBefore: number;
    }[];
    header: string;
    trailingContextLines: number;
  }[] = [];
  let currentHunk: (typeof hunks)[number] | null = null;
  let currentBlock: (typeof hunks)[number]["editBlocks"][number] | null = null;
  let pendingContextLines = 0;

  const finishHunk = () => {
    if (currentHunk !== null) {
      currentHunk.trailingContextLines = pendingContextLines;
      currentHunk.contextLines += pendingContextLines;
    }
    pendingContextLines = 0;
    currentBlock = null;
  };

  for (const line of patch.split(/\r?\n/u)) {
    if (line.startsWith("@@")) {
      finishHunk();
      currentHunk = {
        changedLineCount: 0,
        contextLines: 0,
        editBlocks: [],
        header: line,
        trailingContextLines: 0,
      };
      hunks.push(currentHunk);
      continue;
    }
    if (currentHunk === null) {
      if (line.length > 0) {
        metadataLines.push(line);
      }
      continue;
    }
    const changed = line.startsWith("+") || line.startsWith("-");
    if (changed) {
      if (currentBlock === null) {
        currentBlock = {
          changedLines: [],
          contextLinesBefore: pendingContextLines,
        };
        currentHunk.contextLines += pendingContextLines;
        pendingContextLines = 0;
        currentHunk.editBlocks.push(currentBlock);
      }
      currentHunk.changedLineCount += 1;
      currentBlock.changedLines.push({
        omittedBytes: 0,
        ordinal: currentHunk.changedLineCount,
        text: line,
      });
      continue;
    }
    if (line === "\\ No newline at end of file" && currentBlock !== null) {
      const previous = currentBlock.changedLines.at(-1);
      if (previous !== undefined) {
        previous.text = `${previous.text}\n${line}`;
      }
      continue;
    }
    if (line.length > 0) {
      pendingContextLines += 1;
      currentBlock = null;
    }
  }
  finishHunk();
  return {
    hunks: hunks.map((hunk, index) => ({
      ...hunk,
      editBlocks: hunk.editBlocks.map((block, blockIndex) => ({
        ...block,
        index: blockIndex,
      })),
      index,
    })),
    metadataLines,
  };
};

const spreadOrder = (length: number) => {
  if (length <= 1) {
    return length === 0 ? [] : [0];
  }
  const order = [0, length - 1];
  const intervals: (readonly [number, number])[] = [[1, length - 2]];
  for (const [start, end] of intervals) {
    if (start > end) {
      continue;
    }
    const middle = Math.floor((start + end) / 2);
    order.push(middle);
    intervals.push([start, middle - 1], [middle + 1, end]);
  }
  return order;
};

const utf8PrefixWithin = (value: string, maximumBytes: number) => {
  let low = 0;
  let high = Math.min(value.length, maximumBytes);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (utf8Length(value.slice(0, middle)) <= maximumBytes) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  let end = low;
  if (
    end > 0 &&
    end < value.length &&
    /[\uD800-\uDBFF]/u.test(value[end - 1] ?? "") &&
    /[\uDC00-\uDFFF]/u.test(value[end] ?? "")
  ) {
    end -= 1;
  }
  return value.slice(0, end);
};

const utf8SuffixWithin = (value: string, maximumBytes: number) => {
  const maximumCodeUnits = Math.min(value.length, maximumBytes);
  let low = 0;
  let high = maximumCodeUnits;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (utf8Length(value.slice(value.length - middle)) <= maximumBytes) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  let start = value.length - low;
  if (
    start > 0 &&
    start < value.length &&
    /[\uD800-\uDBFF]/u.test(value[start - 1] ?? "") &&
    /[\uDC00-\uDFFF]/u.test(value[start] ?? "")
  ) {
    start += 1;
  }
  return value.slice(start);
};

const clippedUtf8 = (
  value: string,
  source: "line" | "message" | "patch" = "line",
  maximumBytes = MAX_CHANGED_LINE_BYTES
) => {
  const originalBytes = utf8Length(value);
  if (originalBytes <= maximumBytes) {
    return { omittedBytes: 0, text: value };
  }
  let omittedBytes = originalBytes - maximumBytes;
  let marker = "";
  let head = "";
  let tail = "";
  for (let pass = 0; pass < 3; pass += 1) {
    marker = `…[${omittedBytes} UTF-8 bytes omitted from this ${source}]…`;
    const available = Math.max(2, maximumBytes - utf8Length(marker));
    head = utf8PrefixWithin(value, Math.ceil(available / 2));
    tail = utf8SuffixWithin(value, Math.floor(available / 2));
    omittedBytes = originalBytes - utf8Length(head) - utf8Length(tail);
  }
  marker = `…[${omittedBytes} UTF-8 bytes omitted from this ${source}]…`;
  return {
    omittedBytes,
    text: `${head}${marker}${tail}`,
  };
};

const clippedUtf8Line = (value: string) => clippedUtf8(value).text;

const compactedChangedLine = (line: PatchChangedLine): PatchChangedLine => {
  const clipped = clippedUtf8(line.text);
  return { ...line, ...clipped };
};

const chunkChangedLines = (
  lines: readonly PatchChangedLine[],
  maximumLines: number,
  maximumBytes: number
) => {
  const chunks: PatchChangedLine[][] = [];
  let current: PatchChangedLine[] = [];
  let currentBytes = 0;
  for (const sourceLine of lines) {
    const line = compactedChangedLine(sourceLine);
    const lineBytes = utf8Length(line.text) + 1;
    if (
      current.length > 0 &&
      (current.length >= maximumLines ||
        currentBytes + lineBytes > maximumBytes)
    ) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(line);
    currentBytes += lineBytes;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
};

const changeRuns = (lines: readonly PatchChangedLine[]) => {
  const runs: PatchChangedLine[][] = [];
  for (const line of lines) {
    const [sign] = line.text;
    const current = runs.at(-1);
    const [firstCurrentLine] = current ?? [];
    if (
      current === undefined ||
      !firstCurrentLine?.text.startsWith(sign ?? "")
    ) {
      runs.push([line]);
    } else {
      current.push(line);
    }
  }
  return runs;
};

const atomicSamplesFromBlock = (
  block: PatchEditBlock,
  hunkIndex: number,
  patchIndex: number
) => {
  const units: (readonly PatchChangedLine[])[] = [];
  const runs = changeRuns(block.changedLines);
  for (let index = 0; index < runs.length; index += 1) {
    const current = runs[index];
    const next = runs[index + 1];
    if (current?.[0]?.text.startsWith("-") && next?.[0]?.text.startsWith("+")) {
      const removed = chunkChangedLines(
        current,
        CHANGED_LINES_PER_SAMPLE / 2,
        MAX_SAMPLE_BYTES / 2
      );
      const added = chunkChangedLines(
        next,
        CHANGED_LINES_PER_SAMPLE / 2,
        MAX_SAMPLE_BYTES / 2
      );
      const removedAnchor = removed[0]?.slice(0, 1) ?? [];
      const addedAnchor = added[0]?.slice(0, 1) ?? [];
      const parts = Math.max(removed.length, added.length);
      for (let part = 0; part < parts; part += 1) {
        units.push([
          ...(removed[part] ?? removedAnchor),
          ...(added[part] ?? addedAnchor),
        ]);
      }
      index += 1;
    } else if (current !== undefined) {
      units.push(
        ...chunkChangedLines(
          current,
          CHANGED_LINES_PER_SAMPLE,
          MAX_SAMPLE_BYTES
        )
      );
    }
  }
  return spreadOrder(units.length).flatMap((unitIndex) => {
    const changedLines = units[unitIndex];
    return changedLines === undefined
      ? []
      : [
          {
            blockIndex: block.index,
            changedLines,
            hunkIndex,
            kind: "changes" as const,
            metadataLineEnd: null,
            metadataLineStart: null,
            metadataLines: [],
            partiallyCompactedMetadataLineIndexes: [],
            patchIndex,
          },
        ];
  });
};

const changeSamplesFromHunks = (
  hunks: readonly PatchHunk[],
  patchIndex: number
) => {
  const perHunk = hunks.map((hunk) => {
    const perBlock = hunk.editBlocks.map((block) =>
      atomicSamplesFromBlock(block, hunk.index, patchIndex)
    );
    const samples: PatchSample[] = [];
    const maximum = Math.max(0, ...perBlock.map((block) => block.length));
    for (let round = 0; round < maximum; round += 1) {
      for (const blockIndex of spreadOrder(perBlock.length)) {
        const sample = perBlock[blockIndex]?.[round];
        if (sample !== undefined) {
          samples.push(sample);
        }
      }
    }
    return samples;
  });
  const samples: PatchSample[] = [];
  const maximum = Math.max(0, ...perHunk.map((hunk) => hunk.length));
  for (let round = 0; round < maximum; round += 1) {
    for (const hunkIndex of spreadOrder(perHunk.length)) {
      const sample = perHunk[hunkIndex]?.[round];
      if (sample !== undefined) {
        samples.push(sample);
      }
    }
  }
  return samples;
};

const metadataSamplesFrom = (lines: readonly string[], patchIndex: number) => {
  const chunks: {
    end: number;
    lines: string[];
    partiallyCompactedLineIndexes: number[];
    start: number;
  }[] = [];
  let current: (typeof chunks)[number] | null = null;
  let currentBytes = 0;
  for (const [index, sourceLine] of lines.entries()) {
    const clipped = clippedUtf8(sourceLine);
    const line = clipped.text;
    const lineBytes = utf8Length(line) + 1;
    if (
      current !== null &&
      (current.lines.length >= METADATA_LINES_PER_SAMPLE ||
        currentBytes + lineBytes > MAX_SAMPLE_BYTES)
    ) {
      chunks.push(current);
      current = null;
      currentBytes = 0;
    }
    current ??= {
      end: index,
      lines: [],
      partiallyCompactedLineIndexes: [],
      start: index,
    };
    current.lines.push(line);
    if (clipped.omittedBytes > 0) {
      current.partiallyCompactedLineIndexes.push(index);
    }
    current.end = index;
    currentBytes += lineBytes;
  }
  if (current !== null) {
    chunks.push(current);
  }
  return spreadOrder(chunks.length).flatMap((chunkIndex) => {
    const chunk = chunks[chunkIndex];
    return chunk === undefined
      ? []
      : [
          {
            blockIndex: null,
            changedLines: [],
            hunkIndex: null,
            kind: "metadata" as const,
            metadataLineEnd: chunk.end,
            metadataLineStart: chunk.start,
            metadataLines: chunk.lines,
            partiallyCompactedMetadataLineIndexes:
              chunk.partiallyCompactedLineIndexes,
            patchIndex,
          },
        ];
  });
};

const samplesFromPatch = (
  hunks: readonly PatchHunk[],
  metadataLines: readonly string[],
  patchIndex: number,
  rawCompaction: RawPatchCompaction | null
) => {
  if (rawCompaction !== null) {
    return [
      {
        blockIndex: null,
        changedLines: [],
        hunkIndex: null,
        kind: "raw" as const,
        metadataLineEnd: null,
        metadataLineStart: null,
        metadataLines: rawCompaction.evidenceLines,
        partiallyCompactedMetadataLineIndexes: [],
        patchIndex,
      },
    ];
  }
  const changes = changeSamplesFromHunks(hunks, patchIndex);
  const metadata = metadataSamplesFrom(metadataLines, patchIndex);
  const preferred = changes.length === 0 ? metadata : changes;
  const secondary = changes.length === 0 ? [] : metadata;
  return [...preferred, ...secondary];
};

const maximumEvidenceClass = (
  current: PublicCommitEvidenceClass,
  candidate: PublicCommitEvidenceClass
) =>
  (evidenceClassRank.get(candidate) ?? Number.MAX_VALUE) <
  (evidenceClassRank.get(current) ?? Number.MAX_VALUE)
    ? candidate
    : current;

const patchLineCountWithin = (patch: string, maximum: number) => {
  let lines = 1;
  let offset = -1;
  while (lines <= maximum) {
    offset = patch.indexOf("\n", offset + 1);
    if (offset === -1) {
      return lines;
    }
    lines += 1;
  }
  return null;
};

const patchLineCount = (patch: string) => {
  let lines = 1;
  let offset = -1;
  while (true) {
    offset = patch.indexOf("\n", offset + 1);
    if (offset === -1) {
      return lines;
    }
    lines += 1;
  }
};

const rawCompactedPatchEvidence = (patch: string, originalBytes: number) => {
  const excerpt = clippedUtf8(patch, "patch");
  const originalLines = patchLineCount(patch);
  return {
    evidenceLines: [
      `[LOCAL RAW PATCH COMPACTION: semantic hunk parsing skipped to keep memory bounded; ${originalLines} raw lines and ${originalBytes} UTF-8 bytes in the GitHub-returned patch; ${excerpt.omittedBytes} bytes omitted from the deterministic head/tail excerpt below]`,
      JSON.stringify({ headAndTailPatchExcerpt: excerpt.text }),
    ],
    omittedBytes: excerpt.omittedBytes,
    originalBytes,
    originalLines,
  } satisfies RawPatchCompaction;
};

const uniquePatchesFrom = (
  sortedFiles: readonly PublicCommitFileEvidence[]
): readonly UniquePatchEvidence[] => {
  const patchGroups = new Map<
    string,
    {
      evidenceClass: PublicCommitEvidenceClass;
      fileIds: string[];
      firstFilename: string;
    }
  >();
  for (const [index, file] of sortedFiles.entries()) {
    if (file.patch === null) {
      continue;
    }
    const fileId = `F${String(index + 1).padStart(4, "0")}`;
    const evidenceClass = publicCommitEvidenceClass(file);
    const existing = patchGroups.get(file.patch);
    if (existing === undefined) {
      patchGroups.set(file.patch, {
        evidenceClass,
        fileIds: [fileId],
        firstFilename: file.filename,
      });
    } else {
      existing.fileIds.push(fileId);
      existing.evidenceClass = maximumEvidenceClass(
        existing.evidenceClass,
        evidenceClass
      );
    }
  }
  const groups = [...patchGroups.entries()].toSorted(
    ([, left], [, right]) =>
      (evidenceClassRank.get(left.evidenceClass) ?? Number.MAX_VALUE) -
        (evidenceClassRank.get(right.evidenceClass) ?? Number.MAX_VALUE) ||
      compareText(left.firstFilename, right.firstFilename)
  );
  let retainedPatchLines = 0;
  let retainedPatchBytes = 0;
  return groups.map(([patch, group], index) => {
    const patchBytes = utf8Length(patch);
    const remaining = Math.max(
      0,
      MAX_RETAINED_PATCH_LINES - retainedPatchLines
    );
    const patchLines = patchLineCountWithin(patch, remaining);
    const rawCompaction =
      patchLines === null ||
      patchBytes > MAX_PARSED_SINGLE_PATCH_BYTES ||
      retainedPatchBytes + patchBytes > MAX_PARSED_PATCH_BYTES
        ? rawCompactedPatchEvidence(patch, patchBytes)
        : null;
    if (rawCompaction === null && patchLines !== null) {
      retainedPatchLines += patchLines;
      retainedPatchBytes += patchBytes;
    }
    const parsed =
      rawCompaction === null
        ? parsePatch(patch)
        : { hunks: [], metadataLines: [] };
    return {
      ...group,
      ...parsed,
      index,
      patch,
      rawCompaction,
      samples: samplesFromPatch(
        parsed.hunks,
        parsed.metadataLines,
        index,
        rawCompaction
      ),
    };
  });
};

const compactFileIndexLine = (file: PublicCommitFileEvidence, index: number) =>
  JSON.stringify({
    additions: file.additions,
    deletions: file.deletions,
    evidenceClass: publicCommitEvidenceClass(file),
    id: `F${String(index + 1).padStart(4, "0")}`,
    patchAvailable: file.patch !== null,
    path: file.filename,
    previousPath: file.previousFilename,
    status: file.status,
  });

const totalChangedLines = (patch: UniquePatchEvidence) =>
  patch.hunks.reduce((total, hunk) => total + hunk.changedLineCount, 0);

const totalContextLines = (patch: UniquePatchEvidence) =>
  patch.hunks.reduce((total, hunk) => total + hunk.contextLines, 0);

const ordinalRanges = (ordinals: readonly number[]) => {
  const sorted = [...new Set(ordinals)].toSorted((left, right) => left - right);
  const ranges: string[] = [];
  for (const value of sorted) {
    const previous = ranges.at(-1);
    const match =
      previous === undefined ? null : /^(\d+)(?:-(\d+))?$/u.exec(previous);
    const end = Number(match?.[2] ?? match?.[1]);
    if (match !== null && value === end + 1) {
      ranges[ranges.length - 1] = `${match[1]}-${value}`;
    } else {
      ranges.push(String(value));
    }
  }
  return ranges.join(", ");
};

const renderWholeHunk = (hunk: PatchHunk) => {
  const body: string[] = [hunk.header];
  for (const block of hunk.editBlocks) {
    if (block.contextLinesBefore > 0) {
      body.push(`[SKIP ${block.contextLinesBefore} UNCHANGED CONTEXT LINES]`);
    }
    body.push(...block.changedLines.map((line) => line.text));
  }
  if (hunk.trailingContextLines > 0) {
    body.push(`[SKIP ${hunk.trailingContextLines} UNCHANGED CONTEXT LINES]`);
  }
  return body.join("\n");
};

const renderWholeChangedPatch = (patch: UniquePatchEvidence) => {
  if (patch.rawCompaction !== null) {
    return `PATCH P${String(patch.index + 1).padStart(4, "0")}\nfiles: ${patch.fileIds.join(", ")}\nrepresentativePath: ${JSON.stringify(patch.firstFilename)}\nevidenceClass: ${patch.evidenceClass}\ncoverage: semantic changed-line, metadata, and hunk parsing skipped locally for this oversized raw patch\nOVERSIZED RAW PATCH HEAD/TAIL EVIDENCE\n${patch.rawCompaction.evidenceLines.join("\n")}`;
  }
  const metadata =
    patch.metadataLines.length === 0
      ? []
      : ["PATCH METADATA", ...patch.metadataLines];
  const evidence = [...metadata, ...patch.hunks.map(renderWholeHunk)];
  return `PATCH P${String(patch.index + 1).padStart(4, "0")}\nfiles: ${patch.fileIds.join(", ")}\nrepresentativePath: ${JSON.stringify(patch.firstFilename)}\nevidenceClass: ${patch.evidenceClass}\ncoverage: all ${totalChangedLines(patch)} unique changed lines, ${patch.metadataLines.length} metadata lines, and ${patch.hunks.length} hunks; ${totalContextLines(patch)} unique unchanged context lines replaced by explicit skip markers\n${evidence.join("\n")}`;
};

const selectedSamplesByPatch = (
  selected: readonly PatchSample[],
  patches: readonly UniquePatchEvidence[]
) => {
  const byPatch = new Map<number, PatchSample[]>();
  for (const sample of selected) {
    const current = byPatch.get(sample.patchIndex) ?? [];
    current.push(sample);
    byPatch.set(sample.patchIndex, current);
  }
  return patches.flatMap((patch) => {
    const samples = byPatch.get(patch.index);
    return samples === undefined ? [] : [{ patch, samples }];
  });
};

const renderSelectedMetadata = (
  patch: UniquePatchEvidence,
  samples: readonly PatchSample[]
) => {
  if (patch.rawCompaction !== null) {
    return [];
  }
  const indexedLines = new Map<number, string>();
  for (const sample of samples) {
    if (sample.kind !== "metadata" || sample.metadataLineStart === null) {
      continue;
    }
    for (const [offset, line] of sample.metadataLines.entries()) {
      indexedLines.set(sample.metadataLineStart + offset, line);
    }
  }
  const selected = [...indexedLines.entries()].toSorted(
    ([left], [right]) => left - right
  );
  if (selected.length === 0) {
    return [];
  }
  const body = [
    `PATCH METADATA: ${selected.length}/${patch.metadataLines.length} lines represented`,
  ];
  let previous = -1;
  for (const [index, line] of selected) {
    const omitted = index - previous - 1;
    if (omitted > 0) {
      body.push(`[OMITTED ${omitted} PATCH METADATA LINES]`);
    }
    body.push(line);
    previous = index;
  }
  const trailing = patch.metadataLines.length - previous - 1;
  if (trailing > 0) {
    body.push(`[OMITTED ${trailing} PATCH METADATA LINES]`);
  }
  return body;
};

const changedLinesInBlocks = (blocks: readonly PatchEditBlock[]) => {
  let total = 0;
  for (const block of blocks) {
    total += block.changedLines.length;
  }
  return total;
};

const contextLinesBeforeBlocks = (blocks: readonly PatchEditBlock[]) => {
  let total = 0;
  for (const block of blocks) {
    total += block.contextLinesBefore;
  }
  return total;
};

const omittedBlocksMarker = (blocks: readonly PatchEditBlock[]) =>
  `[OMITTED ${blocks.length} EDIT BLOCKS WITH ${changedLinesInBlocks(blocks)} CHANGED LINES AND ${contextLinesBeforeBlocks(blocks)} PRECEDING UNCHANGED CONTEXT LINES]`;

const omittedHunksMarker = (hunks: readonly PatchHunk[]) => {
  let changedLines = 0;
  let contextLines = 0;
  for (const hunk of hunks) {
    changedLines += hunk.changedLineCount;
    contextLines += hunk.contextLines;
  }
  return `[OMITTED ${hunks.length} HUNKS WITH ${changedLines} CHANGED LINES AND ${contextLines} UNCHANGED CONTEXT LINES]`;
};

const renderSelectedBlock = (
  hunk: PatchHunk,
  block: PatchEditBlock,
  selectedLines: ReadonlyMap<number, string>
) => {
  const body: string[] = [];
  if (block.contextLinesBefore > 0) {
    body.push(`[SKIP ${block.contextLinesBefore} UNCHANGED CONTEXT LINES]`);
  }
  const sortedLines = [...selectedLines.entries()].toSorted(
    ([left], [right]) => left - right
  );
  body.push(
    `EDIT BLOCK ${block.index + 1}/${hunk.editBlocks.length}; CHANGED-LINE ORDINALS ${ordinalRanges(sortedLines.map(([ordinal]) => ordinal))} OF ${hunk.changedLineCount}`
  );
  let previousOrdinal = block.changedLines[0]?.ordinal ?? 1;
  for (const [ordinal, line] of sortedLines) {
    const omitted = ordinal - previousOrdinal;
    if (omitted > 0) {
      body.push(`[OMITTED ${omitted} CHANGED LINES]`);
    }
    body.push(line);
    previousOrdinal = ordinal + 1;
  }
  const blockEnd = block.changedLines.at(-1)?.ordinal ?? previousOrdinal - 1;
  if (previousOrdinal <= blockEnd) {
    body.push(`[OMITTED ${blockEnd - previousOrdinal + 1} CHANGED LINES]`);
  }
  return body;
};

const renderSelectedHunk = (
  hunk: PatchHunk,
  samples: readonly PatchSample[]
) => {
  const byBlock = new Map<number, Map<number, string>>();
  for (const sample of samples) {
    if (
      sample.kind !== "changes" ||
      sample.hunkIndex !== hunk.index ||
      sample.blockIndex === null
    ) {
      continue;
    }
    const selectedLines = byBlock.get(sample.blockIndex) ?? new Map();
    for (const line of sample.changedLines) {
      selectedLines.set(line.ordinal, line.text);
    }
    byBlock.set(sample.blockIndex, selectedLines);
  }
  if (byBlock.size === 0) {
    return null;
  }
  const body: string[] = [clippedUtf8Line(hunk.header)];
  let previousBlockIndex = -1;
  for (const [blockIndex, selectedLines] of [...byBlock.entries()].toSorted(
    ([left], [right]) => left - right
  )) {
    const block = hunk.editBlocks[blockIndex];
    if (block === undefined) {
      continue;
    }
    if (blockIndex > previousBlockIndex + 1) {
      const omittedBlocks = hunk.editBlocks.slice(
        previousBlockIndex + 1,
        blockIndex
      );
      body.push(omittedBlocksMarker(omittedBlocks));
    }
    body.push(...renderSelectedBlock(hunk, block, selectedLines));
    previousBlockIndex = blockIndex;
  }
  if (previousBlockIndex < hunk.editBlocks.length - 1) {
    const omittedBlocks = hunk.editBlocks.slice(previousBlockIndex + 1);
    body.push(omittedBlocksMarker(omittedBlocks));
  }
  if (hunk.trailingContextLines > 0) {
    body.push(`[SKIP ${hunk.trailingContextLines} UNCHANGED CONTEXT LINES]`);
  }
  return body.join("\n");
};

const selectedMetadataIndexes = (sample: PatchSample) => {
  const start = sample.metadataLineStart;
  return start === null
    ? []
    : sample.metadataLines.map((_, offset) => start + offset);
};

const renderSampledPatch = (
  patch: UniquePatchEvidence,
  samples: readonly PatchSample[]
) => {
  if (patch.rawCompaction !== null) {
    const represented = samples.some((sample) => sample.kind === "raw");
    const evidence = represented
      ? patch.rawCompaction.evidenceLines.join("\n")
      : "[LOCAL RAW PATCH EXCERPT NOT REPRESENTED IN THE REQUEST BUDGET]";
    return `PATCH P${String(patch.index + 1).padStart(4, "0")}\nfiles: ${patch.fileIds.join(", ")}\nrepresentativePath: ${JSON.stringify(patch.firstFilename)}\nevidenceClass: ${patch.evidenceClass}\ncoverage: semantic changed-line, metadata, and hunk coverage unavailable because this ${patch.rawCompaction.originalLines}-line, ${patch.rawCompaction.originalBytes}-byte GitHub-returned patch was compacted locally before parsing; deterministic head/tail excerpt represented: ${represented}\nOVERSIZED RAW PATCH HEAD/TAIL EVIDENCE\n${evidence}`;
  }
  const selectedChangedLines = new Set(
    samples.flatMap((sample) =>
      sample.changedLines.map(
        (line) => `${sample.hunkIndex ?? -1}:${line.ordinal}`
      )
    )
  ).size;
  const selectedHunks = new Set(
    samples.flatMap((sample) =>
      sample.hunkIndex === null ? [] : [sample.hunkIndex]
    )
  ).size;
  const partiallyCompactedChangedLines = new Set(
    samples.flatMap((sample) =>
      sample.changedLines.flatMap((line) =>
        line.omittedBytes === 0
          ? []
          : [`${sample.hunkIndex ?? -1}:${line.ordinal}`]
      )
    )
  ).size;
  const selectedMetadataLines = new Set(
    samples.flatMap(selectedMetadataIndexes)
  ).size;
  const partiallyCompactedMetadataLines = new Set(
    samples.flatMap((sample) => sample.partiallyCompactedMetadataLineIndexes)
  ).size;
  const selectedHunkIndexes = [
    ...new Set(
      samples.flatMap((sample) =>
        sample.hunkIndex === null ? [] : [sample.hunkIndex]
      )
    ),
  ].toSorted((left, right) => left - right);
  const renderedHunks: string[] = [];
  let previousHunkIndex = -1;
  for (const hunkIndex of selectedHunkIndexes) {
    if (hunkIndex > previousHunkIndex + 1) {
      renderedHunks.push(
        omittedHunksMarker(patch.hunks.slice(previousHunkIndex + 1, hunkIndex))
      );
    }
    const hunk = patch.hunks[hunkIndex];
    const rendered =
      hunk === undefined ? null : renderSelectedHunk(hunk, samples);
    if (rendered !== null) {
      renderedHunks.push(rendered);
    }
    previousHunkIndex = hunkIndex;
  }
  if (previousHunkIndex < patch.hunks.length - 1) {
    renderedHunks.push(
      omittedHunksMarker(patch.hunks.slice(previousHunkIndex + 1))
    );
  }
  const evidence = [
    ...renderSelectedMetadata(patch, samples),
    ...renderedHunks,
  ];
  return `PATCH P${String(patch.index + 1).padStart(4, "0")}\nfiles: ${patch.fileIds.join(", ")}\nrepresentativePath: ${JSON.stringify(patch.firstFilename)}\nevidenceClass: ${patch.evidenceClass}\ncoverage: ${selectedChangedLines}/${totalChangedLines(patch)} unique changed lines (${partiallyCompactedChangedLines} line-level byte-compacted), ${selectedMetadataLines}/${patch.metadataLines.length} unique-patch metadata lines (${partiallyCompactedMetadataLines} line-level byte-compacted), and ${selectedHunks}/${patch.hunks.length} unique-patch hunks represented; all ${totalContextLines(patch)} unique-patch unchanged context lines omitted with explicit gap markers\n${evidence.join("\n")}`;
};

const moduleFromPath = (path: string) => {
  const separator = path.indexOf("/");
  return separator === -1 ? "[root]" : path.slice(0, separator);
};

const moduleBreadthPatches = (patches: readonly UniquePatchEvidence[]) => {
  const byModule = new Map<string, UniquePatchEvidence[]>();
  for (const patch of patches.toSorted((left, right) =>
    compareText(left.firstFilename, right.firstFilename)
  )) {
    const moduleName = moduleFromPath(patch.firstFilename);
    const queue = byModule.get(moduleName) ?? [];
    queue.push(patch);
    byModule.set(moduleName, queue);
  }
  const modules = [...byModule.keys()].toSorted(compareText);
  const ordered: UniquePatchEvidence[] = [];
  let round = 0;
  let found = true;
  while (found) {
    found = false;
    for (const moduleName of modules) {
      const patch = byModule.get(moduleName)?.[round];
      if (patch !== undefined) {
        ordered.push(patch);
        found = true;
      }
    }
    round += 1;
  }
  return ordered;
};

const sampleQueuesByClass = (patches: readonly UniquePatchEvidence[]) => {
  const queues = new Map<PublicCommitEvidenceClass, PatchSample[]>();
  for (const evidenceClass of evidenceClassOrder) {
    const matching = moduleBreadthPatches(
      patches.filter((patch) => patch.evidenceClass === evidenceClass)
    );
    const queue = matching.flatMap((patch) => patch.samples.slice(0, 1));
    const maximum = Math.max(
      0,
      ...matching.map((patch) => patch.samples.length)
    );
    for (let round = 1; round < maximum; round += 1) {
      for (const patch of matching) {
        const sample = patch.samples[round];
        if (sample !== undefined) {
          queue.push(sample);
        }
      }
    }
    queues.set(evidenceClass, queue);
  }
  return queues;
};

const renderSampleUnit = (sample: PatchSample) =>
  sample.kind === "raw"
    ? `OVERSIZED RAW PATCH HEAD/TAIL EVIDENCE\n${sample.metadataLines.join("\n")}`
    : sample.kind === "metadata"
      ? `PATCH METADATA LINES ${Number(sample.metadataLineStart) + 1}-${Number(sample.metadataLineEnd) + 1}\n${sample.metadataLines.join("\n")}`
      : `HUNK ${Number(sample.hunkIndex) + 1} EDIT BLOCK ${Number(sample.blockIndex) + 1}; CHANGED-LINE ORDINALS ${ordinalRanges(sample.changedLines.map((line) => line.ordinal))}\n${sample.changedLines.map((line) => line.text).join("\n")}`;

const tokenWeightedSampleOrder = async (
  patches: readonly UniquePatchEvidence[]
) => {
  const queues = sampleQueuesByClass(patches);
  const cursors = new Map<PublicCommitEvidenceClass, number>();
  const virtualFinish = new Map<PublicCommitEvidenceClass, number>();
  const costs = new Map<PatchSample, number>();
  for (const patch of patches) {
    for (const sample of patch.samples) {
      costs.set(sample, (await countTextTokens(renderSampleUnit(sample))) + 8);
    }
  }
  const ordered: { cost: number; sample: PatchSample }[] = [];
  while (
    evidenceClassOrder.some(
      (evidenceClass) =>
        (cursors.get(evidenceClass) ?? 0) <
        (queues.get(evidenceClass)?.length ?? 0)
    )
  ) {
    const available = evidenceClassOrder.filter(
      (evidenceClass) =>
        (cursors.get(evidenceClass) ?? 0) <
        (queues.get(evidenceClass)?.length ?? 0)
    );
    const sortedAvailable = available.toSorted((left, right) => {
      const difference =
        (virtualFinish.get(left) ?? 0) - (virtualFinish.get(right) ?? 0);
      return difference === 0
        ? evidenceClassOrder.indexOf(left) - evidenceClassOrder.indexOf(right)
        : difference;
    });
    const [selectedClass] = sortedAvailable;
    if (selectedClass === undefined) {
      break;
    }
    const cursor = cursors.get(selectedClass) ?? 0;
    const sample = queues.get(selectedClass)?.[cursor];
    if (sample === undefined) {
      cursors.set(selectedClass, cursor + 1);
      continue;
    }
    ordered.push({ cost: costs.get(sample) ?? 1, sample });
    cursors.set(selectedClass, cursor + 1);
    virtualFinish.set(
      selectedClass,
      (virtualFinish.get(selectedClass) ?? 0) +
        (costs.get(sample) ?? 1) / evidenceClassWeight[selectedClass]
    );
  }
  return ordered;
};

const sampleCoverage = (
  patches: readonly UniquePatchEvidence[],
  selected: readonly PatchSample[] | null
) => {
  const allChangedLines = patches.reduce(
    (total, patch) => total + totalChangedLines(patch),
    0
  );
  const selectedChangedKeys = new Set<string>();
  const partiallyCompactedChangedKeys = new Set<string>();
  const selectedMetadataKeys = new Set<string>();
  const partiallyCompactedMetadataKeys = new Set<string>();
  const selectedPatchIndexes = new Set<number>();
  const selectedRawPatchIndexes = new Set<number>();
  const selectedHunkKeys = new Set<string>();
  const selectedFileIds = new Set<string>();
  const selectedChangedKeysByPatch = new Map<number, Set<string>>();
  if (selected === null) {
    for (const patch of patches) {
      selectedPatchIndexes.add(patch.index);
      if (patch.rawCompaction !== null) {
        selectedRawPatchIndexes.add(patch.index);
      }
      for (const fileId of patch.fileIds) {
        selectedFileIds.add(fileId);
      }
      selectedChangedKeysByPatch.set(
        patch.index,
        new Set(
          patch.hunks.flatMap((hunk) =>
            hunk.editBlocks.flatMap((block) =>
              block.changedLines.map((line) => `${hunk.index}:${line.ordinal}`)
            )
          )
        )
      );
      for (const hunk of patch.hunks) {
        selectedHunkKeys.add(`${patch.index}:${hunk.index}`);
      }
    }
  } else {
    for (const sample of selected) {
      const patch = patches[sample.patchIndex];
      if (patch === undefined) {
        continue;
      }
      selectedPatchIndexes.add(patch.index);
      if (sample.kind === "raw") {
        selectedRawPatchIndexes.add(patch.index);
      }
      for (const fileId of patch.fileIds) {
        selectedFileIds.add(fileId);
      }
      for (const line of sample.changedLines) {
        const localKey = `${sample.hunkIndex ?? -1}:${line.ordinal}`;
        const key = `${sample.patchIndex}:${localKey}`;
        selectedChangedKeys.add(key);
        const patchKeys =
          selectedChangedKeysByPatch.get(sample.patchIndex) ?? new Set();
        patchKeys.add(localKey);
        selectedChangedKeysByPatch.set(sample.patchIndex, patchKeys);
        if (line.omittedBytes > 0) {
          partiallyCompactedChangedKeys.add(key);
        }
      }
      if (sample.hunkIndex !== null) {
        selectedHunkKeys.add(`${sample.patchIndex}:${sample.hunkIndex}`);
      }
      if (sample.kind === "metadata") {
        for (const metadataIndex of selectedMetadataIndexes(sample)) {
          selectedMetadataKeys.add(`${sample.patchIndex}:${metadataIndex}`);
        }
        for (const metadataIndex of sample.partiallyCompactedMetadataLineIndexes) {
          partiallyCompactedMetadataKeys.add(
            `${sample.patchIndex}:${metadataIndex}`
          );
        }
      }
    }
  }
  return {
    changedLines:
      selected === null ? allChangedLines : selectedChangedKeys.size,
    files: selectedFileIds.size,
    hunks: selectedHunkKeys.size,
    metadataLines:
      selected === null
        ? patches.reduce(
            (total, patch) => total + patch.metadataLines.length,
            0
          )
        : selectedMetadataKeys.size,
    partiallyCompactedChangedLines: partiallyCompactedChangedKeys.size,
    partiallyCompactedMetadataLines: partiallyCompactedMetadataKeys.size,
    patches: selectedPatchIndexes.size,
    rawPatches: selectedRawPatchIndexes.size,
    selectedChangedKeysByPatch,
  };
};

const compactManifest = (
  commit: PublicCommitEvidence,
  sortedFiles: readonly PublicCommitFileEvidence[],
  patches: readonly UniquePatchEvidence[],
  selected: readonly PatchSample[] | null
) => {
  const availableFiles = sortedFiles.filter(
    (file) => file.patch !== null
  ).length;
  const parsedPatches = patches.filter((patch) => patch.rawCompaction === null);
  const rawPatches = patches.filter((patch) => patch.rawCompaction !== null);
  const uniqueChangedLines = patches.reduce(
    (total, patch) => total + totalChangedLines(patch),
    0
  );
  const occurrenceChangedLines = patches.reduce(
    (total, patch) => total + totalChangedLines(patch) * patch.fileIds.length,
    0
  );
  const contextLines = patches.reduce(
    (total, patch) => total + totalContextLines(patch),
    0
  );
  const totalHunks = patches.reduce(
    (total, patch) => total + patch.hunks.length,
    0
  );
  const totalMetadataLines = patches.reduce(
    (total, patch) => total + patch.metadataLines.length,
    0
  );
  const patchChangedLineCount = new Map(
    parsedPatches.map((patch) => [patch.patch, totalChangedLines(patch)])
  );
  const patchCounterMismatchFiles = sortedFiles.filter((file) => {
    if (file.patch === null) {
      return false;
    }
    const parsedCount = patchChangedLineCount.get(file.patch);
    return (
      parsedCount !== undefined &&
      parsedCount !== file.additions + file.deletions
    );
  }).length;
  const coverage = sampleCoverage(patches, selected);
  let representedOccurrences = 0;
  for (const patch of patches) {
    const represented =
      coverage.selectedChangedKeysByPatch.get(patch.index)?.size ?? 0;
    representedOccurrences += represented * patch.fileIds.length;
  }
  const rawFileOccurrences = rawPatches.reduce(
    (total, patch) => total + patch.fileIds.length,
    0
  );
  const rawOriginalBytes = rawPatches.reduce(
    (total, patch) => total + (patch.rawCompaction?.originalBytes ?? 0),
    0
  );
  const rawOriginalLines = rawPatches.reduce(
    (total, patch) => total + (patch.rawCompaction?.originalLines ?? 0),
    0
  );
  const rawOmittedBytes = rawPatches.reduce(
    (total, patch) => total + (patch.rawCompaction?.omittedBytes ?? 0),
    0
  );
  return JSON.stringify(
    {
      files: {
        ...(rawPatches.length === 0
          ? { patchCounterMismatch: patchCounterMismatchFiles }
          : {
              patchCounterComparisonUnavailableDueToLocalRawCompaction:
                rawFileOccurrences,
              patchCounterMismatchInParsedPatches: patchCounterMismatchFiles,
            }),
        patchEvidenceRepresented: coverage.files,
        patchReturned: availableFiles,
        patchUnavailableUpstream: sortedFiles.length - availableFiles,
        providerFileCapReached: commit.providerFileCapReached,
        totalReturned: sortedFiles.length,
      },
      githubReportedChangedLines: commit.stats.total,
      hunksInUniquePatches: {
        available: totalHunks,
        represented: coverage.hunks,
      },
      method:
        selected === null
          ? "all GitHub-returned changed lines and patch metadata; unchanged context replaced by explicit skip markers"
          : rawPatches.length === 0
            ? "bounded atomic edit samples; token-weighted 6:2:1 product/supporting/low-signal allocation with module and file breadth before depth"
            : "bounded raw head/tail excerpts for locally unparsed oversized patches plus bounded atomic edit samples for parsed patches; token-weighted 6:2:1 product/supporting/low-signal allocation with module and file breadth before depth",
      ...(rawPatches.length === 0
        ? {}
        : {
            parsedCoverageScope:
              "hunk, metadata, changed-line, context-line, occurrence, and counter-mismatch coverage excludes locally raw-compacted patches",
          }),
      ...(rawPatches.length === 0
        ? {}
        : {
            localRawPatchCompaction: {
              bytesOmittedFromExcerpts: rawOmittedBytes,
              excerptsRepresented: coverage.rawPatches,
              fileOccurrences: rawFileOccurrences,
              originalBytes: rawOriginalBytes,
              originalLines: rawOriginalLines,
              parsedCoverageCountersExcludeThesePatches: true,
              uniquePatches: rawPatches.length,
            },
          }),
      patchChangedLineOccurrences: {
        available: occurrenceChangedLines,
        ...(rawPatches.length === 0
          ? {}
          : { scope: "locally parsed patches only" }),
        represented: representedOccurrences,
      },
      uniquePatchMetadataLines: {
        available: totalMetadataLines,
        partiallyCompacted: coverage.partiallyCompactedMetadataLines,
        represented: coverage.metadataLines,
      },
      patches: {
        ...(rawPatches.length === 0
          ? {}
          : {
              locallyParsed: parsedPatches.length,
              locallyRawCompacted: rawPatches.length,
            }),
        represented: coverage.patches,
        uniqueReturned: patches.length,
      },
      uniquePatchChangedLines: {
        available: uniqueChangedLines,
        partiallyCompacted: coverage.partiallyCompactedChangedLines,
        represented: coverage.changedLines,
      },
      uniqueUnchangedContextLinesOmitted: contextLines,
      version: COMPACT_INPUT_VERSION,
    },
    null,
    2
  );
};

const buildCompactModelInput = (
  commit: PublicCommitEvidence,
  repository: PublicCommitSummaryRepositoryContext,
  sortedFiles: readonly PublicCommitFileEvidence[],
  patches: readonly UniquePatchEvidence[],
  selected: readonly PatchSample[] | null
) => {
  const fileIndex = sortedFiles.map(compactFileIndexLine).join("\n");
  const patchEvidence =
    selected === null
      ? patches.map(renderWholeChangedPatch)
      : selectedSamplesByPatch(selected, patches).map(({ patch, samples }) =>
          renderSampledPatch(patch, samples)
        );
  return `REPOSITORY EVIDENCE\n${repositoryEvidenceFrom(repository)}\n\nCOMMIT EVIDENCE\n${commitEvidenceFrom(commit, true)}\n${providerCapInstruction}\n\nLARGE COMMIT COMPACTION MANIFEST\n${compactManifest(commit, sortedFiles, patches, selected)}\nThe complete GitHub-returned file ledger below is lossless. GitHub-unavailable, counter-mismatched, locally raw-compacted, and budget-omitted patch evidence are distinct. Parsed samples preserve edit pairs, source order, and explicit gaps; locally raw-compacted patches are explicitly labeled head/tail excerpts. Base conclusions only on represented evidence.\n\nCOMPLETE GITHUB-RETURNED CHANGED FILE LEDGER\n${fileIndex}\n\nCOMPACTED GITHUB-RETURNED PATCH EVIDENCE\n${patchEvidence.join("\n\n")}\n\nEND OF EVIDENCE\n${taskInstruction}`;
};

const checkedTokenBudget = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 512) {
    throw new RangeError(
      "The public commit summary request token budget must be an integer of at least 512."
    );
  }
  return value;
};

const compactMessageTokens = async (value: string, keptTokens: number) => {
  const { decode, encode } = await tokenizer();
  const tokens = encode(value, {
    disallowedSpecial: NO_DISALLOWED_SPECIAL_TOKENS,
  });
  if (tokens.length <= keptTokens) {
    return value;
  }
  if (keptTokens <= 0) {
    return `[${tokens.length} message tokens omitted]`;
  }
  const head = Math.ceil(keptTokens * 0.75);
  const tail = keptTokens - head;
  return `${decode(tokens.slice(0, head))} … [${tokens.length - keptTokens} message tokens omitted] … ${decode(tokens.slice(tokens.length - tail))}`;
};

const buildExtremeModelInput = async (
  commit: PublicCommitEvidence,
  repository: PublicCommitSummaryRepositoryContext,
  sortedFiles: readonly PublicCommitFileEvidence[],
  patches: readonly UniquePatchEvidence[],
  maximum: number
) => {
  const allowed =
    maximum -
    (await countTextTokens(PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT)) -
    REQUEST_FRAMING_TOKEN_RESERVE;
  const evidenceClasses = { "low-signal": 0, product: 0, supporting: 0 };
  for (const file of sortedFiles) {
    evidenceClasses[publicCommitEvidenceClass(file)] += 1;
  }
  const rawPatches = patches.filter((patch) => patch.rawCompaction !== null);
  const rawPatchStrings = new Set(rawPatches.map((patch) => patch.patch));
  const parsedPatchChangedLineCount = new Map(
    patches.flatMap((patch) =>
      patch.rawCompaction === null
        ? [[patch.patch, totalChangedLines(patch)] as const]
        : []
    )
  );
  const rawPatchFileOccurrences = sortedFiles.filter(
    (file) => file.patch !== null && rawPatchStrings.has(file.patch)
  ).length;
  const parsedPatchCounterMismatches = sortedFiles.filter((file) => {
    if (file.patch === null) {
      return false;
    }
    const parsedCount = parsedPatchChangedLineCount.get(file.patch);
    return (
      parsedCount !== undefined &&
      parsedCount !== file.additions + file.deletions
    );
  }).length;
  const clippedMessage = clippedUtf8(
    commit.message,
    "message",
    MAX_EXTREME_MESSAGE_BYTES
  );
  const render = (
    message: string,
    includeRepository: boolean,
    includePatchProvenance: boolean
  ) =>
    `EXTREME METADATA COMPACTION (complete file ledger, paths, descriptions, and patch evidence omitted; long message text explicitly clipped)\n${JSON.stringify(
      {
        commit: {
          message,
          ...(clippedMessage.omittedBytes > 0
            ? { messageUtf8BytesOmitted: clippedMessage.omittedBytes }
            : {}),
          sha: commit.sha,
          stats: commit.stats,
        },
        files: {
          byEvidenceClass: evidenceClasses,
          ...(includePatchProvenance
            ? {
                patchCounterComparisonUnavailableDueToLocalRawCompaction:
                  rawPatchFileOccurrences,
                patchCounterMismatchInParsedPatches:
                  parsedPatchCounterMismatches,
              }
            : {}),
          patchReturned: sortedFiles.filter((file) => file.patch !== null)
            .length,
          ...(includePatchProvenance
            ? {
                patchUnavailableUpstream: sortedFiles.filter(
                  (file) => file.patch === null
                ).length,
              }
            : {}),
          providerFileCapReached: commit.providerFileCapReached,
          totalReturned: sortedFiles.length,
        },
        ...(includePatchProvenance
          ? {
              locallyParsedPatchesOmitted: patches.length - rawPatches.length,
              locallyRawCompactedPatchesOmitted: rawPatches.length,
            }
          : {}),
        patchesOmitted: patches.length,
        repository: includeRepository
          ? {
              directlyOwned: repository.directlyOwned,
              fullName: repository.fullName,
              private: repository.private,
            }
          : "[repository fields omitted for request budget]",
        version: COMPACT_INPUT_VERSION,
      }
    )}`;
  const boundedMessage = clippedMessage.text;
  const fullMessageTokens = await countTextTokens(boundedMessage);
  const variants = [
    { includePatchProvenance: true, includeRepository: true },
    { includePatchProvenance: true, includeRepository: false },
    { includePatchProvenance: false, includeRepository: true },
    { includePatchProvenance: false, includeRepository: false },
  ];
  for (const { includePatchProvenance, includeRepository } of variants) {
    let low = 0;
    let high = fullMessageTokens;
    let best: string | null = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = render(
        await compactMessageTokens(boundedMessage, middle),
        includeRepository,
        includePatchProvenance
      );
      if (
        exactModelInputTokenProbeIsSafe(candidate) &&
        (await countTextTokens(candidate)) <= allowed
      ) {
        best = candidate;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (best !== null) {
      return best;
    }
  }
  throw new RangeError(
    "The request token budget cannot hold even the minimal commit evidence manifest."
  );
};

const incrementalSampleCost = async (
  sample: PatchSample,
  patch: UniquePatchEvidence,
  firstForPatch: boolean,
  intrinsicCost: number
) =>
  firstForPatch
    ? (await countTextTokens(renderSampledPatch(patch, [sample]))) + 2
    : intrinsicCost;

const selectSamplesWithinBudget = async (
  commit: PublicCommitEvidence,
  repository: PublicCommitSummaryRepositoryContext,
  sortedFiles: readonly PublicCommitFileEvidence[],
  patches: readonly UniquePatchEvidence[],
  maximum: number
) => {
  const render = (selected: readonly PatchSample[]) =>
    buildCompactModelInput(commit, repository, sortedFiles, patches, selected);
  const emptyInput = render([]);
  if (!exactModelInputTokenProbeIsSafe(emptyInput)) {
    return await buildExtremeModelInput(
      commit,
      repository,
      sortedFiles,
      patches,
      maximum
    );
  }
  const emptyTokens = await countCommitPublicSummaryRequestTokens(emptyInput);
  if (emptyTokens > maximum) {
    return await buildExtremeModelInput(
      commit,
      repository,
      sortedFiles,
      patches,
      maximum
    );
  }
  let remaining = Math.max(
    0,
    maximum - emptyTokens - SAMPLE_MANIFEST_TOKEN_RESERVE
  );
  const selected: PatchSample[] = [];
  const selectedPatchIndexes = new Set<number>();
  for (const { cost: intrinsicCost, sample } of await tokenWeightedSampleOrder(
    patches
  )) {
    const patch = patches[sample.patchIndex];
    if (patch === undefined) {
      continue;
    }
    const cost = await incrementalSampleCost(
      sample,
      patch,
      !selectedPatchIndexes.has(patch.index),
      intrinsicCost
    );
    if (cost > remaining) {
      continue;
    }
    selected.push(sample);
    selectedPatchIndexes.add(patch.index);
    remaining -= cost;
  }
  let result = render(selected);
  while (selected.length > 0) {
    if (
      exactModelInputTokenProbeIsSafe(result) &&
      (await countCommitPublicSummaryRequestTokens(result)) <= maximum
    ) {
      break;
    }
    selected.pop();
    result = render(selected);
  }
  return result;
};

export const buildCommitPublicSummaryModelInput = async (
  commit: PublicCommitEvidence,
  repository: PublicCommitSummaryRepositoryContext,
  options: BuildCommitPublicSummaryModelInputOptions = {}
) => {
  const maximum = checkedTokenBudget(
    options.maxRequestInputTokens ??
      PUBLIC_COMMIT_SUMMARY_MAX_REQUEST_INPUT_TOKENS
  );
  const sortedFiles = sortedCommitFiles(commit.files);
  const fullInput = buildFullModelInput(commit, repository, sortedFiles);
  if (
    requestDefinitelyFits(fullInput, maximum) ||
    (exactModelInputTokenProbeIsSafe(fullInput) &&
      (await modelInputFitsTokenBudget(fullInput, maximum)))
  ) {
    return fullInput;
  }

  const patches = uniquePatchesFrom(sortedFiles);
  if (patches.every((patch) => patch.rawCompaction === null)) {
    const changedOnlyInput = buildCompactModelInput(
      commit,
      repository,
      sortedFiles,
      patches,
      null
    );
    if (
      requestDefinitelyFits(changedOnlyInput, maximum) ||
      (exactModelInputTokenProbeIsSafe(changedOnlyInput) &&
        (await modelInputFitsTokenBudget(changedOnlyInput, maximum)))
    ) {
      return changedOnlyInput;
    }
  }

  return await selectSamplesWithinBudget(
    commit,
    repository,
    sortedFiles,
    patches,
    maximum
  );
};
