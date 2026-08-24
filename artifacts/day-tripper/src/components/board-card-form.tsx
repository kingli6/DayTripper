import { zodResolver } from '@hookform/resolvers/zod';
import type { BoardCard } from '@workspace/api-client-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

export const BOARD_CATEGORIES = ['work', 'recovery', 'managing', 'social', 'fun'] as const;
export type BoardCategory = (typeof BOARD_CATEGORIES)[number];

const boardCardSchema = z.object({
  title: z.string().trim().min(1, 'Give this card a short title.').max(200, 'Keep the title under 200 characters.'),
  category: z.enum(BOARD_CATEGORIES),
  priority: z.preprocess((value) => value === '' ? undefined : Number(value), z.number().int().min(1).max(5)),
  estimatedDurationMinutes: z.preprocess((value) => value === '' ? undefined : Number(value), z.number().int().min(1).max(1440).optional()),
  deadline: z.string().optional(),
  note: z.string().max(2000, 'Keep the note under 2,000 characters.'),
});

export type BoardCardFormValues = z.infer<typeof boardCardSchema>;

const categoryLabels: Record<BoardCategory, string> = {
  work: 'Work',
  recovery: 'Recovery',
  managing: 'Managing',
  social: 'Social',
  fun: 'Fun',
};

export function BoardCardForm({
  card,
  defaultCategory = 'work',
  pending,
  onSubmit,
  onCancel,
}: {
  card?: BoardCard;
  defaultCategory?: BoardCategory;
  pending: boolean;
  onSubmit: (values: BoardCardFormValues) => void;
  onCancel: () => void;
}) {
  const form = useForm<BoardCardFormValues>({
    resolver: zodResolver(boardCardSchema),
    defaultValues: {
      title: card?.title ?? '',
      category: card?.category ?? defaultCategory,
      priority: card?.priority ?? 3,
      estimatedDurationMinutes: card?.estimatedDurationMinutes ?? undefined,
      deadline: card?.deadline ? card.deadline.slice(0, 16) : '',
      note: card?.note ?? '',
    },
  });

  const noteLength = form.watch('note').length;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onSubmit({
          ...values,
          title: values.title.trim(),
          note: values.note.trim(),
          estimatedDurationMinutes: values.estimatedDurationMinutes || undefined,
          deadline: values.deadline || undefined,
        }))}
        className="space-y-5"
        data-testid={card ? `form-edit-board-card-${card.id}` : 'form-create-board-card'}
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-semibold text-foreground">What do you want to remember?</FormLabel>
              <FormControl>
                <input
                  {...field}
                  autoFocus
                  maxLength={200}
                  placeholder="A thing worth having close"
                  data-testid="input-board-card-title"
                  className="flex h-12 w-full rounded-xl border border-input bg-background/70 px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-foreground">Priority</FormLabel>
                <FormControl>
                  <input
                    {...field}
                    type="number"
                    min={1}
                    max={5}
                    step={1}
                    inputMode="numeric"
                    data-testid="input-board-card-priority"
                    className="flex h-12 w-full rounded-xl border border-input bg-background/70 px-4 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </FormControl>
                <FormDescription className="text-[11px] leading-5">A personal 1–5 signal, separate from column order.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="estimatedDurationMinutes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-foreground">Estimated duration <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                <FormControl>
                  <input
                    {...field}
                    value={field.value ?? ''}
                    type="number"
                    min={1}
                    max={1440}
                    step={1}
                    inputMode="numeric"
                    placeholder="Minutes"
                    data-testid="input-board-card-duration"
                    className="flex h-12 w-full rounded-xl border border-input bg-background/70 px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="deadline"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-semibold text-foreground">Deadline <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
              <FormControl>
                <input
                  {...field}
                  type="datetime-local"
                  data-testid="input-board-card-deadline"
                  className="flex h-12 w-full rounded-xl border border-input bg-background/70 px-4 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-semibold text-foreground">Place it somewhere</FormLabel>
              <FormControl>
                <select
                  {...field}
                  data-testid="select-board-card-category"
                  className="flex h-12 w-full appearance-none rounded-xl border border-input bg-background/70 px-4 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  {BOARD_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
                </select>
              </FormControl>
              <FormDescription className="text-[11px] leading-5">Categories keep the Board calm; they do not change your Today schedule.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-3">
                <FormLabel className="text-xs font-semibold text-foreground">A little context <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                <span className="font-mono-ui text-[10px] text-muted-foreground/75">{noteLength}/2000</span>
              </div>
              <FormControl>
                <textarea
                  {...field}
                  maxLength={2000}
                  rows={4}
                  placeholder="Links, details, or the version of this idea you want to keep."
                  data-testid="textarea-board-card-note"
                  className="w-full resize-none rounded-xl border border-input bg-background/70 px-4 py-3 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={pending} data-testid="button-cancel-board-card" className="min-h-11 rounded-full border border-border px-5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/45 hover:text-foreground disabled:opacity-50">
            Keep editing
          </button>
          <button type="submit" disabled={pending} data-testid="button-save-board-card" className="min-h-11 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60">
            {pending ? 'Saving card…' : card ? 'Save changes' : 'Add to Board'}
          </button>
        </div>
      </form>
    </Form>
  );
}