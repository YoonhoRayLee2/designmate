// Minimal markdown → HTML for the specification document.
// Supports headings, bold, unordered lists, tables, and paragraphs — the
// only constructs renderSpecMarkdown() produces. Not a general renderer.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s: string): string {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;

  const flushList = (items: string[]) => {
    if (items.length) out.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</ul>`);
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^###\s+/.test(line)) { out.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`); i++; continue; }
    if (/^##\s+/.test(line)) { out.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`); i++; continue; }
    if (/^#\s+/.test(line)) { out.push(`<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`); i++; continue; }

    // table: header row starting with | followed by a separator row
    if (line.startsWith('|') && i + 1 < lines.length && /^\|[\s:-]+\|/.test(lines[i + 1])) {
      const cells = (row: string) => row.split('|').slice(1, -1).map((c) => c.trim());
      const headers = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(cells(lines[i])); i++; }
      const thead = `<tr>${headers.map((h) => `<th>${inline(h)}</th>`).join('')}</tr>`;
      const tbody = rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) { items.push(lines[i].replace(/^-\s+/, '')); i++; }
      flushList(items);
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    out.push(`<p>${inline(line)}</p>`);
    i++;
  }

  return out.join('\n');
}
