import { describe, expect, it } from "vitest";
import { DEFAULT_SUBMISSION, mafftSubmissionSchema } from "@/lib/mafft/schema";

describe("mafftSubmissionSchema", () => {
  it("fills every default from an empty object", () => {
    expect(DEFAULT_SUBMISSION).toEqual({
      mode: "align",
      sequenceType: "auto",
      strategy: "auto",
      maxIterate: 1000,
      scoring: { matrix: "default", gapOpen: 1.53, gapOffset: 0 },
      adjustDirection: "none",
      outputOrder: "input",
      addOptions: { fragments: false, keepLength: false },
    });
  });

  it("coerces numeric strings from form inputs", () => {
    const parsed = mafftSubmissionSchema.parse({ maxIterate: "16", scoring: { gapOpen: "2.5" } });
    expect(parsed.maxIterate).toBe(16);
    expect(parsed.scoring.gapOpen).toBe(2.5);
  });

  it("rejects a protein matrix for nucleotide input, and the reverse", () => {
    expect(mafftSubmissionSchema.safeParse({ sequenceType: "nucleotide", scoring: { matrix: "BLOSUM62" } }).success).toBe(false);
    expect(mafftSubmissionSchema.safeParse({ sequenceType: "protein", scoring: { matrix: "kimura200" } }).success).toBe(false);
  });

  it("rejects direction adjustment for protein", () => {
    expect(mafftSubmissionSchema.safeParse({ sequenceType: "protein", adjustDirection: "fast" }).success).toBe(false);
  });

  it("rejects unknown strategies and out-of-range penalties", () => {
    expect(mafftSubmissionSchema.safeParse({ strategy: "muscle" }).success).toBe(false);
    expect(mafftSubmissionSchema.safeParse({ scoring: { gapOpen: -1 } }).success).toBe(false);
  });
});
