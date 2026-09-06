import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, LoaderCircle, LockKeyhole, X } from 'lucide-react';
import {
  useAnswerExecutionInterview,
  useFinishExecutionInterview,
  useStartExecutionInterview,
} from '@workspace/api-client-react';

type InterviewStage = 'starting' | 'active' | 'finishing' | 'finished' | 'error';

export function ExecutionInterviewModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [stage, setStage] = useState<InterviewStage>('starting');
  const [interviewId, setInterviewId] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [questionNumber, setQuestionNumber] = useState<number | null>(null);
  const [answer, setAnswer] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const startInterview = useStartExecutionInterview();
  const answerInterview = useAnswerExecutionInterview();
  const finishInterview = useFinishExecutionInterview();

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    void startInterview.mutateAsync().then((result) => {
      setInterviewId(result.interviewId);
      setQuestion(result.question);
      setQuestionNumber(result.questionNumber);
      setStage('active');
    }).catch(() => {
      setErrorMessage('The check-in could not start. Please try again.');
      setStage('error');
    });

    return () => {
      document.body.style.overflow = '';
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (stage === 'active') {
      const frame = window.requestAnimationFrame(() => answerRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [question, stage]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (stage === 'active' && interviewId !== null) {
          void stopInterview();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [stage, interviewId]);

  async function stopInterview() {
    if (interviewId === null || stage === 'finishing' || stage === 'finished') return;
    setStage('finishing');
    setErrorMessage('');
    try {
      await finishInterview.mutateAsync({ interviewId });
      setStage('finished');
    } catch {
      setErrorMessage('That did not save. You can try stopping again.');
      setStage('active');
    }
  }

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (interviewId === null || !answer.trim() || stage !== 'active') return;
    setStage('finishing');
    setErrorMessage('');
    try {
      const result = await answerInterview.mutateAsync({
        interviewId,
        data: { answer: answer.trim() },
      });
      setAnswer('');
      if (result.status === 'finished' || !result.question) {
        setStage('finished');
        return;
      }
      setQuestion(result.question);
      setQuestionNumber(result.questionNumber);
      setStage('active');
    } catch {
      setErrorMessage('That answer did not go through. Please try once more.');
      setStage('active');
    }
  }

  function skipQuestion() {
    setAnswer('I would rather skip this question.');
    window.requestAnimationFrame(() => {
      const form = dialogRef.current?.querySelector<HTMLFormElement>('form');
      form?.requestSubmit();
    });
  }

  const isWorking = stage === 'starting' || stage === 'finishing';
  const isFinished = stage === 'finished';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(203_29%_21%/0.38)] p-3 backdrop-blur-[3px] sm:items-center sm:p-6" data-testid="modal-execution-interview">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="execution-interview-title"
        className="animate-rise relative max-h-[calc(100dvh-1.5rem)] w-full max-w-[510px] overflow-y-auto rounded-[28px] border border-[hsl(38_27%_85%)] bg-card shadow-[0_24px_80px_hsl(203_29%_21%/0.22)] sm:max-h-[calc(100dvh-3rem)]"
      >
        <div className="absolute inset-y-0 left-0 w-1.5 bg-[hsl(15_66%_71%)]" aria-hidden="true" />
        <div className="p-6 pl-7 sm:p-8 sm:pl-9">
          <header className="flex items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-[hsl(176_31%_37%)]">
                <LockKeyhole className="size-3.5" strokeWidth={1.8} />
                <span className="font-mono-ui text-[10px] uppercase tracking-[0.18em]">Private check-in</span>
              </div>
              <h2 id="execution-interview-title" className="mt-4 font-display text-[31px] leading-none tracking-[-0.045em]">
                How you work
              </h2>
            </div>
            <button
              type="button"
              onClick={() => (isFinished ? onClose() : void stopInterview())}
              disabled={isWorking && stage === 'starting'}
              aria-label={isFinished ? 'Close check-in' : 'Stop check-in'}
              data-testid="button-close-execution-interview"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            >
              <X className="size-4" strokeWidth={1.7} />
            </button>
          </header>

          {stage === 'starting' && (
            <div className="py-16" aria-live="polite" data-testid="status-execution-interview-loading">
              <div className="space-y-3">
                <div className="h-4 w-4/5 animate-pulse rounded-full bg-muted" />
                <div className="h-4 w-3/5 animate-pulse rounded-full bg-muted/75" />
                <div className="mt-8 h-12 w-full animate-pulse rounded-2xl bg-muted/60" />
              </div>
              <p className="mt-6 text-xs text-muted-foreground">Making a little room to listen.</p>
            </div>
          )}

          {stage === 'error' && (
            <div className="py-12" role="alert" data-testid="status-execution-interview-error">
              <p className="text-sm font-semibold text-foreground">{errorMessage}</p>
              <button
                type="button"
                onClick={onClose}
                data-testid="button-dismiss-execution-interview-error"
                className="mt-6 rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Close
              </button>
            </div>
          )}

          {stage === 'active' && (
            <form onSubmit={(event) => void submitAnswer(event)} className="mt-10" data-testid="form-execution-interview">
              <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Take it in your own words
              </p>
              <p key={questionNumber ?? question} className="animate-rise mt-4 font-display text-[26px] leading-[1.18] tracking-[-0.03em]" data-testid="text-execution-interview-question">
                {question}
              </p>
              <label htmlFor="execution-interview-answer" className="sr-only">Your answer</label>
              <textarea
                ref={answerRef}
                id="execution-interview-answer"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="A sentence or two is enough."
                data-testid="input-execution-interview-answer"
                className="mt-8 w-full resize-none rounded-2xl border border-input bg-background/60 px-4 py-3.5 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
              {errorMessage && <p className="mt-3 text-xs text-destructive" role="alert" data-testid="status-execution-interview-answer-error">{errorMessage}</p>}
              <div className="mt-5 flex flex-col-reverse gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={skipQuestion}
                    data-testid="button-skip-execution-question"
                    className="text-xs font-semibold text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Skip this one
                  </button>
                  <button
                    type="button"
                    onClick={() => void stopInterview()}
                    data-testid="button-stop-execution-interview"
                    className="text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Stop here
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={!answer.trim()}
                  data-testid="button-submit-execution-answer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Continue
                  <ChevronRight className="size-3.5" strokeWidth={2} />
                </button>
              </div>
            </form>
          )}

          {stage === 'finishing' && (
            <div className="py-16 text-center" aria-live="polite" data-testid="status-execution-interview-saving">
              <LoaderCircle className="mx-auto size-5 animate-spin text-primary" strokeWidth={1.8} />
              <p className="mt-5 text-sm text-muted-foreground">Keeping that in mind.</p>
            </div>
          )}

          {isFinished && (
            <div className="py-10" aria-live="polite" data-testid="status-execution-interview-finished">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="size-4" strokeWidth={2.3} />
              </div>
              <p className="mt-7 max-w-[330px] font-display text-[25px] leading-[1.16] tracking-[-0.03em]">
                That is enough for now.
              </p>
              <p className="mt-3 max-w-[380px] text-sm leading-6 text-muted-foreground">
                I’ll use what you shared gradually when helping plan.
              </p>
              <button
                type="button"
                onClick={onClose}
                data-testid="button-finish-execution-interview"
                className="mt-8 inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Return to today
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}