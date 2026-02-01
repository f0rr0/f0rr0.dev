import fs from "node:fs/promises";
import path from "node:path";

const CONTENT_ROOT = path.join(process.cwd(), "src", "content");
const PUBLIC_ROOT = path.join(process.cwd(), "public", "content");

const shouldCopy = (name) => {
  if (name.startsWith(".")) return false;
  const lower = name.toLowerCase();
  return !(lower.endsWith(".mdx") || lower.endsWith(".md"));
};

const copyDir = async (source, destination) => {
  const entries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(destination, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, destPath);
      continue;
    }

    if (entry.isFile() && shouldCopy(entry.name)) {
      await fs.copyFile(sourcePath, destPath);
    }
  }
};

const syncContentAssets = async () => {
  try {
    await fs.access(CONTENT_ROOT);
  } catch {
    console.warn("No src/content directory found. Skipping asset sync.");
    return;
  }

  await fs.rm(PUBLIC_ROOT, { recursive: true, force: true });
  await copyDir(CONTENT_ROOT, PUBLIC_ROOT);
};

await syncContentAssets();
