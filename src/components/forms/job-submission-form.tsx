"use client";

import { useDeferredValue, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UploadIcon } from "lucide-react";
import {
  ACCURATE_STRATEGIES,
  DEFAULT_SUBMISSION,
  ITERATIVE_STRATEGIES,
  MAX_SEQS_ACCURATE,
  NUCLEOTIDE_MATRICES,
  PROTEIN_MATRICES,
  mafftSubmissionSchema,
  type MafftSubmission,
  type MafftSubmissionInput,
} from "@/lib/mafft/schema";
import { STRATEGY_INFO } from "@/lib/mafft/strategies";
import { displayCommand } from "@/lib/mafft/buildArgs";
import { validateFasta, type FastaReport } from "@/lib/sequences/fasta";
import { EXAMPLE_FASTA, EXAMPLE_FILENAME } from "@/lib/sequences/example";
import { BASE_PATH } from "@/lib/basePath";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const ACCEPT = ".fasta,.fa,.fas,.faa,.fna,.ffn,.fsa,.txt";

const MATRIX_LABELS: Record<string, string> = {
  BLOSUM30: "BLOSUM30",
  BLOSUM45: "BLOSUM45",
  BLOSUM62: "BLOSUM62",
  BLOSUM80: "BLOSUM80",
  JTT100: "JTT 100 PAM",
  JTT200: "JTT 200 PAM",
  kimura1: "1PAM / κ=2",
  kimura200: "200PAM / κ=2",
};

interface JobSubmissionFormProps {
  /** Whether the server has SMTP configured - see src/lib/email.ts. */
  emailEnabled: boolean;
  /** MAFFT_WORKER_THREADS, so the command preview matches what the worker runs. */
  workerThreads: number;
}

