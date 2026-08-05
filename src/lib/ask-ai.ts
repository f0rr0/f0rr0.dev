interface AskAiContext {
  sourceUrl: string;
  title: string;
}

export const buildAskAiPrompt = ({ sourceUrl, title }: AskAiContext) =>
  `Read "${title}" at ${sourceUrl}. Answer my questions using the post as your primary source.`;

export const buildAskAiLinks = (context: AskAiContext) => {
  const prompt = encodeURIComponent(buildAskAiPrompt(context));

  return {
    chatGpt: `https://chatgpt.com/?q=${prompt}`,
    claude: `https://claude.ai/new?q=${prompt}`,
    gemini: `https://gemini.google.com/app?q=${prompt}`,
  };
};
