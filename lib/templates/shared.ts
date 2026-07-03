// Low-fidelity wireframe primitives. Each returns an HTML string.
// The visual language is intentionally grayscale + dashed to read as a
// "wireframe", not a finished UI.

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const wf = {
  esc,

  bar(label: string): string {
    return `<div class="wf-bar">${esc(label)}</div>`;
  },

  header(title: string, rightLabel = '메뉴'): string {
    return `<header class="wf-header">
      <div class="wf-logo">${esc(title)}</div>
      <div class="wf-header-actions"><span class="wf-pill">${esc(rightLabel)}</span></div>
    </header>`;
  },

  button(label: string, primary = false): string {
    return `<div class="wf-btn ${primary ? 'wf-btn-primary' : ''}">${esc(label)}</div>`;
  },

  input(label: string): string {
    return `<label class="wf-field"><span class="wf-label">${esc(label)}</span><span class="wf-input"></span></label>`;
  },

  imageBox(label = '이미지', ratio = '4 / 3'): string {
    return `<div class="wf-image" style="aspect-ratio:${ratio}"><span>${esc(label)}</span></div>`;
  },

  textLines(count: number): string {
    let out = '';
    for (let i = 0; i < count; i++) {
      const w = 100 - i * 12;
      out += `<div class="wf-textline" style="width:${Math.max(w, 40)}%"></div>`;
    }
    return `<div class="wf-textblock">${out}</div>`;
  },

  card(title: string, body = ''): string {
    return `<div class="wf-card">
      ${wf.imageBox('썸네일', '1 / 1')}
      <div class="wf-card-title">${esc(title)}</div>
      ${body || wf.textLines(2)}
    </div>`;
  },

  section(title: string, inner: string): string {
    return `<section class="wf-section">
      <div class="wf-section-title">${esc(title)}</div>
      ${inner}
    </section>`;
  },

  tabbar(items: string[]): string {
    const tabs = items
      .map((t, i) => `<div class="wf-tab ${i === 0 ? 'active' : ''}">${esc(t)}</div>`)
      .join('');
    return `<nav class="wf-tabbar">${tabs}</nav>`;
  },
};

/** Wrap body HTML in a full standalone document with the wireframe stylesheet. */
export function wrapDocument(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #f4f4f5;
    color: #52525b;
    padding: 16px;
    line-height: 1.4;
  }
  .wf-frame {
    max-width: 480px;
    margin: 0 auto;
    background: #fff;
    border: 2px solid #d4d4d8;
    border-radius: 12px;
    overflow: hidden;
    min-height: 640px;
    display: flex;
    flex-direction: column;
  }
  .wf-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 2px dashed #d4d4d8; background: #fafafa;
  }
  .wf-logo { font-weight: 700; color: #3f3f46; }
  .wf-pill, .wf-tab {
    border: 1px dashed #a1a1aa; border-radius: 999px;
    padding: 4px 12px; font-size: 12px; color: #71717a;
  }
  .wf-bar {
    background: repeating-linear-gradient(45deg,#e4e4e7,#e4e4e7 8px,#f4f4f5 8px,#f4f4f5 16px);
    border: 1px dashed #a1a1aa; border-radius: 6px;
    padding: 10px 12px; font-size: 13px; color: #71717a; text-align: center;
    margin: 10px 16px;
  }
  .wf-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
  .wf-section { margin-bottom: 20px; }
  .wf-section-title { font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: #a1a1aa; margin-bottom: 8px; }
  .wf-image {
    width: 100%; background: #e4e4e7; border: 1px dashed #a1a1aa; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    color: #a1a1aa; font-size: 12px; margin-bottom: 8px;
  }
  .wf-textblock { display: flex; flex-direction: column; gap: 6px; }
  .wf-textline { height: 8px; background: #e4e4e7; border-radius: 4px; }
  .wf-card {
    border: 1px dashed #d4d4d8; border-radius: 8px; padding: 10px; background: #fafafa;
  }
  .wf-card-title { font-weight: 600; color: #52525b; margin: 6px 0; font-size: 14px; }
  .wf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .wf-btn {
    border: 1px dashed #a1a1aa; border-radius: 8px; padding: 12px; text-align: center;
    font-size: 14px; color: #71717a; background: #fafafa; margin-top: 8px;
  }
  .wf-btn-primary {
    background: #3f3f46; color: #fff; border: 1px solid #3f3f46; font-weight: 600;
  }
  .wf-field { display: block; margin-bottom: 14px; }
  .wf-label { display: block; font-size: 13px; color: #71717a; margin-bottom: 4px; }
  .wf-input { display: block; height: 40px; border: 1px dashed #a1a1aa; border-radius: 6px; background: #fafafa; }
  .wf-tabbar {
    display: flex; justify-content: space-around; border-top: 2px dashed #d4d4d8;
    padding: 10px; background: #fafafa;
  }
  .wf-tab.active { border-style: solid; color: #3f3f46; font-weight: 600; }
  .wf-stat {
    border: 1px dashed #d4d4d8; border-radius: 8px; padding: 14px; background: #fafafa;
  }
  .wf-stat .num { font-size: 22px; font-weight: 700; color: #3f3f46; }
  .wf-stat .lbl { font-size: 12px; color: #a1a1aa; margin-top: 4px; }
  .wf-row { display: flex; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px dashed #e4e4e7; }
  .wf-avatar { width: 40px; height: 40px; border-radius: 50%; background: #e4e4e7; border: 1px dashed #a1a1aa; flex: 0 0 auto; }
</style>
</head>
<body>
  <div class="wf-frame">
    ${bodyHtml}
  </div>
</body>
</html>`;
}
