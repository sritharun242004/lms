/**
 * Width of the interactive session cards in the chat thread (polls, open-ended
 * questions, word clouds, scales).
 *
 * On phones the card keeps a small gutter; from `sm` up it fills the thread
 * (minus a gutter on each side) instead of stopping at 56rem, and is capped at
 * 90rem so it never sprawls on ultra-wide monitors. It is centred inside the
 * chat pane itself, so it can never run under the sidebar.
 */
export const INTERACTIVE_CARD_WIDTH =
  "mx-3 w-[calc(100%-1.5rem)] sm:mx-auto sm:w-full sm:max-w-[min(calc(100%-2rem),90rem)]";
