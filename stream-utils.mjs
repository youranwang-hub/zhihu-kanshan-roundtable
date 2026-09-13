// Incremental SSE framing: chunks may split UTF-8 characters or event boundaries.
export function createSSEParser(onEvent) {
  let buffer = '';
  return {
    push(text) {
      buffer += text;
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const lines = frame.split(/\r?\n/);
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
        const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message';
        if (data) onEvent({ event, data });
      }
    },
  };
}
