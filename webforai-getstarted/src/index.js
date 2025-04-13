import { htmlToMarkdown } from "webforai";
import { loadHtml } from "webforai/loaders/fetch";

const html = await loadHtml("https://webforai.dev/cookbook/simple");
const markdown = htmlToMarkdown(html);

console.log(markdown);
