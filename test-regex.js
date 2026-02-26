const preprocessHomebrewery = (markdown) => {
  if (!markdown) return '';
  return markdown.replace(
    /\{\{([a-zA-Z0-9_-]+)(?:,([^\n]*?))?\n([\s\S]*?)\n\}\}/gm,
    (_match, type, args, content) => {
      const attributes = args ? ` {args="${args}"}` : '';
      return `:::${type}${attributes}\n${content}\n:::`;
    }
  );
};

const input = `
{{monster,frame
## Goblin
*Small humanoid*
}}
`;

console.log("Input:");
console.log(input);
console.log("Output:");
console.log(preprocessHomebrewery(input));

const inputWithSpace = `
{{monster,frame
## Goblin
}}
`; // Note space after frame

console.log("Input with space:");
console.log(preprocessHomebrewery(inputWithSpace));
