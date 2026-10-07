import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LiveCaptionPanel } from '@/features/captions';
import type { CaptionLine, LiveCaptionsState } from '@/features/call-media';

function state(overrides: Partial<LiveCaptionsState> = {}): LiveCaptionsState {
  return {
    lines: [],
    support: 'SUPPORTED',
    publishing: false,
    togglePublishing: vi.fn(),
    error: null,
    ...overrides,
  };
}

function line(overrides: Partial<CaptionLine> = {}): CaptionLine {
  return {
    id: 'l1',
    userId: 'u_alice',
    name: 'Alice Participant',
    text: 'hello everyone',
    isFinal: true,
    at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Live captions panel', () => {
  it('attributes each line to its speaker', () => {
    render(<LiveCaptionPanel captions={state({ lines: [line()] })} selfUserId="u_bob" />);

    expect(screen.getByText('Alice Participant')).toBeInTheDocument();
    expect(screen.getByText('hello everyone')).toBeInTheDocument();
  });

  it('labels your own lines as yours', () => {
    render(<LiveCaptionPanel captions={state({ lines: [line()] })} selfUserId="u_alice" />);

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.queryByText('Alice Participant')).not.toBeInTheDocument();
  });

  it('dims interim text so it reads as speech still firming up', () => {
    const { container } = render(
      <LiveCaptionPanel
        captions={state({ lines: [line({ isFinal: false, text: 'hello every' })] })}
        selfUserId="u_bob"
      />,
    );

    const paragraph = container.querySelector('p.text-muted-foreground');
    expect(paragraph).toHaveTextContent('hello every');
  });

  it('says so plainly when the browser cannot transcribe', () => {
    render(<LiveCaptionPanel captions={state({ support: 'UNSUPPORTED' })} selfUserId="u_bob" />);

    expect(screen.getByText(/can't do captions/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /caption my speech/i })).not.toBeInTheDocument();
  });

  it('lets a participant start and stop captioning themselves', async () => {
    const user = userEvent.setup();
    const togglePublishing = vi.fn();

    render(
      <LiveCaptionPanel captions={state({ togglePublishing })} selfUserId="u_bob" />,
    );

    await user.click(screen.getByRole('button', { name: /caption my speech/i }));
    expect(togglePublishing).toHaveBeenCalledOnce();
  });

  it('discloses where the audio goes while captioning is on', () => {
    render(<LiveCaptionPanel captions={state({ publishing: true })} selfUserId="u_bob" />);

    expect(screen.getByText(/sends what you say to its speech service/i)).toBeInTheDocument();
  });

  it('surfaces a caption failure without implying the call is at risk', () => {
    render(
      <LiveCaptionPanel
        captions={state({ error: 'Caption service is unreachable.' })}
        selfUserId="u_bob"
      />,
    );

    expect(screen.getByText(/caption service is unreachable/i)).toBeInTheDocument();
    expect(screen.queryByText(/call|disconnect|ended/i)).not.toBeInTheDocument();
  });
});
