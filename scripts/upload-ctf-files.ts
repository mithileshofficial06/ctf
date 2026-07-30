/**
 * Push a local directory of challenge attachments to the private container and
 * print the blob names to paste into the seed.
 *
 * Run:  npx tsx scripts/upload-ctf-files.ts ./ctf-files
 *
 * The files themselves are NEVER committed to git and NEVER baked into the
 * container image — a challenge binary in the repo is a challenge solved by
 * anyone who can read the repo.
 *
 * Creates the container if it is missing, WITHOUT public access. Do not add
 * `access: "blob"` to make a download work; that makes every challenge file
 * enumerable before the event opens.
 */
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { containerName, serviceClient } from "../src/lib/ctf/attachments";

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    })
  );
  return files.flat();
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error("Usage: npx tsx scripts/upload-ctf-files.ts <directory>");
    process.exit(1);
  }

  const info = await stat(source).catch(() => null);
  if (!info?.isDirectory()) {
    console.error(`Not a directory: ${source}`);
    process.exit(1);
  }

  const container = serviceClient().getContainerClient(containerName());

  // No `access` option → private. That is the point.
  const created = await container.createIfNotExists();
  if (created.succeeded) {
    console.log(`Created private container "${containerName()}"`);
  }

  const files = await walk(source);
  if (files.length === 0) {
    console.error(`No files found under ${source}`);
    process.exit(1);
  }

  const uploaded: string[] = [];

  for (const file of files) {
    // Blob names use forward slashes regardless of host platform, so a seed
    // written on Windows still matches a lookup made on Linux.
    const blobName = relative(source, file).split(sep).join("/");
    const blob = container.getBlockBlobClient(blobName);
    await blob.uploadFile(file);
    uploaded.push(blobName);
    console.log(`  uploaded  ${blobName}`);
  }

  console.log("\n── BLOB NAMES for the seed's `attachments` ─────────────");
  console.log(JSON.stringify(uploaded, null, 2));
  console.log("───────────────────────────────────────────────────────");
  console.log("\nStore these NAMES, not URLs. URLs are minted per request.");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
