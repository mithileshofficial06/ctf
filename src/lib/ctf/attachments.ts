import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";
import { requireEnv } from "@/lib/config";
import type { Challenge } from "@/lib/db/types";

/**
 * Challenge attachments — pcaps, binaries, disk images.
 *
 * Three properties, each load-bearing:
 *
 *  1. The container is PRIVATE. A public one lets anyone enumerate challenge
 *     files before the event opens, and at a CTF someone will try.
 *  2. URLs are MINTED PER REQUEST with a short expiry. A stored URL either
 *     expires or never expires; both are wrong. The database holds blob NAMES.
 *  3. The app REDIRECTS rather than proxying. Streaming a 50 MB pcap through
 *     the app puts it on the app's CPU and bandwidth — thirty teams
 *     downloading at once is a self-inflicted outage. Azure serves the bytes.
 */

/** Short enough that a leaked link is worthless, long enough for a slow download to start. */
export const SAS_TTL_MS = 15 * 60 * 1000;

/** Tolerance for clock skew between this container and Azure Storage. */
const CLOCK_SKEW_MS = 60 * 1000;

export function containerName(): string {
  return process.env.AZURE_STORAGE_CTF_CONTAINER ?? "ctf-attachments";
}

export function serviceClient(): BlobServiceClient {
  return BlobServiceClient.fromConnectionString(requireEnv("AZURE_STORAGE_CONNECTION_STRING"));
}

/**
 * Is this blob actually listed on this challenge?
 *
 * Without this check the `name` parameter is a read primitive for the entire
 * container: ask for any challenge you can see, name any blob you can guess.
 * Exact match only — no prefix or normalisation cleverness, because every bit
 * of leniency here is somewhere for a traversal to hide.
 */
export function challengeOwnsBlob(challenge: Challenge, blobName: string): boolean {
  return (challenge.config.attachments ?? []).includes(blobName);
}

/**
 * Mint a read-only, short-lived URL for one blob.
 *
 * Read permission only: a writable SAS handed to a CTF participant is a way to
 * replace another team's challenge file.
 */
export function mintAttachmentUrl(blobName: string, now: Date = new Date()): string {
  const service = serviceClient();
  const container = containerName();
  const blobClient = service.getContainerClient(container).getBlobClient(blobName);

  const credential = service.credential;
  if (!(credential instanceof StorageSharedKeyCredential)) {
    // A token credential can't sign a service SAS. Fail loudly rather than
    // silently handing out an unsigned URL that 403s in front of a team.
    throw new Error(
      "AZURE_STORAGE_CONNECTION_STRING must carry an account key to sign attachment SAS URLs"
    );
  }

  // Azurite and local emulators speak http; real Storage is https-only.
  const protocol = blobClient.url.startsWith("http://")
    ? SASProtocol.HttpsAndHttp
    : SASProtocol.Https;

  const sas = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: new Date(now.getTime() - CLOCK_SKEW_MS),
      expiresOn: new Date(now.getTime() + SAS_TTL_MS),
      protocol,
    },
    credential
  ).toString();

  return `${blobClient.url}?${sas}`;
}
