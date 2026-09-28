import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/common/error-state";
import { TimezoneSelect } from "@/components/common/TimezoneSelect";
import {
  formatInZone,
  isoToZonedInput,
  localTimeZone,
  zonedInputToIso,
  zonesDiffer,
} from "@/lib/date/timezone";
import type { CreateCallInput } from "@/lib/api";

/**
 * Client validation mirrors the backend's rules for fast feedback. It is not
 * the rule: the same request is validated again server-side, and the server's
 * verdict is what the user sees.
 */
const callSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(200, "Keep the title under 200 characters"),
    scheduledStart: z.string().min(1, "Start time is required"),
    scheduledEnd: z.string().min(1, "End time is required"),
    timezone: z.string().min(1, "Timezone is required"),
  })
  .refine(
    value => {
      const start = zonedInputToIso(value.scheduledStart, value.timezone);
      const end = zonedInputToIso(value.scheduledEnd, value.timezone);
      return Boolean(start) && Boolean(end) && new Date(end) > new Date(start);
    },
    {
      message: "The end time must be after the start time",
      path: ["scheduledEnd"],
    },
  );

type CallFormValues = z.infer<typeof callSchema>;

function defaultWindow(timeZone: string): { start: string; end: string } {
  const start = new Date(Date.now() + 15 * 60_000);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);

  return {
    start: isoToZonedInput(start.toISOString(), timeZone),
    end: isoToZonedInput(end.toISOString(), timeZone),
  };
}

export function CallForm({
  onSubmit,
  pending,
  error,
  submitLabel = "Set it up",
  onCancel,
}: {
  onSubmit: (input: CreateCallInput) => void;
  pending: boolean;
  error: unknown;
  submitLabel?: string;
  onCancel?: () => void;
}): React.JSX.Element {
  const viewerZone = localTimeZone();
  const window = defaultWindow(viewerZone);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<CallFormValues>({
    resolver: zodResolver(callSchema),
    defaultValues: {
      title: "",
      scheduledStart: window.start,
      scheduledEnd: window.end,
      timezone: viewerZone,
    },
  });

  // The times entered are wall-clock times in THIS zone, whatever zone the
  // person filling the form happens to be sitting in.
  const timezone = watch("timezone");
  const start = watch("scheduledStart");

  const startIso = timezone && start ? zonedInputToIso(start, timezone) : "";
  const showViewerTime = Boolean(startIso) && zonesDiffer(timezone, viewerZone);

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={handleSubmit(values =>
        onSubmit({
          title: values.title.trim(),
          // The API takes UTC. The entered times are wall-clock times in the
          // zone chosen below — NOT in whatever zone this browser is in.
          scheduledStart: zonedInputToIso(
            values.scheduledStart,
            values.timezone,
          ),
          scheduledEnd: zonedInputToIso(values.scheduledEnd, values.timezone),
          timezone: values.timezone,
        }),
      )}
    >
      {error ? <ErrorState error={error} /> : null}

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder="Weekly catch-up"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? "title-error" : undefined}
          {...register("title")}
        />
        {errors.title ? (
          <p id="title-error" className="text-sm text-destructive">
            {errors.title.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="scheduledStart">Starts</Label>
          <Input
            id="scheduledStart"
            type="datetime-local"
            aria-invalid={Boolean(errors.scheduledStart)}
            aria-describedby={errors.scheduledStart ? "start-error" : undefined}
            {...register("scheduledStart")}
          />
          {errors.scheduledStart ? (
            <p id="start-error" className="text-sm text-destructive">
              {errors.scheduledStart.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="scheduledEnd">Ends</Label>
          <Input
            id="scheduledEnd"
            type="datetime-local"
            aria-invalid={Boolean(errors.scheduledEnd)}
            aria-describedby={errors.scheduledEnd ? "end-error" : undefined}
            {...register("scheduledEnd")}
          />
          {errors.scheduledEnd ? (
            <p id="end-error" className="text-sm text-destructive">
              {errors.scheduledEnd.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Controller
          control={control}
          name="timezone"
          render={({ field }) => (
            <TimezoneSelect
              id="timezone"
              value={field.value}
              onChange={field.onChange}
              aria-describedby="timezone-hint"
            />
          )}
        />
        <p id="timezone-hint" className="text-xs text-muted-foreground">
          {showViewerTime
            ? `The times above are in this timezone. That's ${formatInZone(startIso, viewerZone)} where you are.`
            : "The times above are in this timezone."}
        </p>
        {errors.timezone ? (
          <p className="text-sm text-destructive">{errors.timezone.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
