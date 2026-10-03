import { Marked } from "marked";

// Renders Claude's chat replies. Raw HTML is dropped rather than rendered.
const marked = new Marked({ gfm: true, breaks: true });
marked.use({ renderer: { html: () => "" } });

export function renderChatMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}
