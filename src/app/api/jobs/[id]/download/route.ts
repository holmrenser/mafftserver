import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAlignmentFasta, getResultsZip } from "@/lib/storage";
import { DOWNLOAD_FORMATS, isDownloadFormat, renderAlignment } from "@/lib/alignment/formats";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/jobs/:id/download?format=fasta|clustal|phylip|newick|zip (default zip).
 * Alignment formats are rendered on demand from the stored aligned FASTA.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "zip";

  if (format === "zip") {
    const zip = await getResultsZip(prisma, id);
    if (!zip) return notAvailable();
    // Prisma reads the Bytes column fully into memory, so this is a single
    // buffered response - fine at the sizes MAX_RESULTS_ZIP_BYTES allows.
    return new NextResponse(new Uint8Array(zip.resultsZip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="mafft-${id}.zip"`,
        "Content-Length": String(zip.resultsZipBytes),
      },
    });
  }

  if (format === "newick") {
    const row = await prisma.mafftJob.findUnique({ where: { id }, select: { guideTreeNewick: true } });
    if (!row?.guideTreeNewick) return notAvailable();
    return textResponse(row.guideTreeNewick + "\n", "text/plain", `mafft-${id}-guide-tree.nwk`);
  }

  if (!isDownloadFormat(format)) {
    return NextResponse.json({ error: `Unknown format '${format}'` }, { status: 400 });
  }

  const fasta = await getAlignmentFasta(prisma, id);
  if (!fasta) return notAvailable();
  const { extension, contentType } = DOWNLOAD_FORMATS[format];
  return textResponse(renderAlignment(fasta, format), contentType, `mafft-${id}.${extension}`);
}

function textResponse(body: string, contentType: string, filename: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function notAvailable() {
  return NextResponse.json({ error: "Results not available for this job" }, { status: 404 });
}
