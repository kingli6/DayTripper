import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, LoaderCircle, MessageCircle, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import {
  useCreatePlanningDiscussionReply,
} from '@workspace/api-client-react';
import type {
  PlanningDiscussionMessage,
  PlanningDiscussionRequest,
  PlanningDiscussionRequestPlanningStyle,
} from '@workspace/api-client-react';

type PlanningDiscussionProps = Omit<PlanningDiscussionRequest, 'messages'> & {
  onBack: () => void;
  onStartProposal: (messages: PlanningDiscussionMessage[]) => void;
};

function errorMessage(error: unknown) {
  const responseData = (error as { data?: unknown }).data;
  if (responseData && typeof responseData === 'object' && typeof (responseData as { error?: unknown }).error === 'string') {
    return (responseData as { error: string }).error;
  }
  return 'The conversation could not continue. Your choices are still here.';
}

function DiscussionSkeleton() {
  return (
    <div className="space-y-3" aria-label="Opening a private planning conversation" data-testid="status-planning-discussion-loading">
      <div className="flex gap-3">
        <div className="mt-1 size-8 animate-pulse rounded-full bg-primary/15" />
        <div className="min-w-0 flex-1 rounded-[18px] rounded-tl-md border border-border/60 bg-card/60 p-4">
          <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
          <div className="mt-3 h-3 w-11/12 animate-pulse rounded-full bg-muted" />
          <div className="mt-2 h-3 w-2/3 animate-pulse rounded-full bg-muted/75" />
        </div>
      </div>
      <p className="pt-1 text-center text-xs text-muted-foreground">Taking a quiet look at what you shared…</p>
    </div>
  );
}

function AssistantBubble({ content, index }: { content: string; index: number }) {
  return (
    <div className="flex items-start gap-3 animate-rise" data-testid={`message-planning-assistant-${index}`}>
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
        <Sparkles className="size-3.5" strokeWidth={1.8} />
      </span>
      <div className="max-w-[88%] rounded-[18px] rounded-tl-md border border-primary/20 bg-primary/[0.065] px-4 py-3.5 sm:max-w-[78%]">
        <p className="font-mono-ui text-[9px] uppercase tracking-[0.14em] text-primary">A thought to sit with</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{content}</p>
      </div>
    </div>
  );
}

function UserBubble({ content, index }: { content: string; index: number }) {
  return (
    <div className="flex justify-end animate-rise" data-testid={`message-planning-user-${index}`}>
      <div className="max-w-[88%] rounded-[18px] rounded-br-md border border-accent/35 bg-accent/[0.12] px-4 py-3.5 sm:max-w-[78%]">
        <p className="font-mono-ui text-[9px] uppercase tracking-[0.14em] text-accent-foreground">You</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{content}</p>
      </div>
    </div>
  );
}

