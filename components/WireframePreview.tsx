'use client';

import { useState } from 'react';

export default function WireframePreview({ html }: { html: string }) {
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop');

  return (
    <div className="wire-wrap">
      <div className="wire-toolbar">
        <button
          className={`wire-tog ${view === 'desktop' ? 'on' : ''}`}
          onClick={() => setView('desktop')}
        >
          🖥 데스크톱
        </button>
        <button
          className={`wire-tog ${view === 'mobile' ? 'on' : ''}`}
          onClick={() => setView('mobile')}
        >
          📱 모바일
        </button>
      </div>
      <div className={`wire-stage ${view}`}>
        <iframe
          className="wire-frame"
          title="wireframe"
          srcDoc={html}
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}
