import { describe, expect, it } from "vitest";
import { computeJobId } from "@/lib/hash";
import { mafftSubmissionSchema } from "@/lib/mafft/schema";

const options = mafftSubmissionSchema.parse({});

describe("computeJobId", () => {
  it("is deterministic and 24 hex characters", () => {
    const id = computeJobId({ options, inputFasta: ">a\nACGT\n" });
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(computeJobId({ options, inputFasta: ">a\nACGT\n" })).toBe(id);
  });

  it("changes with the input, the options, or the existing alignment", () => {
    const base = computeJobId({ options, inputFasta: ">a\nACGT\n" });
    expect(computeJobId({ options, inputFasta: ">a\nACGA\n" })).not.toBe(base);
    expect(computeJobId({ options: mafftSubmissionSchema.parse({ strategy: "linsi" }), inputFasta: ">a\nACGT\n" })).not.toBe(base);
    expect(computeJobId({ options, inputFasta: ">a\nACGT\n", existingAlignmentFasta: ">r\nAC-T\n" })).not.toBe(base);
  });
});