export function PlanningDiscussion({
  currentDate,
  intention,
  currentTime,
  availableTime,
  planningStyle,
  fixedCommitments,
  includeJournalEntryIds,
  considerJournalEntryIds,
  onBack,
  onStartProposal,
}: PlanningDiscussionProps) {
  const createReply = useCreatePlanningDiscussionReply();
  const [messages, setMessages] = useState<PlanningDiscussionMessage[]>([]);
  const [reply, setReply] = useState('');
  const [discussionEnded, setDiscussionEnded] = useState(false);
  const [error, setError] = useState('');
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const startedRef = useRef(false);
  const lastRequestMessagesRef = useRef<PlanningDiscussionMessage[]>([]);

  const context = {
    currentDate,
    intention,
    currentTime,
    availableTime,
    planningStyle: planningStyle as PlanningDiscussionRequestPlanningStyle,
    fixedCommitments,
    includeJournalEntryIds,
    considerJournalEntryIds,
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const requestMessages: PlanningDiscussionMessage[] = [];
    lastRequestMessagesRef.current = requestMessages;
    createReply.mutate({ data: { ...context, messages: requestMessages } }, {
      onSuccess: (result) => {
        setMessages([{ role: 'assistant', content: result.message }]);
        setError('');
      },
      onError: (requestError) => setError(errorMessage(requestError)),
    });
  // This is an intentional one-time opening request for this conversation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = reply.trim();
    if (!content || createReply.isPending || discussionEnded || messages.length >= 7) return;

    const nextMessages: PlanningDiscussionMessage[] = [...messages, { role: 'user', content }];
    setReply('');
    setError('');
    lastRequestMessagesRef.current = nextMessages;
    createReply.mutate({ data: { ...context, messages: nextMessages } }, {
      onSuccess: (result) => {
        setMessages([...nextMessages, { role: 'assistant', content: result.message }]);
        window.requestAnimationFrame(() => replyRef.current?.focus());
      },
      onError: (requestError) => {
        setReply(content);
        setError(errorMessage(requestError));
      },
    });
  }

  function retryOpening() {
    setError('');
    const requestMessages = lastRequestMessagesRef.current;
    createReply.mutate({ data: { ...context, messages: requestMessages } }, {
      onSuccess: (result) => setMessages([...requestMessages, { role: 'assistant', content: result.message }]),
      onError: (requestError) => setError(errorMessage(requestError)),
    });
  }

  const canContinue = !createReply.isPending && messages.length > 0;
  const reachedLimit = messages.length >= 7;

  return (
    <div className="mt-7 space-y-5" data-testid="section-planning-discussion">
      <div className="rounded-[22px] border border-accent/30 bg-accent/[0.08] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent-foreground">
            <MessageCircle className="size-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-accent-foreground">A small pause before the plan</p>
            <h3 className="mt-2 font-display text-[27px] leading-tight tracking-[-0.035em]">What should this day make room for?</h3>
            <p className="mt-2 max-w-[570px] text-sm leading-6 text-muted-foreground">You can answer in a sentence, change your mind, or leave it here. This conversation will not edit your saved activities.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
          <span className="rounded-full border border-primary/20 bg-background/55 px-3 py-1.5" data-testid="status-planning-discussion-included">{includeJournalEntryIds?.length ?? 0} included notes</span>
          <span className="rounded-full border border-accent/25 bg-background/55 px-3 py-1.5" data-testid="status-planning-discussion-considered">{considerJournalEntryIds?.length ?? 0} considered notes</span>
          <span className="rounded-full border border-border/70 bg-background/55 px-3 py-1.5">Nothing saved yet</span>
        </div>
      </div>

      {createReply.isPending && messages.length === 0 ? <DiscussionSkeleton /> : (
        <div className="space-y-4 rounded-[22px] border border-border/75 bg-card/45 p-4 sm:p-5" data-testid="transcript-planning-discussion">
          {messages.length === 0 && !createReply.isPending && (
            <div className="rounded-[18px] border border-dashed border-primary/25 bg-background/45 px-5 py-9 text-center" data-testid="status-planning-discussion-empty">
              <MessageCircle className="mx-auto size-5 text-primary" strokeWidth={1.7} />
              <p className="mt-3 font-display text-[23px] tracking-[-0.03em]">The conversation is waiting.</p>
              <p className="mx-auto mt-2 max-w-[350px] text-xs leading-5 text-muted-foreground">Nothing has been sent beyond the notes you chose. Try opening it again when you are ready.</p>
            </div>
          )}
          {messages.map((message, index) => message.role === 'assistant'
            ? <AssistantBubble key={`${message.role}-${index}`} content={message.content} index={index} />
            : <UserBubble key={`${message.role}-${index}`} content={message.content} index={index} />)}
          {createReply.isPending && messages.length > 0 && (
            <div className="flex items-start gap-3" aria-label="Waiting for a planning reply" data-testid="status-planning-discussion-reply-loading">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles className="size-3.5 animate-breathe" strokeWidth={1.8} /></span>
              <div className="rounded-[18px] rounded-tl-md border border-border/60 bg-background/65 px-4 py-3.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 animate-pulse rounded-full bg-primary" /><span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:120ms]" /><span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:240ms]" /><span className="ml-1">Listening</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-[18px] border border-destructive/25 bg-destructive/[0.06] p-4" role="alert" data-testid="status-planning-discussion-error">
          <p className="text-sm font-semibold text-foreground">The thread needs another try.</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{error}</p>
          <button type="button" onClick={retryOpening} disabled={createReply.isPending} data-testid="button-retry-planning-discussion" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-xs font-semibold hover:border-primary/40 disabled:opacity-50">
            <RotateCcw className={`size-3.5 ${createReply.isPending ? 'animate-spin' : ''}`} strokeWidth={1.8} /> Try again
          </button>
        </div>
      )}

      {!discussionEnded && canContinue && !reachedLimit && (
        <form onSubmit={sendReply} className="rounded-[20px] border border-primary/25 bg-background/55 p-4" data-testid="form-planning-discussion-reply">
          <label htmlFor="planning-discussion-reply" className="text-xs font-semibold text-foreground">Your reply <span className="font-normal text-muted-foreground">· no perfect answer needed</span></label>
          <textarea ref={replyRef} id="planning-discussion-reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={1200} rows={3} placeholder="The part I most want to protect is…" data-testid="input-planning-discussion-reply" className="mt-2 w-full resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="font-mono-ui text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{reply.length}/1200</span>
            <button type="submit" disabled={!reply.trim() || createReply.isPending} data-testid="button-send-planning-discussion-reply" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50">
              {createReply.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" strokeWidth={1.8} />}
              {createReply.isPending ? 'Listening…' : 'Send reply'}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-border/65 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onBack} disabled={createReply.isPending} data-testid="button-back-to-planning-details" className="inline-flex min-h-10 items-center gap-2 self-start rounded-full border border-border bg-background px-3.5 py-2 text-xs font-semibold hover:border-primary/40 disabled:opacity-45">
          <ArrowLeft className="size-3.5" strokeWidth={1.8} /> Back to details
        </button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {!discussionEnded && (
            <button type="button" onClick={() => setDiscussionEnded(true)} disabled={createReply.isPending} data-testid="button-end-planning-discussion" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-45">
              <X className="size-3.5" strokeWidth={1.8} /> End conversation
            </button>
          )}
          {discussionEnded && (
            <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-secondary px-3.5 py-2 text-xs font-semibold text-secondary-foreground" data-testid="status-planning-discussion-ended">
              <Check className="size-3.5" strokeWidth={2} /> Conversation set aside
            </span>
          )}
          <button type="button" onClick={() => onStartProposal(messages)} disabled={createReply.isPending} data-testid="button-start-planning-proposal" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50">
            <Sparkles className="size-3.5" strokeWidth={1.8} /> Start the proposal
          </button>
        </div>
      </div>
      <p className="text-center text-[11px] leading-5 text-muted-foreground" data-testid="text-planning-discussion-privacy">Only the journal notes you marked Include or Consider and this conversation are used for the next step.</p>
    </div>
  );
}