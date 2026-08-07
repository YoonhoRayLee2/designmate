'use client';

import { useState } from 'react';

// The preview is a static mockup, not a working app. Clicking a link/form/button
// inside the iframe would otherwise navigate or submit and break the preview.
// This snippet neutralizes all interaction (clicks do nothing, page stays put).
const INERT_SNIPPET = `<style>
  a, button, input, select, textarea, label, [role="button"], [onclick] {
    pointer-events: none !important;
    cursor: default !important;
  }
  form { pointer-events: none !important; }
</style>`;

/** Inject the inert snippet into <head> (or prepend if there's no head). */
function makeInert(html: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${INERT_SNIPPET}`);
  }
  return INERT_SNIPPET + html;
}

export default function WireframePreview({ html }: { html: string }) {
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop');
  const inertHtml = makeInert(html);

  return (
    <div className="wire-wrap">
      <div className="wire-toolbar" role="group" aria-label="미리보기 크기">
        <button
          className={`wire-tog ${view === 'desktop' ? 'on' : ''}`}
          aria-pressed={view === 'desktop'}
          onClick={() => setView('desktop')}
        >
          🖥 데스크톱
        </button>
        <button
          className={`wire-tog ${view === 'mobile' ? 'on' : ''}`}
          aria-pressed={view === 'mobile'}
          onClick={() => setView('mobile')}
        >
          📱 모바일
        </button>
      </div>
      <div className={`wire-stage ${view}`}>
        <iframe
          className="wire-frame"
          title={`와이어프레임 미리보기 (${view === 'mobile' ? '모바일' : '데스크톱'})`}
          srcDoc={inertHtml}
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}
