import {
  Box,
  ChevronRight,
  Circle,
  Maximize2,
  MoreHorizontal,
  Paperclip,
  Tag,
  UserRound,
  X,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

export type IssueCreateDialogSubmitValue = {
  title: string;
  description: string;
};

type IssueCreateDialogProps = {
  open: boolean;
  projectName: string;
  submitting?: boolean;
  onClose: () => void;
  onCreate: (value: IssueCreateDialogSubmitValue) => Promise<void> | void;
};

const projectChipLabel = (projectName: string) =>
  projectName.trim() || 'Project';

export function IssueCreateDialog({
  open,
  projectName,
  submitting = false,
  onClose,
  onCreate,
}: IssueCreateDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [createMore, setCreateMore] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const projectLabel = projectChipLabel(projectName);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      titleRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open, submitting]);

  if (!open) return null;

  const resetForNextIssue = () => {
    setTitle('');
    setDescription('');
    setError('');
    window.requestAnimationFrame(() => {
      titleRef.current?.focus();
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      titleRef.current?.focus();
      return;
    }

    setError('');
    try {
      await onCreate({
        title: trimmedTitle,
        description: description.trim(),
      });
      if (createMore) {
        resetForNextIssue();
      } else {
        onClose();
      }
    } catch (createError) {
      setError(issueCreateErrorMessage(createError));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-[30px] py-[22px] text-[#f3f3f4]">
      <style>{`
        .issue-create-title::placeholder,
        .issue-create-description::placeholder {
          color: #66676d;
          opacity: 1;
        }

        .issue-create-title,
        .issue-create-description {
          caret-color: #f3f3f4;
        }

        @media (max-width: 760px) {
          .issue-create-shell {
            border-radius: 28px;
          }

          .issue-create-header,
          .issue-create-body,
          .issue-create-footer {
            padding-left: 24px;
            padding-right: 24px;
          }

          .issue-create-title {
            font-size: 34px;
          }

          .issue-create-description {
            font-size: 27px;
          }
        }
      `}</style>

      <form
        aria-label="Create issue"
        className="issue-create-shell flex h-[min(594px,calc(100vh-44px))] w-[min(1706px,calc(100vw-60px))] flex-col overflow-hidden rounded-[48px] border border-[#303236] bg-[#1b1b1c] shadow-[0_34px_90px_rgba(0,0,0,0.64)]"
        onSubmit={handleSubmit}
      >
        <header className="issue-create-header flex h-[104px] shrink-0 items-start justify-between px-[28px] pt-[28px]">
          <div className="flex min-w-0 items-center gap-[14px]">
            <div className="flex h-[55px] max-w-[360px] items-center gap-[13px] rounded-[28px] border border-[#303137] bg-[#292a2c] px-[16px] pr-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[6px] bg-[#0bbf4c]/10 text-[#03c84d]">
                <svg
                  aria-hidden="true"
                  className="h-[23px] w-[23px]"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M4 17.5h16M5.5 15l4-4 3 2.5 5-6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 7.5h2.5V10"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                  />
                </svg>
              </span>
              <span className="min-w-0 truncate text-[29px] font-bold leading-none text-[#f2f2f3]">
                {projectLabel}
              </span>
            </div>

            <ChevronRight
              aria-hidden="true"
              className="h-[24px] w-[24px] shrink-0 text-[#85868c]"
              strokeWidth={3}
            />
            <h2 className="shrink-0 text-[34px] font-bold leading-none tracking-[-0.03em] text-[#e7e7e8]">
              New issue
            </h2>
          </div>

          <div className="flex items-center gap-[31px] pr-[19px] pt-[18px] text-[#a3a4aa]">
            <button
              aria-label="Expand create issue dialog"
              className="flex h-[28px] w-[28px] items-center justify-center rounded-md transition hover:bg-[#2a2b2d] hover:text-[#f1f1f2]"
              type="button"
            >
              <Maximize2 aria-hidden="true" className="h-[27px] w-[27px]" />
            </button>
            <button
              aria-label="Close create issue dialog"
              className="flex h-[32px] w-[32px] items-center justify-center rounded-md transition hover:bg-[#2a2b2d] hover:text-[#f1f1f2]"
              disabled={submitting}
              type="button"
              onClick={onClose}
            >
              <X aria-hidden="true" className="h-[32px] w-[32px]" />
            </button>
          </div>
        </header>

        <main className="issue-create-body flex min-h-0 flex-1 flex-col px-[42px]">
          <label className="sr-only" htmlFor="issue-create-title">
            Issue title
          </label>
          <textarea
            ref={titleRef}
            id="issue-create-title"
            className="issue-create-title mt-[28px] h-[62px] resize-none border-0 bg-transparent p-0 text-[40px] font-bold leading-[1.12] tracking-[-0.035em] text-[#f0f0f1] outline-none placeholder:font-bold"
            placeholder="Issue title"
            rows={1}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />

          <label className="sr-only" htmlFor="issue-create-description">
            Issue description
          </label>
          <textarea
            id="issue-create-description"
            className="issue-create-description mt-[13px] h-[108px] resize-none border-0 bg-transparent p-0 text-[34px] font-medium leading-[1.18] tracking-[-0.03em] text-[#d7d7d9] outline-none"
            placeholder="Add description..."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />

          <div className="mt-auto flex flex-wrap items-center gap-[14px] pb-[54px]">
            <IssueCreatePill>
              <Circle
                aria-hidden="true"
                className="h-[28px] w-[28px] text-[#d9d9de]"
                strokeWidth={2.8}
              />
              <span>Todo</span>
            </IssueCreatePill>
            <IssueCreatePill muted>
              <span className="font-mono tracking-[0.02em]">---</span>
              <span>Priority</span>
            </IssueCreatePill>
            <IssueCreatePill muted>
              <UserRound
                aria-hidden="true"
                className="h-[31px] w-[31px]"
                strokeWidth={2.3}
              />
              <span>Assignee</span>
            </IssueCreatePill>
            <IssueCreatePill muted>
              <Box
                aria-hidden="true"
                className="h-[31px] w-[31px]"
                strokeWidth={2.1}
              />
              <span>Project</span>
            </IssueCreatePill>
            <IssueCreatePill muted>
              <Tag
                aria-hidden="true"
                className="h-[31px] w-[31px]"
                strokeWidth={2.2}
              />
              <span>Labels</span>
            </IssueCreatePill>
            <button
              aria-label="More issue fields"
              className="flex h-[54px] w-[58px] items-center justify-center rounded-full border border-[#37383c] bg-[#303133] text-[#b4b5ba] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition hover:bg-[#38393b] hover:text-[#f0f0f1]"
              type="button"
            >
              <MoreHorizontal
                aria-hidden="true"
                className="h-[32px] w-[32px]"
                strokeWidth={2.4}
              />
            </button>
          </div>

          {error && (
            <p className="-mt-[38px] pb-[14px] text-[16px] font-semibold text-[#ff8a85]">
              {error}
            </p>
          )}
        </main>

        <footer className="issue-create-footer flex h-[91px] shrink-0 items-start justify-between px-[28px]">
          <button
            aria-label="Attach file"
            className="flex h-[64px] w-[64px] items-center justify-center rounded-full border border-[#343539] bg-[#303133] text-[#aaaab0] shadow-[0_3px_10px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.03)] transition hover:bg-[#38393b] hover:text-[#f1f1f2]"
            type="button"
          >
            <Paperclip
              aria-hidden="true"
              className="h-[33px] w-[33px]"
              strokeWidth={2.2}
            />
          </button>

          <div className="flex items-center gap-[29px] pt-[16px]">
            <button
              aria-pressed={createMore}
              className="flex items-center gap-[14px] text-[30px] font-medium leading-none text-[#aaaab0]"
              type="button"
              onClick={() => setCreateMore((value) => !value)}
            >
              <span
                className={`relative h-[33px] w-[51px] rounded-full transition ${
                  createMore ? 'bg-[#6873ee]' : 'bg-[#68696e]'
                }`}
              >
                <span
                  className={`absolute top-1/2 h-[25px] w-[25px] -translate-y-1/2 rounded-full bg-[#f4f4f5] transition ${
                    createMore ? 'left-[22px]' : 'left-[4px]'
                  }`}
                />
              </span>
              <span>Create more</span>
            </button>

            <button
              className="h-[64px] min-w-[212px] rounded-full bg-[#626dde] px-[30px] text-[29px] font-bold leading-none text-white shadow-[0_12px_34px_rgba(98,109,222,0.24)] transition hover:bg-[#717bea] disabled:cursor-wait disabled:opacity-70"
              disabled={submitting}
              type="submit"
            >
              {submitting ? 'Creating...' : 'Create issue'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function IssueCreatePill({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <button
      className={`flex h-[54px] items-center gap-[10px] rounded-full border border-[#37383c] bg-[#303133] px-[18px] text-[29px] font-semibold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition hover:bg-[#38393b] ${
        muted ? 'text-[#aaaab0]' : 'text-[#f0f0f1]'
      }`}
      type="button"
    >
      {children}
    </button>
  );
}

function issueCreateErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Issue could not be created. Please try again.';
}
