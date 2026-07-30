import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { challengeOwnsBlob, mintAttachmentUrl } from "@/lib/ctf/attachments";

/**
 * GET /api/ctf/attachment?challenge=<slug>&name=<blob>
 *
 * Verifies the session, verifies the blob is actually listed on that
 * challenge, then 302-redirects to a signed URL. The app never streams the
 * bytes — Azure Storage does, so a thirty-team download rush costs us nothing
 * but a redirect.
 */
export async function GET(request: Request) {
  try {
    // A logged-out request must not be able to enumerate challenge files.
    await requireSession();

    const url = new URL(request.url);
    const slug = url.searchParams.get("challenge");
    const name = url.searchParams.get("name");

    if (!slug || !name) {
      return NextResponse.json({ error: "Missing challenge or name" }, { status: 400 });
    }

    const challenges = await collections.challenges();
    const challenge = await challenges.findOne({ type: "ctf", slug });
    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    // THE check. Without it, `name` reads any blob in the container via any
    // challenge slug the caller can see.
    if (!challengeOwnsBlob(challenge, name)) {
      return NextResponse.json({ error: "No such attachment" }, { status: 404 });
    }

    // Challenges that haven't opened yet must not leak their files early.
    if (challenge.opensAt && new Date() < challenge.opensAt) {
      return NextResponse.json({ error: "Not open yet" }, { status: 403 });
    }

    const signed = mintAttachmentUrl(name);

    return NextResponse.redirect(signed, {
      status: 302,
      // The URL expires; letting a proxy cache the redirect would hand out
      // dead links after 15 minutes.
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[ctf/attachment] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
