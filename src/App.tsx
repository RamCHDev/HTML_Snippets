import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildAnalysisPreviewHtml,
  buildFinalPreviewHtml,
  buildRenderableFragmentHtml,
  buildOutputHtml,
  createDefaultCanvasOverride,
  extractBlocks,
  parseUploadedTemplate,
  renderCanvasItemHtml,
} from './lib/htmlBuilder';
import { CanvasItem, EditableTarget, SourceBlock, UploadedTemplate } from './types';

const STYLE_UNIT_OPTIONS = {
  padding: ['px', '%', 'em', 'rem'],
  fontSize: ['px', '%', 'em', 'rem'],
  lineHeight: ['', 'px', '%', 'em', 'rem'],
} as const;

const CTA_LIBRARY: SourceBlock[] = [
  {
    id: 'cta-block-1',
    type: 'button' as const,
    label: 'Block item 1',
    originalHtml:
      '<a href="#" style="display:inline-block;padding:16px 28px;background:#d9480f;color:#ffffff;text-decoration:none;border-radius:999px;font-size:18px;line-height:1.2;">Block item 1</a>',
    path: [],
    structureSignature: 'cta-1',
    editableTargets: [],
  },
].map((block) => ({
  ...block,
  editableTargets: [
    {
      id: 'button:root',
      kind: 'button' as const,
      label: 'Button',
      path: [],
      stylePath: [],
      paddingPath: [],
      textContent: block.label,
      styleDefaults: {
        'font-size': { value: '18', unit: 'px', raw: '18px' },
        'line-height': { value: '1.2', unit: '', raw: '1.2' },
      },
      paddingDefaults: {
        top: { value: '16', unit: 'px', raw: '16px' },
        right: { value: '28', unit: 'px', raw: '28px' },
        bottom: { value: '16', unit: 'px', raw: '16px' },
        left: { value: '28', unit: 'px', raw: '28px' },
      },
      textTag: 'a',
      styleTag: 'a',
      paddingTag: 'a',
    },
  ],
}));

function previewSurfaceInlineStyle(block: SourceBlock) {
  if (!block.previewSurfaceStyle) return undefined;
  return {
    ...(block.previewSurfaceStyle.background ? { background: block.previewSurfaceStyle.background } : {}),
    ...(block.previewSurfaceStyle.backgroundColor ? { backgroundColor: block.previewSurfaceStyle.backgroundColor } : {}),
    ...(block.previewSurfaceStyle.color ? { color: block.previewSurfaceStyle.color } : {}),
  };
}

function previewSurfaceStyleString(block: SourceBlock) {
  if (!block.previewSurfaceStyle) return '';
  return [
    block.previewSurfaceStyle.background ? `background:${block.previewSurfaceStyle.background};` : '',
    block.previewSurfaceStyle.backgroundColor ? `background-color:${block.previewSurfaceStyle.backgroundColor};` : '',
    block.previewSurfaceStyle.color ? `color:${block.previewSurfaceStyle.color};` : '',
  ].join('');
}

function buildBlockPreviewDocument(template: UploadedTemplate, block: SourceBlock, html: string) {
  const wrapperStyle = previewSurfaceStyleString(block);
  return `<!DOCTYPE html>
<html>
  <head>
    ${template.headHtml}
    <style>
      html, body { margin: 0; padding: 0; height: auto !important; min-height: 0 !important; }
      body { background: transparent; overflow: hidden; }
      .builder-preview-surface {
        ${wrapperStyle}
        display: inline-block;
        width: 100%;
        vertical-align: top;
      }
      .builder-preview-surface table,
      .builder-preview-surface tbody,
      .builder-preview-surface thead,
      .builder-preview-surface tfoot,
      .builder-preview-surface tr,
      .builder-preview-surface td,
      .builder-preview-surface th,
      .builder-preview-surface div {
        height: auto !important;
        min-height: 0 !important;
      }
      .builder-preview-surface * {
        max-width: 100%;
      }
    </style>
  </head>
  <body>
    <div class="builder-preview-surface">${buildRenderableFragmentHtml(html)}</div>
  </body>
</html>`;
}

