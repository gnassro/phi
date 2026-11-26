/**
 * Types for the shared webview icon markup (public/icons.js), which the extension host
 * also imports to build the webview HTML.
 */
declare module '*/icons.js' {
  type IconOptions = { size?: number; className?: string };
  type ChevronOptions = { width?: number; height?: number; className?: string };

  export const icons: {
    plus(size?: number): string;
    history(size?: number): string;
    tree(size?: number): string;
    skills(size?: number): string;
    settings(size?: number): string;
    accounts(size?: number): string;
    command(size?: number): string;
    paperclip(size?: number): string;
    send(size?: number): string;
    abort(size?: number): string;
    arrowDown(size?: number): string;
    robot(options?: IconOptions): string;
    thinkingLevels(options?: IconOptions): string;
    donut(pct?: number): string;
    chevronDown(options?: ChevronOptions): string;
    chevronRight(size?: number): string;
    caretRight(size?: number): string;
    close(size?: number): string;
    info(size?: number): string;
    github(size?: number): string;
    logIn(size?: number): string;
    copy(size?: number): string;
    copyMessage(size?: number): string;
    brain(size?: number): string;
    document(size?: number): string;
  };
}
