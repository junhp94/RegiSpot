// Shared class strings. Colors come from the tokens in index.css.

export const PAGE = "min-h-screen bg-page text-fg";

export const CARD = "p-4 rounded-md bg-surface border border-line";

export const BTN =
  "h-10 px-4 rounded-md border font-bold text-[15px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

export const BTN_PRIMARY = `${BTN} border-accent bg-accent text-white hover:bg-accent-hover hover:border-accent-hover`;

export const BTN_GHOST = `${BTN} border-line-strong bg-surface text-fg hover:bg-subtle`;

export const BTN_DANGER =
  "h-8 px-3 rounded-md border border-danger bg-transparent text-danger text-sm font-bold cursor-pointer hover:bg-danger-soft";

export const INPUT =
  "w-full h-11 rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-muted focus:outline-2 focus:outline-offset-0 focus:outline-accent-text focus:border-accent-text";

export const LABEL = "block text-sm font-bold text-fg mb-1.5 mt-4";

export const MODAL_OVERLAY =
  "fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4";

export const MODAL_CARD =
  "w-full max-w-[420px] p-6 rounded-md bg-surface border border-line max-h-[90vh] overflow-y-auto";

export const ERROR_BOX =
  "px-3 py-2.5 rounded-md bg-danger-soft border border-danger text-danger text-sm mb-2";

export const HEADING = "text-xl font-bold m-0 text-fg";