function makeInstanceId() {
  return `instance-${Math.random().toString(36).slice(2, 10)}`;
}

function IconButton({
  title,
  onClick,
  children,
  disabled = false,
  tone = 'default',
}: {
  title: string;
  onClick: () => void;
  children: string;
  disabled?: boolean;
  tone?: 'default' | 'danger' | 'primary';
}) {
  return (
    <button
      type="button"
      className={`icon-button ${tone}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

function targetGlyph(kind: EditableTarget['kind']) {
  switch (kind) {
    case 'heading':
      return 'H';
    case 'paragraph':
      return 'P';
    case 'button':
      return 'C';
    case 'container':
      return 'B';
    default:
      return 'T';
  }
}

function emptyOverrideForTarget(target: EditableTarget) {
  return createDefaultCanvasOverride(target);
}

function buildCanvasItem(block: SourceBlock): CanvasItem {
  return {
    instanceId: makeInstanceId(),
    sourceBlockId: block.id,
    overrides: Object.fromEntries(
      block.editableTargets.map((target) => [target.id, emptyOverrideForTarget(target)]),
    ),
  };
}

function styleValue(overrideValue: string, fallbackValue: string) {
  return overrideValue || fallbackValue;
}

function styleUnit(overrideUnit: string, fallbackUnit: string, emptyFallback = '') {
  return overrideUnit || fallbackUnit || emptyFallback;
}

function resolvedValue(
  overrideValue: string,
  fallbackValue: string | undefined,
  fallbackRaw: string | undefined,
  emptyFallback = '0',
) {
  if (overrideValue) return overrideValue;
  if (fallbackValue) return fallbackValue;
  if (fallbackRaw) {
    const match = fallbackRaw.trim().match(/^(-?\d*\.?\d+)(px|%|em|rem)?$/i);
    if (match) return match[1];
  }
  return emptyFallback;
}

function resolvedUnit(
  overrideUnit: string,
  fallbackUnit: string | undefined,
  fallbackRaw: string | undefined,
  emptyFallback = 'px',
) {
  if (overrideUnit) return overrideUnit;
  if (fallbackUnit) return fallbackUnit;
  if (fallbackRaw) {
    const match = fallbackRaw.trim().match(/^(-?\d*\.?\d+)(px|%|em|rem)?$/i);
    if (match?.[2]) return match[2];
  }
  return emptyFallback;
}

function blockPreviewTitle(block: SourceBlock) {
  return `${block.type} • ${block.editableTargets.length} editable target${block.editableTargets.length === 1 ? '' : 's'}`;
}

function pathSummary(path: number[]) {
  return path.length === 0 ? 'root' : path.join('.');
}

export function documentTargetKey(target: EditableTarget): string | null {
  if (target.scope !== 'document') return null;
  return [
    target.kind,
    target.documentPath?.join('.') ?? '',
    target.documentStylePath?.join('.') ?? '',
    target.documentPaddingPath?.join('.') ?? '',
  ].join('|');
}

export function isDocumentScopedTargetAvailable(
  item: CanvasItem,
  target: EditableTarget,
  canvasItems: CanvasItem[],
  allBlocks: SourceBlock[],
): boolean {
  if (target.scope !== 'document') return true;

  const key = documentTargetKey(target);
  if (!key) return true;

  const owner = canvasItems.find((entry) => {
    const block = allBlocks.find((candidate) => candidate.id === entry.sourceBlockId);
    if (!block) return false;
    return block.editableTargets.some((editableTarget) => documentTargetKey(editableTarget) === key);
  });

  return owner?.instanceId === item.instanceId;
}

function AutoHeightPreviewFrame({
  title,
  srcDoc,
  className,
}: {
  title: string;
  srcDoc: string;
  className?: string;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(140);

  function resizeFrame(frame: HTMLIFrameElement | null) {
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    const surface = doc.querySelector('.builder-preview-surface') as HTMLElement | null;
    const surfaceHeight = surface ? Math.ceil(surface.getBoundingClientRect().height) : 0;
    const bodyHeight = doc.body ? doc.body.scrollHeight : 0;
    const docHeight = doc.documentElement ? doc.documentElement.scrollHeight : 0;
    setHeight(surfaceHeight > 0 ? Math.max(surfaceHeight, 80) : Math.max(bodyHeight, docHeight, 80));

    if (surface && frame.contentWindow?.ResizeObserver) {
      const Observer = frame.contentWindow.ResizeObserver;
      const observer = new Observer(() => {
        const nextSurfaceHeight = Math.ceil(surface.getBoundingClientRect().height);
        const nextBodyHeight = doc.body ? doc.body.scrollHeight : 0;
        const nextDocHeight = doc.documentElement ? doc.documentElement.scrollHeight : 0;
        setHeight(nextSurfaceHeight > 0 ? Math.max(nextSurfaceHeight, 80) : Math.max(nextBodyHeight, nextDocHeight, 80));
      });
      observer.observe(surface);
      (frame as HTMLIFrameElement & { __builderObserver?: ResizeObserver }).__builderObserver?.disconnect?.();
      (frame as HTMLIFrameElement & { __builderObserver?: ResizeObserver }).__builderObserver = observer as unknown as ResizeObserver;
    }
  }

  useEffect(() => {
    return () => {
      const frame = frameRef.current as HTMLIFrameElement & { __builderObserver?: ResizeObserver };
      frame?.__builderObserver?.disconnect?.();
    };
  }, []);

  useEffect(() => {
    resizeFrame(frameRef.current);
  }, [srcDoc]);

  return (
    <iframe
      ref={frameRef}
      className={className}
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      title={title}
      style={{ height: `${height}px` }}
      onLoad={(event) => resizeFrame(event.currentTarget)}
    />
  );
}

export default function App() {
  const [template, setTemplate] = useState<UploadedTemplate | null>(null);
  const [blocks, setBlocks] = useState<SourceBlock[]>([]);
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [activeController, setActiveController] = useState<{ instanceId: string; targetId: string } | null>(null);
  const [error, setError] = useState<string>('');
  const [analysisFrameHeight, setAnalysisFrameHeight] = useState(460);
  const [finalFrameHeight, setFinalFrameHeight] = useState(460);
  const analysisFrameRef = useRef<HTMLIFrameElement | null>(null);
  const finalFrameRef = useRef<HTMLIFrameElement | null>(null);

  const allBlocks = useMemo(() => [...blocks, ...CTA_LIBRARY], [blocks]);

  const selectedItem = canvasItems.find((item) => item.instanceId === selectedInstanceId) ?? null;
  const selectedBlock = selectedItem
    ? allBlocks.find((block) => block.id === selectedItem.sourceBlockId) ?? null
    : null;

  const analysisPreview = useMemo(() => {
    if (!template) return '';
    return buildAnalysisPreviewHtml(template, blocks);
  }, [template, blocks]);

  const finalHtml = useMemo(() => {
    if (!template || canvasItems.length === 0) return '';
    return buildOutputHtml(template, canvasItems, allBlocks);
  }, [template, canvasItems, allBlocks]);

  const finalPreviewHtml = useMemo(() => {
    if (!template || canvasItems.length === 0) return '';
    return buildFinalPreviewHtml(template, canvasItems, allBlocks);
  }, [template, canvasItems, allBlocks]);

  useEffect(() => {
    if (!selectedInstanceId && canvasItems.length > 0) {
      setSelectedInstanceId(canvasItems[0].instanceId);
    }
  }, [canvasItems, selectedInstanceId]);

  useEffect(() => {
    if (!activeController) return;
    const item = canvasItems.find((entry) => entry.instanceId === activeController.instanceId);
    const block = item ? allBlocks.find((entry) => entry.id === item.sourceBlockId) ?? null : null;
    const target = block?.editableTargets.find((entry) => entry.id === activeController.targetId) ?? null;
    if (!item || !target || !item.overrides[activeController.targetId] || !isTargetAvailableInInstance(item, target)) {
      setActiveController(null);
    }
  }, [activeController, canvasItems, allBlocks]);

  function isFirstInstanceForSource(item: CanvasItem) {
    return canvasItems.find((entry) => entry.sourceBlockId === item.sourceBlockId)?.instanceId === item.instanceId;
  }

  function isTargetAvailableInInstance(item: CanvasItem, target: EditableTarget) {
    if (target.scope === 'document') {
      return isDocumentScopedTargetAvailable(item, target, canvasItems, allBlocks);
    }
    return true;
  }

  function resizePreviewFrame(
    frame: HTMLIFrameElement | null,
    setHeight: (height: number) => void,
  ) {
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;

    const bodyHeight = doc.body ? doc.body.scrollHeight : 0;
    const docHeight = doc.documentElement ? doc.documentElement.scrollHeight : 0;
    const nextHeight = Math.max(bodyHeight, docHeight, 240);
    setHeight(nextHeight);
  }

  useEffect(() => {
    resizePreviewFrame(analysisFrameRef.current, setAnalysisFrameHeight);
  }, [analysisPreview]);

  useEffect(() => {
    resizePreviewFrame(finalFrameRef.current, setFinalFrameHeight);
  }, [finalPreviewHtml]);

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    file
      .text()
      .then((rawHtml) => {
        const parsedTemplate = parseUploadedTemplate(file.name, rawHtml);
        const extractedBlocks = extractBlocks(rawHtml);
        if (extractedBlocks.length === 0) {
          throw new Error('No reusable content blocks were detected in this upload.');
        }
        setTemplate(parsedTemplate);
        setBlocks(extractedBlocks);
        setCanvasItems([]);
        setSelectedInstanceId(null);
        setActiveController(null);
        setError('');
      })
      .catch((uploadError: Error) => {
        setError(uploadError.message || 'Unable to process the uploaded HTML.');
      });
  }

  function addBlockToCanvas(block: SourceBlock) {
    const nextItem = buildCanvasItem(block);
    setCanvasItems((current) => [...current, nextItem]);
    setSelectedInstanceId(nextItem.instanceId);
    setActiveController(null);
  }

  function cloneCanvasItem(instanceId: string) {
    setCanvasItems((current) => {
      const item = current.find((entry) => entry.instanceId === instanceId);
      if (!item) return current;
      const clone: CanvasItem = {
        ...item,
        instanceId: makeInstanceId(),
        overrides: JSON.parse(JSON.stringify(item.overrides)) as CanvasItem['overrides'],
      };
      return [...current, clone];
    });
  }

  function moveCanvasItem(instanceId: string, targetIndex: number) {
    setCanvasItems((current) => {
      const sourceIndex = current.findIndex((item) => item.instanceId === instanceId);
      if (sourceIndex === -1 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  }

  function moveCanvasItemToTop(instanceId: string) {
    moveCanvasItem(instanceId, 0);
  }

  function moveCanvasItemToBottom(instanceId: string) {
    moveCanvasItem(instanceId, canvasItems.length - 1);
  }

  function removeCanvasItem(instanceId: string) {
    setCanvasItems((current) => current.filter((item) => item.instanceId !== instanceId));
    if (selectedInstanceId === instanceId) {
      setSelectedInstanceId(null);
    }
    if (activeController?.instanceId === instanceId) {
      setActiveController(null);
    }
  }

  function handleCanvasDrop(event: DragEvent<HTMLElement>, targetId: string) {
    const draggedId = event.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetId) return;
    const targetIndex = canvasItems.findIndex((item) => item.instanceId === targetId);
    if (targetIndex === -1) return;
    moveCanvasItem(draggedId, targetIndex);
  }

  function updateTargetOverride(
    targetId: string,
    field:
      | 'textContent'
      | 'paddingTopValue'
      | 'paddingTopUnit'
      | 'paddingRightValue'
      | 'paddingRightUnit'
      | 'paddingBottomValue'
      | 'paddingBottomUnit'
      | 'paddingLeftValue'
      | 'paddingLeftUnit'
      | 'fontSizeValue'
      | 'fontSizeUnit'
      | 'lineHeightValue'
      | 'lineHeightUnit'
      | 'removed',
    value: string,
  ) {
    if (!selectedItem) return;
    setCanvasItems((current) =>
      current.map((item) => {
        if (item.instanceId !== selectedItem.instanceId) return item;
        const existing = item.overrides[targetId];
        if (!existing) return item;
        if (field === 'textContent') {
          return {
            ...item,
            overrides: {
              ...item.overrides,
              [targetId]: {
                ...existing,
                textContent: value,
              },
            },
          };
        }

        if (field === 'removed') {
          return {
            ...item,
            overrides: {
              ...item.overrides,
              [targetId]: {
                ...existing,
                removed: value === 'true',
              },
            },
          };
        }

        return {
          ...item,
          overrides: {
            ...item.overrides,
            [targetId]: {
              ...existing,
              style: {
                ...existing.style,
                [field]: value,
              },
            },
          },
        };
      }),
    );
  }

  function toggleTargetRemoved(targetId: string) {
    if (!selectedItem) return;
    const override = selectedItem.overrides[targetId];
    if (!override) return;
    updateTargetOverride(targetId, 'removed', override.removed ? 'false' : 'true');
  }

  function openTargetController(instanceId: string, targetId: string) {
    setSelectedInstanceId(instanceId);
    setActiveController((current) =>
      current?.instanceId === instanceId && current.targetId === targetId
        ? null
        : { instanceId, targetId },
    );
  }

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(finalHtml);
    } catch {}
  }

  function downloadHtml() {
    const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'generated-layout.html';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">HTML Layout Builder</p>
          <h1>Upload a source snippet, extract reusable blocks, and rebuild the layout safely.</h1>
          <p className="hero-copy">
            The builder preserves original HTML structure, surfaces editable defaults from inline styles, and lets you
            clone, reorder, preview, copy, and download your final markup.
          </p>
        </div>
        <label className="upload-card">
          <span>Upload `.html` template</span>
          <input type="file" accept=".html,text/html" onChange={handleUpload} />
        </label>
      </header>

      {error ? <div className="status error">{error}</div> : null}

      <main className="dashboard-grid">
        <section className="panel panel-source">
          <div className="panel-header">
            <div>
              <h2>Detected Blocks</h2>
              <p>{blocks.length ? `${blocks.length} reusable blocks found` : 'Upload an HTML file to begin.'}</p>
            </div>
          </div>
          <div className="block-list">
            {blocks.map((block) => (
              <article className="block-card" key={block.id}>
                <div className="block-card-head">
                  <div className="block-card-meta">
                    <strong title={block.label}>{block.label}</strong>
                    <p>{blockPreviewTitle(block)}</p>
                  </div>
                  <IconButton title={`Add ${block.label}`} onClick={() => addBlockToCanvas(block)} tone="primary">
                    +
                  </IconButton>
                </div>
                  <div className="block-preview" style={previewSurfaceInlineStyle(block)}>
                    {template ? (
                      <AutoHeightPreviewFrame
                        className="block-preview-frame"
                        srcDoc={buildBlockPreviewDocument(template, block, block.originalHtml)}
                        title={`${block.label} preview`}
                      />
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: buildRenderableFragmentHtml(block.originalHtml) }} />
                  )}
                </div>
              </article>
            ))}
            {blocks.length === 0 ? (
              <div className="library-section">
                {CTA_LIBRARY.map((block) => (
                <article className="block-card cta-card" key={block.id}>
                  <div className="block-card-head">
                    <div className="block-card-meta">
                      <strong title={block.label}>{block.label}</strong>
                      <p>button • 1 editable target</p>
                    </div>
                    <IconButton title={`Add ${block.label}`} onClick={() => addBlockToCanvas(block)} tone="primary">
                      +
                    </IconButton>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <div className="panel preview-panel panel-analysis">
          <div className="panel-header">
            <div>
              <h2>Analysis Preview</h2>
              <p>Detected source blocks are outlined with dashed borders in preview mode only.</p>
            </div>
          </div>
          {analysisPreview ? (
            <iframe
              ref={analysisFrameRef}
              sandbox="allow-same-origin"
              srcDoc={analysisPreview}
              title="Analysis preview"
              style={{ height: `${analysisFrameHeight}px` }}
              onLoad={(event) => resizePreviewFrame(event.currentTarget, setAnalysisFrameHeight)}
            />
          ) : <div className="empty-state">Upload HTML to view the outlined analysis preview.</div>}
        </div>

        <section className="panel panel-canvas">
          <div className="panel-header">
            <div>
              <h2>Canvas</h2>
              <p>Drag to reorder, clone instances, or move items to the top or bottom.</p>
            </div>
          </div>
          <div className="canvas-list">
            {canvasItems.map((item, index) => {
              const block = allBlocks.find((entry) => entry.id === item.sourceBlockId);
              if (!block) return null;
              const activeTarget = activeController?.instanceId === item.instanceId
                ? block.editableTargets.find((target) => target.id === activeController.targetId) ?? null
                : null;
              const activeOverride = activeTarget ? item.overrides[activeTarget.id] : null;
              return (
                <article
                  key={item.instanceId}
                  className={`canvas-card ${selectedInstanceId === item.instanceId ? 'selected' : ''}`}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', item.instanceId)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleCanvasDrop(event, item.instanceId)}
                  onClick={() => setSelectedInstanceId(item.instanceId)}
                >
                  <div className="canvas-card-head">
                    <div className="block-card-meta">
                      <strong title={block.label}>{block.label}</strong>
                      <p>Instance {index + 1}</p>
                    </div>
                    <div className="card-actions">
                      <IconButton title="Clone block" onClick={() => cloneCanvasItem(item.instanceId)}>
                        ⧉
                      </IconButton>
                      <IconButton title="Move block to top" onClick={() => moveCanvasItemToTop(item.instanceId)}>
                        ⇡
                      </IconButton>
                      <IconButton title="Move block to bottom" onClick={() => moveCanvasItemToBottom(item.instanceId)}>
                        ⇣
                      </IconButton>
                      <IconButton title="Delete block" onClick={() => removeCanvasItem(item.instanceId)} tone="danger">
                        🗑
                      </IconButton>
                    </div>
                  </div>
                  <div className="block-preview" style={previewSurfaceInlineStyle(block)}>
                    {template ? (
                      <AutoHeightPreviewFrame
                        className="block-preview-frame"
                        srcDoc={buildBlockPreviewDocument(template, block, renderCanvasItemHtml(block, item))}
                        title={`${block.label} canvas preview`}
                      />
                    ) : (
                      <div dangerouslySetInnerHTML={{ __html: buildRenderableFragmentHtml(renderCanvasItemHtml(block, item)) }} />
                    )}
                  </div>
                  <div className="element-toolbar">
                    {block.editableTargets.map((target) => {
                      const override = item.overrides[target.id];
                      if (!override) return null;
                      const isAvailable = isTargetAvailableInInstance(item, target);
                      if (!isAvailable) return null;
                      const isActive = activeController?.instanceId === item.instanceId && activeController.targetId === target.id;
                      return (
                        <button
                          type="button"
                          key={target.id}
                          className={`element-chip ${isActive ? 'active' : ''} ${override.removed ? 'removed' : ''}`}
                          title={target.label}
                          onClick={(event) => {
                            event.stopPropagation();
                            openTargetController(item.instanceId, target.id);
                          }}
                        >
                          <span className="target-glyph small">{targetGlyph(target.kind)}</span>
                          <span>{target.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {activeTarget && activeOverride && isTargetAvailableInInstance(item, activeTarget) ? (
                    <section className={`inline-controller ${activeOverride.removed ? 'is-removed' : ''}`}>
                      <div className="inline-controller-head">
                        <div className="target-chip">
                          <span className="target-glyph">{targetGlyph(activeTarget.kind)}</span>
                          <h3>{activeTarget.label}</h3>
                        </div>
                        <div className="controller-actions">
                          {activeTarget.kind !== 'container' ? (
                            <IconButton
                              title={activeOverride.removed ? 'Restore element' : 'Delete element'}
                              onClick={() => toggleTargetRemoved(activeTarget.id)}
                              tone={activeOverride.removed ? 'default' : 'danger'}
                            >
                              {activeOverride.removed ? '↺' : '🗑'}
                            </IconButton>
                          ) : null}
                          <IconButton title="Close controller" onClick={() => setActiveController(null)}>
                            ×
                          </IconButton>
                        </div>
                      </div>
                      {activeOverride.removed ? <p className="removed-copy">This element is removed from this block instance.</p> : null}
                      {activeTarget.kind !== 'container' ? (
                        <label>
                          <span>Content</span>
                          <textarea
                            value={activeOverride.textContent}
                            disabled={activeOverride.removed}
                            onChange={(event) => updateTargetOverride(activeTarget.id, 'textContent', event.target.value)}
                            rows={activeTarget.kind === 'paragraph' || activeTarget.kind === 'text' ? 3 : 2}
                          />
                        </label>
                      ) : null}
                      <div className="control-grid">
                        <div className="padding-grid compact">
                          <div className="padding-row">
                            <label>
                              <span>Top</span>
                              <div className="inline-field">
                                <input
                                  value={resolvedValue(activeOverride.style.paddingTopValue, activeTarget.paddingDefaults.top.value, activeTarget.paddingDefaults.top.raw)}
                                  disabled={activeOverride.removed}
                                  onChange={(event) => updateTargetOverride(activeTarget.id, 'paddingTopValue', event.target.value)}
                                />
                                <select
                                  value={resolvedUnit(activeOverride.style.paddingTopUnit, activeTarget.paddingDefaults.top.unit, activeTarget.paddingDefaults.top.raw, 'px')}
                                  disabled={activeOverride.removed}
                                  onChange={(event) => updateTargetOverride(activeTarget.id, 'paddingTopUnit', event.target.value)}
                                >
                                  {STYLE_UNIT_OPTIONS.padding.map((unit) => (
                                    <option key={`inline-top-${unit}`} value={unit}>
                                      {unit}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </label>
                            <label>
                              <span>Bottom</span>
                              <div className="inline-field">
                                <input
                                  value={resolvedValue(activeOverride.style.paddingBottomValue, activeTarget.paddingDefaults.bottom.value, activeTarget.paddingDefaults.bottom.raw)}
                                  disabled={activeOverride.removed}
                                  onChange={(event) => updateTargetOverride(activeTarget.id, 'paddingBottomValue', event.target.value)}
                                />
                                <select
                                  value={resolvedUnit(activeOverride.style.paddingBottomUnit, activeTarget.paddingDefaults.bottom.unit, activeTarget.paddingDefaults.bottom.raw, 'px')}
                                  disabled={activeOverride.removed}
                                  onChange={(event) => updateTargetOverride(activeTarget.id, 'paddingBottomUnit', event.target.value)}
                                >
                                  {STYLE_UNIT_OPTIONS.padding.map((unit) => (
                                    <option key={`inline-bottom-${unit}`} value={unit}>
                                      {unit}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </label>
                            <label>
                              <span>Left</span>
                              <div className="inline-field">
                                <input
                                  value={resolvedValue(activeOverride.style.paddingLeftValue, activeTarget.paddingDefaults.left.value, activeTarget.paddingDefaults.left.raw)}
                                  disabled={activeOverride.removed}
                                  onChange={(event) => updateTargetOverride(activeTarget.id, 'paddingLeftValue', event.target.value)}
                                />
                                <select
                                  value={resolvedUnit(activeOverride.style.paddingLeftUnit, activeTarget.paddingDefaults.left.unit, activeTarget.paddingDefaults.left.raw, 'px')}
                                  disabled={activeOverride.removed}
                                  onChange={(event) => updateTargetOverride(activeTarget.id, 'paddingLeftUnit', event.target.value)}
                                >
                                  {STYLE_UNIT_OPTIONS.padding.map((unit) => (
                                    <option key={`inline-left-${unit}`} value={unit}>
                                      {unit}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </label>
                            <label>
                              <span>Right</span>
                              <div className="inline-field">
                                <input
                                  value={resolvedValue(activeOverride.style.paddingRightValue, activeTarget.paddingDefaults.right.value, activeTarget.paddingDefaults.right.raw)}
                                  disabled={activeOverride.removed}
                                  onChange={(event) => updateTargetOverride(activeTarget.id, 'paddingRightValue', event.target.value)}
                                />
                                <select
                                  value={resolvedUnit(activeOverride.style.paddingRightUnit, activeTarget.paddingDefaults.right.unit, activeTarget.paddingDefaults.right.raw, 'px')}
                                  disabled={activeOverride.removed}
                                  onChange={(event) => updateTargetOverride(activeTarget.id, 'paddingRightUnit', event.target.value)}
                                >
                                  {STYLE_UNIT_OPTIONS.padding.map((unit) => (
                                    <option key={`inline-right-${unit}`} value={unit}>
                                      {unit}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </label>
                          </div>
                        </div>
                        {activeTarget.kind !== 'container' ? (
                          <div className="typo-row">
                            <label>
                              <span>Font size</span>
                              <div className="inline-field">
                                <input
                                  value={styleValue(activeOverride.style.fontSizeValue, activeTarget.styleDefaults['font-size']?.value ?? '')}
                                  disabled={activeOverride.removed}
                                  onChange={(event) => updateTargetOverride(activeTarget.id, 'fontSizeValue', event.target.value)}
                                />
                                <select
                                  value={styleUnit(activeOverride.style.fontSizeUnit, activeTarget.styleDefaults['font-size']?.unit ?? 'px', 'px')}
                                  disabled={activeOverride.removed}
                                  onChange={(event) => updateTargetOverride(activeTarget.id, 'fontSizeUnit', event.target.value)}
                                >
                                  {STYLE_UNIT_OPTIONS.fontSize.map((unit) => (
                                    <option key={`font-${unit}`} value={unit}>
                                      {unit}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </label>
                            <label>
                              <span>Line height</span>
                              <div className="inline-field">
                                <input
                                  value={styleValue(activeOverride.style.lineHeightValue, activeTarget.styleDefaults['line-height']?.value ?? '')}
                                  disabled={activeOverride.removed}
                                  onChange={(event) => updateTargetOverride(activeTarget.id, 'lineHeightValue', event.target.value)}
                                />
                                <select
                                  value={styleUnit(activeOverride.style.lineHeightUnit, activeTarget.styleDefaults['line-height']?.unit ?? '', '')}
                                  disabled={activeOverride.removed}
                                  onChange={(event) => updateTargetOverride(activeTarget.id, 'lineHeightUnit', event.target.value)}
                                >
                                  {STYLE_UNIT_OPTIONS.lineHeight.map((unit) => (
                                    <option key={`line-${unit || 'unitless'}`} value={unit}>
                                      {unit || 'unitless'}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </label>
                          </div>
                        ) : null}
                      </div>
                    </section>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <div className="panel preview-panel panel-final">
          <div className="panel-header">
            <div>
              <h2>Final Preview</h2>
              <p>Only the selected and arranged blocks are rendered here.</p>
            </div>
            <div className="card-actions">
              <IconButton title="Copy HTML" onClick={copyHtml} disabled={!finalHtml} tone="primary">
                ⎘
              </IconButton>
              <IconButton title="Download HTML" onClick={downloadHtml} disabled={!finalHtml} tone="primary">
                ↓
              </IconButton>
            </div>
          </div>
          {finalPreviewHtml ? (
            <iframe
              ref={finalFrameRef}
              sandbox="allow-same-origin"
              srcDoc={finalPreviewHtml}
              title="Final preview"
              style={{ height: `${finalFrameHeight}px` }}
              onLoad={(event) => resizePreviewFrame(event.currentTarget, setFinalFrameHeight)}
            />
          ) : <div className="empty-state">Add blocks to the canvas to build the final HTML.</div>}
        </div>
      </main>
    </div>
  );
}
