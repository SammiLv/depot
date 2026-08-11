export function parseStructuredSummary(
  value: string | null | undefined,
  firstLabel: string,
  secondLabel: string,
) {
  const text = (value ?? "").trim();
  if (!text) {
    return { first: "", second: "" };
  }

  const blockMap = new Map<string, string>();
  for (const part of text.split(/(?=【[^】]+】)/)) {
    const match = part.match(/^【([^】]+)】\s*([\s\S]*)$/);
    if (!match) continue;
    blockMap.set(match[1], match[2].trim());
  }

  if (blockMap.size > 0) {
    return {
      first: blockMap.get(firstLabel) ?? "",
      second: blockMap.get(secondLabel) ?? "",
    };
  }

  return { first: text, second: "" };
}