export function JobSubmissionForm({ emailEnabled, workerThreads }: JobSubmissionFormProps) {
  const router = useRouter();
  const [sequencesText, setSequencesText] = useState("");
  const [existingText, setExistingText] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { control, register, handleSubmit, setValue } = useForm<MafftSubmissionInput, unknown, MafftSubmission>({
    resolver: zodResolver(mafftSubmissionSchema),
    defaultValues: DEFAULT_SUBMISSION,
  });
  const values = useWatch({ control });
  const mode = values.mode ?? "align";
  const strategy = values.strategy ?? "auto";

  // Validation of a large paste can take a moment - keep typing responsive.
  const deferredSequences = useDeferredValue(sequencesText);
  const deferredExisting = useDeferredValue(existingText);
  const sequences = useMemo(
    () => validateFasta(deferredSequences, { kind: "sequences", minRecords: mode === "add" ? 1 : 2 }),
    [deferredSequences, mode],
  );
  const existing = useMemo(
    () => (mode === "add" ? validateFasta(deferredExisting, { kind: "alignment", minRecords: 2 }) : null),
    [deferredExisting, mode],
  );

  const totalSequences = sequences.records.length + (existing?.records.length ?? 0);
  const detectedType = existing?.detectedType ?? sequences.detectedType;
  const effectiveType =
    values.sequenceType === "nucleotide"
      ? "nucleotide"
      : values.sequenceType === "protein"
        ? "protein"
        : detectedType === "Protein" || detectedType === null
          ? "protein"
          : "nucleotide";
  const matrices = effectiveType === "protein" ? PROTEIN_MATRICES : NUCLEOTIDE_MATRICES;

  // Keep options consistent with the (detected) sequence type, so the schema's
  // cross-field checks never reject a combination the form itself offered.
  useEffect(() => {
    const matrix = values.scoring?.matrix ?? "default";
    if (matrix !== "default" && !(matrices as readonly string[]).includes(matrix)) {
      setValue("scoring.matrix", "default");
    }
    if (effectiveType === "protein" && values.adjustDirection !== "none") {
      setValue("adjustDirection", "none");
    }
  }, [effectiveType, matrices, values.scoring?.matrix, values.adjustDirection, setValue]);

  const accurateDisabled = totalSequences > MAX_SEQS_ACCURATE;
  useEffect(() => {
    if (accurateDisabled && ACCURATE_STRATEGIES.includes(strategy)) setValue("strategy", "auto");
  }, [accurateDisabled, strategy, setValue]);

  const parsed = mafftSubmissionSchema.safeParse(values);
  const command = parsed.success ? displayCommand(parsed.data, workerThreads) : null;

  const inputErrors = [...sequences.errors, ...(existing?.errors ?? [])];
  const hasInput = sequences.records.length > 0 && (mode === "align" || (existing?.records.length ?? 0) > 0);
  const canSubmit = hasInput && inputErrors.length === 0 && parsed.success && !submitting;

  async function loadFile(file: File | undefined, target: "sequences" | "existing") {
    if (!file) return;
    const text = await file.text();
    if (target === "sequences") {
      setSequencesText(text);
      setFilename(file.name);
    } else {
      setExistingText(text);
    }
  }

  async function onSubmit(options: MafftSubmission) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("options", JSON.stringify(options));
      form.set("sequences", sequencesText);
      if (options.mode === "add") form.set("existingAlignment", existingText);
      if (filename) form.set("filename", filename);
      if (emailEnabled && notifyEmail.trim()) form.set("notifyEmail", notifyEmail.trim());

      const res = await fetch(`${BASE_PATH}/api/submit`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error ?? "Submission failed.");
        setSubmitting(false);
        return;
      }
      router.push(`/jobs/${body.jobId}`);
    } catch {
      setSubmitError("Submission failed. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Sequences</CardTitle>
          <CardDescription>Paste FASTA or upload a file. Each sequence needs a unique name.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <div className="inline-flex gap-0.5 self-start rounded-lg bg-muted p-[3px]" role="group" aria-label="Mode">
                {(["align", "add"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={field.value === m}
                    onClick={() => field.onChange(m)}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm font-medium text-muted-foreground",
                      field.value === m && "bg-background text-foreground shadow-sm",
                    )}
                  >
                    {m === "align" ? "Align" : "Add to alignment"}
                  </button>
                ))}
              </div>
            )}
          />

          {mode === "add" && (
            <SequenceInput
              id="existingAlignment"
              label="Existing alignment"
              hint="The sequences below are aligned into this alignment (--add)."
              value={existingText}
              onChange={setExistingText}
              onFile={(file) => void loadFile(file, "existing")}
              report={existing}
              rows={6}
              placeholder={">ref_1\nMGDVEKG--KKIFVQKCAQC...\n>ref_2\nMGDVAKGKKTFVQKCAQC..."}
            />
          )}

          <SequenceInput
            id="sequences"
            label={mode === "add" ? "Sequences to add" : "Sequences to align"}
            value={sequencesText}
            onChange={(text) => {
              setSequencesText(text);
              if (!text) setFilename(null);
            }}
            onFile={(file) => void loadFile(file, "sequences")}
            report={deferredSequences ? sequences : null}
            rows={12}
            actions={
              mode === "align" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSequencesText(EXAMPLE_FASTA);
                    setFilename(EXAMPLE_FILENAME);
                  }}
                >
                  Load example
                </Button>
              )
            }
          />

          {mode === "add" && (
            <div className="flex flex-col gap-2">
              <CheckboxField control={control} name="addOptions.fragments" id="fragments">
                Sequences are fragments (<code>--addfragments</code>)
              </CheckboxField>
              <CheckboxField control={control} name="addOptions.keepLength" id="keepLength">
                Keep the alignment length; insertions in the new sequences are deleted (<code>--keeplength</code>)
              </CheckboxField>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Strategy</CardTitle>
          <CardDescription>
            Faster methods are rougher. The accurate methods are recommended up to about 200 sequences × 2,000
            residues.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Controller
            control={control}
            name="strategy"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                aria-label="Strategy"
              >
                {STRATEGY_INFO.map((s) => {
                  const disabled = accurateDisabled && ACCURATE_STRATEGIES.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      htmlFor={`strategy-${s.id}`}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-lg border p-3 hover:bg-muted/60 has-data-checked:border-primary has-data-checked:ring-1 has-data-checked:ring-primary",
                        s.id === "auto" && "sm:col-span-2",
                        disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <RadioGroupItem value={s.id} id={`strategy-${s.id}`} disabled={disabled} className="mt-0.5" />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-sm font-semibold">{s.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {disabled
                            ? `Not available above ${MAX_SEQS_ACCURATE.toLocaleString()} sequences. Use Auto.`
                            : s.description}
                        </span>
                        {s.speed !== null && s.accuracy !== null ? (
                          <span className="flex gap-3 text-[11px] text-muted-foreground">
                            <Pips label="Speed" value={s.speed} />
                            <Pips label="Accuracy" value={s.accuracy} />
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Chosen for you at run time</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            )}
          />
        </CardContent>
      </Card>

      <Accordion>
        <AccordionItem value="advanced">
          <AccordionTrigger>Advanced options</AccordionTrigger>
          <AccordionContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Sequence type" htmlFor="sequenceType">
              <Controller
                control={control}
                name="sequenceType"
                render={({ field }) => (
                  <OptionSelect
                    id="sequenceType"
                    value={field.value ?? "auto"}
                    onChange={field.onChange}
                    options={{
                      auto: detectedType ? `Auto-detect (${detectedType} detected)` : "Auto-detect",
                      nucleotide: "Nucleotide (--nuc)",
                      protein: "Protein (--amino)",
                    }}
                  />
                )}
              />
            </Field>

            <Field label="Scoring matrix" htmlFor="matrix">
              <Controller
                control={control}
                name="scoring.matrix"
                render={({ field }) => (
                  <OptionSelect
                    id="matrix"
                    value={field.value ?? "default"}
                    onChange={field.onChange}
                    options={{
                      default: effectiveType === "protein" ? "Default (BLOSUM62)" : "Default (200PAM / κ=2)",
                      ...Object.fromEntries(matrices.map((m) => [m, MATRIX_LABELS[m]])),
                    }}
                  />
                )}
              />
            </Field>

            <Field label="Gap opening penalty" htmlFor="gapOpen" hint="MAFFT default 1.53 (--op)">
              <Input id="gapOpen" type="number" step="0.01" min={0} max={10} {...register("scoring.gapOpen")} />
            </Field>

            <Field
              label="Offset value"
              htmlFor="gapOffset"
              hint={strategy === "einsi" ? "E-INS-i fixes the offset at 0." : "Works like a gap extension penalty (--ep)"}
            >
              <Input
                id="gapOffset"
                type="number"
                step="0.01"
                min={0}
                max={10}
                disabled={strategy === "einsi"}
                {...register("scoring.gapOffset")}
              />
            </Field>

            <Field
              label="Adjust direction"
              htmlFor="adjustDirection"
              hint="Nucleotide only. Reversed sequences get an _R_ prefix."
            >
              <Controller
                control={control}
                name="adjustDirection"
                render={({ field }) => (
                  <OptionSelect
                    id="adjustDirection"
                    value={field.value ?? "none"}
                    onChange={field.onChange}
                    disabled={effectiveType === "protein"}
                    options={{ none: "Don't adjust", fast: "Adjust (fast)", accurate: "Adjust (accurate)" }}
                  />
                )}
              />
            </Field>

            <Field label="Output order" htmlFor="outputOrder">
              <Controller
                control={control}
                name="outputOrder"
                render={({ field }) => (
                  <OptionSelect
                    id="outputOrder"
                    value={field.value ?? "input"}
                    onChange={field.onChange}
                    options={{ input: "Same as input", aligned: "Aligned order (--reorder)" }}
                  />
                )}
              />
            </Field>

            <Field
              label="Max iterations"
              htmlFor="maxIterate"
              hint={
                ITERATIVE_STRATEGIES.includes(strategy)
                  ? "Iterative refinement cycles (--maxiterate)"
                  : "Only used by iterative strategies."
              }
            >
              <Input
                id="maxIterate"
                type="number"
                min={0}
                max={1000}
                disabled={!ITERATIVE_STRATEGIES.includes(strategy)}
                {...register("maxIterate")}
              />
            </Field>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Command</span>
        <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2.5 font-mono text-xs">
          <span className="text-muted-foreground select-none">$ </span>
          {command ?? "Fix the highlighted options to see the command."}
        </pre>
        <p className="text-xs text-muted-foreground">
          This is exactly what the worker runs. Copy it to reproduce the alignment locally.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notifyEmail" className={!emailEnabled ? "text-muted-foreground" : undefined}>
          Email me when this job finishes (optional)
        </Label>
        <Input
          id="notifyEmail"
          type="email"
          placeholder="you@example.com"
          value={notifyEmail}
          onChange={(e) => setNotifyEmail(e.target.value)}
          disabled={!emailEnabled}
        />
        {!emailEnabled && (
          <p className="text-xs text-muted-foreground">
            Email notifications aren&apos;t configured on this server, so this option is disabled.
          </p>
        )}
      </div>

      {submitError && (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      )}

      <Button type="submit" size="lg" disabled={!canSubmit}>
        {submitting ? "Submitting..." : "Run MAFFT"}
      </Button>
    </form>
  );
}

interface SequenceInputProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (text: string) => void;
  onFile: (file: File | undefined) => void;
  report: FastaReport | null;
  rows: number;
  placeholder?: string;
  actions?: ReactNode;
}

function SequenceInput({ id, label, hint, value, onChange, onFile, report, rows, placeholder, actions }: SequenceInputProps) {
  const [dragging, setDragging] = useState(false);
  const unit = report?.detectedType === "Protein" ? "aa" : "nt";

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    onFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={rows}
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-invalid={report ? report.errors.length > 0 : undefined}
        className={cn(
          "field-sizing-fixed max-h-96 resize-y font-mono text-xs whitespace-pre md:text-xs",
          dragging && "border-dashed border-foreground",
        )}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
          {report && report.records.length > 0 ? (
            <>
              <Badge variant="secondary">
                {report.records.length.toLocaleString()} sequence{report.records.length === 1 ? "" : "s"}
              </Badge>
              {report.maxLength > 0 && (
                <Badge variant="secondary">
                  {report.minLength === report.maxLength
                    ? report.maxLength.toLocaleString()
                    : `${report.minLength.toLocaleString()}–${report.maxLength.toLocaleString()}`}{" "}
                  {unit}
                </Badge>
              )}
              {report.detectedType && <Badge>{report.detectedType}</Badge>}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Paste FASTA above, or drop a file onto it.</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <label htmlFor={`${id}-file`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}>
            <UploadIcon />
            Upload FASTA
          </label>
          <input
            id={`${id}-file`}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {actions}
        </div>
      </div>
      {report && (report.errors.length > 0 || report.warnings.length > 0) && (
        <ul className="flex flex-col gap-1.5">
          {report.errors.slice(0, 5).map((issue, i) => (
            <li key={`e${i}`} className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {issue.message}
            </li>
          ))}
          {report.errors.length > 5 && (
            <li className="text-sm text-destructive">…and {report.errors.length - 5} more problems.</li>
          )}
          {report.warnings.map((issue, i) => (
            <li key={`w${i}`} className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Base UI's Select shows the raw value unless given an `items` map - this always passes one. */
function OptionSelect({
  id,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <Select items={options} value={value} onValueChange={(v) => v !== null && onChange(v as string)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(options).map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CheckboxField({
  control,
  name,
  id,
  children,
}: {
  control: Control<MafftSubmissionInput, unknown, MafftSubmission>;
  name: "addOptions.fragments" | "addOptions.keepLength";
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Controller
        control={control}
        name={name}
        render={({ field }) => <Checkbox id={id} checked={field.value ?? false} onCheckedChange={field.onChange} />}
      />
      <Label htmlFor={id} className="font-normal leading-snug">
        {children}
      </Label>
    </div>
  );
}

function Pips({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${label} ${value} of 5`}>
      {label}
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={cn("size-1.5 rounded-[2px] bg-border", i < value && "bg-foreground")} />
        ))}
      </span>
    </span>
  );
}
