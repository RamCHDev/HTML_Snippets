import {
  CanvasItem,
  EditableTarget,
  EditableTargetKind,
  PaddingBoxValues,
  SourceBlock,
  StyleProperty,
  StyleValue,
  UploadedTemplate,
} from '../types';

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const TEXT_TAGS = new Set(['P', 'SPAN', 'DIV', 'TD', 'TH', 'LI', 'A', 'BUTTON']);
const MEDIA_TAGS = new Set(['IMG', 'SVG', 'PICTURE', 'VIDEO', 'CANVAS']);
const BUTTON_TAGS = new Set(['BUTTON']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'HEAD']);
const STYLE_PROPERTIES: StyleProperty[] = ['padding', 'font-size', 'line-height'];
const CONTAINER_TAGS = new Set([
  'DIV',
  'SECTION',
  'ARTICLE',
  'LI',
  'TD',
  'TH',
  'TR',
  'TABLE',
  'TBODY',
  'THEAD',
  'TFOOT',
]);

function parseDocument(rawHtml: string): Document {
  return new DOMParser().parseFromString(rawHtml, 'text/html');
}

function serializeDoctype(doc: Document): string {
  if (!doc.doctype) return '';
  const publicId = doc.doctype.publicId ? ` PUBLIC "${doc.doctype.publicId}"` : '';
  const systemId = doc.doctype.systemId ? ` "${doc.doctype.systemId}"` : '';
  return `<!DOCTYPE ${doc.doctype.name}${publicId}${systemId}>`;
}

function readAttributes(element: Element): Record<string, string> {
  return Array.from(element.attributes).reduce<Record<string, string>>((acc, attr) => {
    acc[attr.name] = attr.value;
    return acc;
  }, {});
}

function getMeaningfulChildren(element: Element): Element[] {
  return Array.from(element.children).filter((child) => !SKIP_TAGS.has(child.tagName) && isMeaningfulElement(child));
}

function normalizedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isMeaningfulElement(element: Element): boolean {
  if (SKIP_TAGS.has(element.tagName)) return false;
  if (MEDIA_TAGS.has(element.tagName)) return true;
  if (BUTTON_TAGS.has(element.tagName)) return true;
  if (element.tagName === 'A' && hasButtonLikeAppearance(element)) return true;
  const text = normalizedText(element.textContent ?? '');
  if (text.length > 0) return true;
  return element.querySelector('img,svg,picture,video,canvas,button,a') !== null;
}

function isStandalonePrimitive(element: Element): boolean {
  if (HEADING_TAGS.has(element.tagName)) return true;
  if (element.tagName === 'P') return true;
  if (BUTTON_TAGS.has(element.tagName)) return true;
  if (element.tagName === 'A' && hasButtonLikeAppearance(element)) return true;
  if (MEDIA_TAGS.has(element.tagName)) return true;
  return false;
}

function hasButtonLikeAppearance(element: Element): boolean {
  const role = element.getAttribute('role');
  const className = element.getAttribute('class') ?? '';
  const style = (element.getAttribute('style') ?? '').toLowerCase();
  return role === 'button' || /button|btn|cta/.test(className.toLowerCase()) || /background|padding/.test(style);
}

function signatureForElement(element: Element): string {
  const childTags = Array.from(element.children)
    .filter((child) => !SKIP_TAGS.has(child.tagName))
    .map((child) => child.tagName.toLowerCase())
    .join(',');
  const headingCount = element.querySelectorAll('h1,h2,h3,h4,h5,h6').length;
  const paragraphCount = element.querySelectorAll('p').length;
  const buttonCount = element.querySelectorAll('button,a').length;
  const mediaCount = element.querySelectorAll('img,svg,picture,video,canvas').length;
  const textKind =
    headingCount > 0 || paragraphCount > 0 || buttonCount > 0
      ? 'content'
      : mediaCount > 0
        ? 'media'
        : normalizedText(element.textContent ?? '').length > 0
          ? 'text'
          : 'empty';
  return `${element.tagName.toLowerCase()}|${childTags}|${textKind}|h${headingCount}|p${paragraphCount}|b${buttonCount}|m${mediaCount}`;
}

function hasRepeatedSiblingPattern(children: Element[]): boolean {
  if (children.length < 2) return false;
  const counts = new Map<string, number>();
  children.forEach((child) => {
    const signature = signatureForElement(child);
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  });
  const maxCount = Math.max(...counts.values());
  return maxCount >= 2;
}

function findPrimaryContainer(body: HTMLElement): Element {
  let current: Element = body;
  while (true) {
    const children = getMeaningfulChildren(current);
    if (children.length !== 1) return current;
    const [onlyChild] = children;
    if (isStandalonePrimitive(onlyChild)) return current;
    if (isTableMultiColumnRow(onlyChild)) return current;
    if (isTableHorizontalContentRow(onlyChild)) return current;
    if (isStyledRepeatedColumnSet(onlyChild)) return current;
    if (isStyledSingleColumnStrip(onlyChild)) return current;
    if (hasRepeatedSiblingPattern(getMeaningfulChildren(onlyChild))) return onlyChild;
    current = onlyChild;
  }
}

function elementPathFrom(root: Element, element: Element): number[] {
  const path: number[] = [];
  let current: Element | null = element;
  while (current && current !== root) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    path.unshift(Array.from(parent.children).indexOf(current));
    current = parent;
  }
  return path;
}

function descendantByPath(root: Element, path: number[]): Element | null {
  let current: Element | null = root;
  for (const index of path) {
    if (!current) return null;
    current = current.children.item(index) as Element | null;
  }
  return current;
}

function isMediaContainer(element: Element): boolean {
  const hasText = normalizedText(element.textContent ?? '').length > 0;
  const hasMedia = MEDIA_TAGS.has(element.tagName) || element.querySelector('img,svg,picture,video,canvas') !== null;
  return hasMedia && !hasText;
}

function hasMediaDescendant(element: Element): boolean {
  return MEDIA_TAGS.has(element.tagName) || element.querySelector('img,svg,picture,video,canvas') !== null;
}

function hasTextualDescendant(element: Element): boolean {
  return (
    normalizedText(element.textContent ?? '').length > 0 ||
    element.querySelector('h1,h2,h3,h4,h5,h6,p,a,button,li,span,div') !== null
  );
}

function hasMixedMediaAndTextContent(element: Element): boolean {
  const hasMedia = hasMediaDescendant(element);
  const hasText = hasTextualDescendant(element);
  return hasMedia && hasText;
}

function isCompositeLayoutContainer(element: Element): boolean {
  const children = getMeaningfulChildren(element);
  if (children.length < 2) return false;

  const mediaChildren = children.filter((child) => hasMediaDescendant(child));
  const richContentChildren = children.filter(
    (child) =>
      child.querySelector('a,button') !== null &&
      (child.querySelector('p') !== null || getMeaningfulChildren(child).length > 1) &&
      hasTextualDescendant(child),
  );

  if (mediaChildren.length === 0 || richContentChildren.length === 0) {
    return false;
  }

  return true;
}

function isTableMultiColumnRow(element: Element): boolean {
  if (element.tagName !== 'TR') return false;
  const children = getMeaningfulChildren(element);
  if (children.length < 2) return false;
  if (!children.every((child) => child.tagName === 'TD' || child.tagName === 'TH')) return false;
  if (!hasRepeatedSiblingPattern(children)) return false;
  return children.every((child) => hasMediaDescendant(child) || hasTextualDescendant(child));
}

function countTextBearingDescendants(element: Element): number {
  const candidates = [element, ...Array.from(element.querySelectorAll('*'))];
  return candidates.filter((candidate) => {
    if (MEDIA_TAGS.has(candidate.tagName)) return false;
    return normalizedText(candidate.textContent ?? '').length > 0;
  }).length;
}

function isTableHorizontalContentRow(element: Element): boolean {
  if (element.tagName !== 'TR') return false;
  const children = getMeaningfulChildren(element);
  if (children.length < 2) return false;
  if (!children.every((child) => child.tagName === 'TD' || child.tagName === 'TH')) return false;
  if (hasRepeatedSiblingPattern(children)) return false;

  const hasMediaCell = children.some((child) => hasMediaDescendant(child));
  const hasTextStackCell = children.some(
    (child) => !hasMediaDescendant(child) && countTextBearingDescendants(child) >= 2,
  );

  return hasMediaCell && hasTextStackCell;
}

function hasContainerVisualChrome(element: Element): boolean {
  const styleMap = parseStyleAttribute(element.getAttribute('style') ?? '');
  return Boolean(
    styleMap.background ||
      styleMap['background-color'] ||
      styleMap.color ||
      styleMap.border ||
      styleMap['border-color'] ||
      element.getAttribute('bgcolor'),
  );
}

function isStyledRepeatedColumnSet(element: Element): boolean {
  const children = getMeaningfulChildren(element);
  if (children.length < 3) return false;
  if (!hasRepeatedSiblingPattern(children)) return false;
  if (!hasContainerVisualChrome(element)) return false;
  return children.every((child) => hasMediaDescendant(child) || hasTextualDescendant(child));
}

function isStyledSingleColumnStrip(element: Element): boolean {
  const children = getMeaningfulChildren(element);
  if (children.length < 2) return false;
  if (!hasContainerVisualChrome(element)) return false;
  if (children.some((child) => hasMediaDescendant(child))) return false;
  return children.every((child) => hasTextualDescendant(child));
}

function extractPreviewSurfaceStyle(element: Element, root: Element): SourceBlock['previewSurfaceStyle'] | undefined {
  let current: Element | null = element;
  while (current) {
    const styleMap = parseStyleAttribute(current.getAttribute('style') ?? '');
    const background = styleMap.background;
    const backgroundColor = styleMap['background-color'] ?? current.getAttribute('bgcolor') ?? undefined;
    const color = styleMap.color;

    if (background || backgroundColor || color) {
      return {
        ...(background ? { background } : {}),
        ...(backgroundColor ? { backgroundColor } : {}),
        ...(color ? { color } : {}),
      };
    }

    if (current === root) break;
    current = current.parentElement;
  }
  return undefined;
}

function findButtonOnlyDescendant(element: Element): Element | null {
  const candidates = Array.from(element.querySelectorAll('button,a')).filter((candidate) => {
    return BUTTON_TAGS.has(candidate.tagName) || hasButtonLikeAppearance(candidate);
  });

  if (candidates.length !== 1) {
    return null;
  }

  if (element.querySelector('h1,h2,h3,h4,h5,h6,p,img,svg,picture,video,canvas')) {
    return null;
  }

  const [button] = candidates;
  const elementText = normalizedText(element.textContent ?? '');
  const buttonText = normalizedText(button.textContent ?? '');
  if (elementText && buttonText && elementText !== buttonText) {
    return null;
  }

  return button;
}

function isButtonOnlyWrapper(element: Element, buttonText: string): boolean {
  if (element.querySelector('h1,h2,h3,h4,h5,h6,p,img,svg,picture,video,canvas')) {
    return false;
  }

  const text = normalizedText(element.textContent ?? '');
  return text === buttonText;
}

function promotedPrimitiveBlock(element: Element, boundary: Element): Element {
  if (BUTTON_TAGS.has(element.tagName) || (element.tagName === 'A' && hasButtonLikeAppearance(element))) {
    let current: Element | null = element.parentElement;
    let rowCandidate: Element | null = null;
    const buttonText = normalizedText(element.textContent ?? '');
    while (current) {
      if (current.tagName === 'TR' && isButtonOnlyWrapper(current, buttonText)) {
        rowCandidate = current;
      }
      current = current.parentElement;
    }
    if (rowCandidate) {
      return rowCandidate;
    }
  }

  let candidate = element;
  let current = element.parentElement;

  while (current) {
    if (current.tagName !== 'TABLE' && getMeaningfulChildren(current).length === 1 && readPaddingBox(current)) {
      candidate = current;
    }
    if (current === boundary) {
      break;
    }
    current = current.parentElement;
  }

  return candidate;
}

function detectBlockType(element: Element, repeated = false): SourceBlock['type'] {
  const headingCount = element.querySelectorAll('h1,h2,h3,h4,h5,h6').length + (HEADING_TAGS.has(element.tagName) ? 1 : 0);
  const paragraphCount = element.querySelectorAll('p').length + (element.tagName === 'P' ? 1 : 0);
  const buttonCount =
    element.querySelectorAll('button,a').length +
    (BUTTON_TAGS.has(element.tagName) || (element.tagName === 'A' && hasButtonLikeAppearance(element)) ? 1 : 0);
  const mediaCount =
    element.querySelectorAll('img,svg,picture,video,canvas').length + (MEDIA_TAGS.has(element.tagName) ? 1 : 0);
  const plainText = normalizedText(element.textContent ?? '');

  if (repeated) {
    if (element.querySelector('h1,h2,h3,h4,h5,h6,p')) return 'composite-item';
    return 'repeated-item';
  }
  if (HEADING_TAGS.has(element.tagName)) return 'heading';
  if (element.tagName === 'P') return 'paragraph';
  if (BUTTON_TAGS.has(element.tagName) || (element.tagName === 'A' && hasButtonLikeAppearance(element))) return 'button';
  if (MEDIA_TAGS.has(element.tagName) || isMediaContainer(element)) return 'image';
  if (mediaCount > 0 && plainText.length > 0) return 'composite-item';
  if (mediaCount > 0 && headingCount === 0 && paragraphCount === 0 && buttonCount === 0) return 'image';
  if (headingCount > 0 && paragraphCount === 0 && buttonCount === 0 && mediaCount === 0) return 'heading';
  if (paragraphCount > 0 && headingCount === 0 && buttonCount === 0 && mediaCount === 0) return 'paragraph';
  if (buttonCount > 0 && headingCount === 0 && paragraphCount === 0 && mediaCount === 0) return 'button';
  if (headingCount > 0 || paragraphCount > 0 || buttonCount > 0) return 'composite-item';
  return 'text';
}

function createLabel(type: SourceBlock['type'], element: Element, index: number): string {
  if (type === 'composite-item') {
    const heading = normalizedText(element.querySelector('h1,h2,h3,h4,h5,h6')?.textContent ?? '');
    const paragraph = normalizedText(element.querySelector('p')?.textContent ?? '');
    const summary = [heading, paragraph].filter(Boolean).join(': ');
    return `${index + 1}. Composite item${summary ? ` - ${summary.slice(0, 72)}` : ''}`;
  }
  const text = normalizedText(element.textContent ?? '');
  const snippet = text ? text.slice(0, 48) : element.tagName.toLowerCase();
  return `${index + 1}. ${type.replace('-', ' ')}${snippet ? ` - ${snippet}` : ''}`;
}

function parseStyleAttribute(styleAttribute: string): Record<string, string> {
  return styleAttribute
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, chunk) => {
      const [property, ...rest] = chunk.split(':');
      if (!property || rest.length === 0) return acc;
      acc[property.trim().toLowerCase()] = rest.join(':').trim();
      return acc;
    }, {});
}

function parseStyleValue(raw: string | undefined): StyleValue | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(-?\d*\.?\d+)(px|%|em|rem)?$/i);
  if (match) {
    return {
      value: match[1],
      unit: match[2] ?? '',
      raw: trimmed,
    };
  }
  return {
    value: trimmed,
    unit: '',
    raw: trimmed,
  };
}

function parseFirstStyleToken(raw: string | undefined): StyleValue | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const tokens = trimmed.split(/\s+/).map((token) => parseStyleValue(token)).filter(Boolean) as StyleValue[];
  if (tokens.length === 0) {
    return parseStyleValue(trimmed);
  }

  const nonZeroToken = tokens.find((token) => Number(token.value) !== 0);
  return nonZeroToken ?? tokens[0];
}

function emptyPaddingValue(): StyleValue {
  return { value: '0', unit: 'px', raw: '0px' };
}

function normalizeStyleValue(value: StyleValue | undefined, fallback = emptyPaddingValue()): StyleValue {
  if (!value) return fallback;
  if (value.value) return value;
  if (value.raw) {
    const reparsed = parseStyleValue(value.raw);
    if (reparsed) return reparsed;
  }
  return fallback;
}

function expandPaddingShorthand(tokens: StyleValue[]): PaddingBoxValues {
  if (tokens.length === 0) {
    return {
      top: emptyPaddingValue(),
      right: emptyPaddingValue(),
      bottom: emptyPaddingValue(),
      left: emptyPaddingValue(),
    };
  }

  if (tokens.length === 1) {
    return { top: normalizeStyleValue(tokens[0]), right: normalizeStyleValue(tokens[0]), bottom: normalizeStyleValue(tokens[0]), left: normalizeStyleValue(tokens[0]) };
  }

  if (tokens.length === 2) {
    return { top: normalizeStyleValue(tokens[0]), right: normalizeStyleValue(tokens[1]), bottom: normalizeStyleValue(tokens[0]), left: normalizeStyleValue(tokens[1]) };
  }

  if (tokens.length === 3) {
    return { top: normalizeStyleValue(tokens[0]), right: normalizeStyleValue(tokens[1]), bottom: normalizeStyleValue(tokens[2]), left: normalizeStyleValue(tokens[1]) };
  }

  return {
    top: normalizeStyleValue(tokens[0]),
    right: normalizeStyleValue(tokens[1]),
    bottom: normalizeStyleValue(tokens[2]),
    left: normalizeStyleValue(tokens[3]),
  };
}

function readPaddingBox(element: Element): PaddingBoxValues | undefined {
  const styleMap = parseStyleAttribute(element.getAttribute('style') ?? '');
  const shorthandTokens = (styleMap.padding ?? '')
    .trim()
    .split(/\s+/)
    .map((token) => parseStyleValue(token))
    .filter(Boolean) as StyleValue[];

  const base = expandPaddingShorthand(shorthandTokens);
  const top = normalizeStyleValue(parseStyleValue(styleMap['padding-top']) ?? base.top);
  const right = normalizeStyleValue(parseStyleValue(styleMap['padding-right']) ?? base.right);
  const bottom = normalizeStyleValue(parseStyleValue(styleMap['padding-bottom']) ?? base.bottom);
  const left = normalizeStyleValue(parseStyleValue(styleMap['padding-left']) ?? base.left);

  if (
    !styleMap.padding &&
    !styleMap['padding-top'] &&
    !styleMap['padding-right'] &&
    !styleMap['padding-bottom'] &&
    !styleMap['padding-left']
  ) {
    return undefined;
  }

  return { top, right, bottom, left };
}

function isPaddingCandidate(element: Element): boolean {
  return element.tagName !== 'TABLE';
}

function isTextOnlyPaddingContainer(element: Element): boolean {
  const meaningfulChildren = getMeaningfulChildren(element);
  if (meaningfulChildren.length === 0) {
    return false;
  }

  return meaningfulChildren.every((child) => {
    if (MEDIA_TAGS.has(child.tagName) || child.querySelector('img,svg,picture,video,canvas')) {
      return false;
    }
    return true;
  });
}

function findPaddingOwner(element: Element, block?: Element): Element | null {
  let current: Element | null = element.parentElement;
  while (current) {
    if ((current.tagName === 'TD' || current.tagName === 'TH') && readPaddingBox(current)) {
      return current;
    }
    if (!block || current === block) break;
    current = current.parentElement;
  }

  if (isPaddingCandidate(element) && readPaddingBox(element)) {
    return element;
  }

  current = element.parentElement;
  while (current) {
    if (
      isPaddingCandidate(current) &&
      readPaddingBox(current) &&
      (getMeaningfulChildren(current).length === 1 || isTextOnlyPaddingContainer(current))
    ) {
      return current;
    }
    if (!block || current === block) break;
    current = current.parentElement;
  }

  if (block && (block.tagName === 'TD' || block.tagName === 'TH') && readPaddingBox(block)) {
    return block;
  }

  if (
    block &&
    isPaddingCandidate(block) &&
    readPaddingBox(block) &&
    (getMeaningfulChildren(block).length <= 1 || isTextOnlyPaddingContainer(block))
  ) {
    return block;
  }

  return null;
}

function findPaddingDefault(element: Element, block?: Element): PaddingBoxValues | undefined {
  const owner = findPaddingOwner(element, block);
  if (!owner) {
    return undefined;
  }

  return readPaddingBox(owner);
}

function findContainerPaddingOwner(block: Element): Element {
  if (block.tagName === 'TR') {
    const firstCell = Array.from(block.children).find((child) => child.tagName === 'TD' || child.tagName === 'TH');
    if (firstCell) {
      return firstCell;
    }
  }

  if (block.tagName === 'TBODY' || block.tagName === 'THEAD' || block.tagName === 'TFOOT') {
    const row = Array.from(block.children).find((child) => child.tagName === 'TR');
    const firstCell = row
      ? Array.from(row.children).find((child) => child.tagName === 'TD' || child.tagName === 'TH')
      : null;
    if (firstCell) {
      return firstCell;
    }
  }

  if (readPaddingBox(block)) {
    return block;
  }

  if ((block.tagName === 'TR' || block.tagName === 'TBODY' || block.tagName === 'THEAD' || block.tagName === 'TFOOT') && getMeaningfulChildren(block).length === 1) {
    let current: Element | undefined = getMeaningfulChildren(block)[0];
    while (current) {
      if (readPaddingBox(current) && current.tagName !== 'TABLE') {
        return current;
      }
      const children = getMeaningfulChildren(current);
      if (children.length !== 1) {
        break;
      }
      current = children[0];
    }
  }

  return block;
}

function extractStyleDefaults(element: Element, block?: Element): Partial<Record<StyleProperty, StyleValue>> {
  const styleMap = parseStyleAttribute(element.getAttribute('style') ?? '');
  return STYLE_PROPERTIES.reduce<Partial<Record<StyleProperty, StyleValue>>>((acc, property) => {
    const parsed =
      property === 'padding'
        ? undefined
        : parseStyleValue(styleMap[property]);
    if (parsed) acc[property] = parsed;
    return acc;
  }, {});
}

function textPreview(element: Element): string {
  return normalizedText(element.textContent ?? '');
}

function hasTypographyStyles(element: Element): boolean {
  const styleMap = parseStyleAttribute(element.getAttribute('style') ?? '');
  return Boolean(
    styleMap['font-size'] ||
      styleMap['line-height'] ||
      styleMap['font-family'] ||
      styleMap['font-weight'] ||
      styleMap['letter-spacing'],
  );
}

function isBulletLikeText(text: string): boolean {
  return /^[•·▪●◦\-–—*]+$/.test(normalizedText(text));
}

function findStyleOwner(element: Element, block?: Element): Element {
  let current: Element | null = element;
  while (current) {
    if (hasTypographyStyles(current)) {
      return current;
    }
    if (!block || current === block) {
      break;
    }
    current = current.parentElement;
  }
  return element;
}

function makeTargetId(kind: EditableTargetKind, path: number[]): string {
  return `${kind}:${path.join('.') || 'root'}`;
}

function firstTextBearingLeaf(element: Element): Element | null {
  const leafCandidates = [element, ...Array.from(element.querySelectorAll('*'))].filter((candidate) => {
    if (SKIP_TAGS.has(candidate.tagName)) return false;
    return normalizedText(candidate.textContent ?? '').length > 0;
  });

  const ranked = leafCandidates
    .map((candidate) => {
      const text = normalizedText(candidate.textContent ?? '');
      const meaningfulChildren = getMeaningfulChildren(candidate);
      const nestedTables = candidate.querySelector('table,tbody,tr,td,th');
      let score = Math.min(text.length, 120);

      if (isBulletLikeText(text)) score -= 250;
      if (candidate.tagName === 'SPAN') score += 140;
      if (candidate.tagName === 'P' || candidate.tagName === 'A' || candidate.tagName === 'BUTTON' || candidate.tagName === 'LI') score += 100;
      if (candidate.tagName === 'TD' || candidate.tagName === 'TH') score += 85;
      if (hasTypographyStyles(candidate)) score += 60;
      if (meaningfulChildren.length === 0) score += 120;
      if (meaningfulChildren.length === 1 && meaningfulChildren[0].tagName === 'SPAN') score += 80;
      if (nestedTables) score -= 160;

      return { candidate, score };
    })
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.candidate ?? null;
}

function collectPlainTextLeafElements(block: Element): Element[] {
  const candidates = [
    ...(TEXT_TAGS.has(block.tagName) ? [block] : []),
    ...Array.from(block.querySelectorAll(Array.from(TEXT_TAGS).map((tag) => tag.toLowerCase()).join(','))),
  ];

  return candidates.filter((candidate, index, allCandidates) => {
    const text = normalizedText(candidate.textContent ?? '');
    if (!text || isBulletLikeText(text)) return false;
    if (candidate.querySelector('h1,h2,h3,h4,h5,h6,p,button')) return false;
    if (candidate.tagName === 'A' && hasButtonLikeAppearance(candidate)) return false;
    if (candidate.querySelector('table,tbody,tr,td,th')) return false;

    const hasNestedTextCandidate = allCandidates.some((other) => {
      if (other === candidate) return false;
      const otherText = normalizedText(other.textContent ?? '');
      if (!otherText || isBulletLikeText(otherText)) return false;
      return candidate.contains(other);
    });

    if (hasNestedTextCandidate) return false;

    return true;
  });
}

function collectEditableTargets(block: Element, type: SourceBlock['type']): EditableTarget[] {
  const targets: EditableTarget[] = [];

  if (CONTAINER_TAGS.has(block.tagName) || type === 'composite-item' || type === 'repeated-item') {
    const paddingOwner = findContainerPaddingOwner(block);
    targets.push({
      id: makeTargetId('container', []),
      kind: 'container',
      label: 'Block container',
      path: [],
      stylePath: [],
      paddingPath: elementPathFrom(block, paddingOwner),
      textContent: '',
      paddingDefaults: readPaddingBox(paddingOwner) ?? expandPaddingShorthand([]),
      styleDefaults: extractStyleDefaults(block, block),
      textTag: block.tagName.toLowerCase(),
      styleTag: block.tagName.toLowerCase(),
      paddingTag: paddingOwner.tagName.toLowerCase(),
    });
  }

  const headingElements = HEADING_TAGS.has(block.tagName)
    ? [block, ...Array.from(block.querySelectorAll('h1,h2,h3,h4,h5,h6'))]
    : Array.from(block.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const headingTargets = headingElements.map((element, index) => {
    const paddingOwner = findPaddingOwner(element, block) ?? element;
    const styleOwner = findStyleOwner(element, block);
    return {
      id: makeTargetId('heading', elementPathFrom(block, element)),
      kind: 'heading' as const,
      label: `Heading ${index + 1}`,
      path: elementPathFrom(block, element),
      stylePath: elementPathFrom(block, styleOwner),
      paddingPath: elementPathFrom(block, paddingOwner),
      textContent: textPreview(element),
      paddingDefaults: findPaddingDefault(element, block) ?? expandPaddingShorthand([]),
      styleDefaults: extractStyleDefaults(styleOwner, block),
      textTag: element.tagName.toLowerCase(),
      styleTag: styleOwner.tagName.toLowerCase(),
      paddingTag: paddingOwner.tagName.toLowerCase(),
    };
  });

  const paragraphElements = block.tagName === 'P' ? [block, ...Array.from(block.querySelectorAll('p'))] : Array.from(block.querySelectorAll('p'));
  const paragraphTargets = paragraphElements.map((element, index) => {
    const paddingOwner = findPaddingOwner(element, block) ?? element;
    const styleOwner = findStyleOwner(element, block);
    return {
      id: makeTargetId('paragraph', elementPathFrom(block, element)),
      kind: 'paragraph' as const,
      label: `Paragraph ${index + 1}`,
      path: elementPathFrom(block, element),
      stylePath: elementPathFrom(block, styleOwner),
      paddingPath: elementPathFrom(block, paddingOwner),
      textContent: textPreview(element),
      paddingDefaults: findPaddingDefault(element, block) ?? expandPaddingShorthand([]),
      styleDefaults: extractStyleDefaults(styleOwner, block),
      textTag: element.tagName.toLowerCase(),
      styleTag: styleOwner.tagName.toLowerCase(),
      paddingTag: paddingOwner.tagName.toLowerCase(),
    };
  });

  const buttonElements = [
    ...(BUTTON_TAGS.has(block.tagName) || (block.tagName === 'A' && hasButtonLikeAppearance(block)) ? [block] : []),
    ...Array.from(block.querySelectorAll('button,a')),
  ];
  const buttonTargets = buttonElements.filter((element) => {
    return BUTTON_TAGS.has(element.tagName) || hasButtonLikeAppearance(element);
  }).map((element, index) => {
    const paddingOwner = findPaddingOwner(element, block) ?? element;
    const styleOwner = findStyleOwner(element, block);
    return {
      id: makeTargetId('button', elementPathFrom(block, element)),
      kind: 'button' as const,
      label: `Button ${index + 1}`,
      path: elementPathFrom(block, element),
      stylePath: elementPathFrom(block, styleOwner),
      paddingPath: elementPathFrom(block, paddingOwner),
      textContent: textPreview(element),
      paddingDefaults: findPaddingDefault(element, block) ?? expandPaddingShorthand([]),
      styleDefaults: extractStyleDefaults(styleOwner, block),
      textTag: element.tagName.toLowerCase(),
      styleTag: styleOwner.tagName.toLowerCase(),
      paddingTag: paddingOwner.tagName.toLowerCase(),
    };
  });

  targets.push(...headingTargets, ...paragraphTargets, ...buttonTargets);

  const nonContainerTargets = targets.filter((target) => target.kind !== 'container');

  if (nonContainerTargets.length === 0 && (TEXT_TAGS.has(block.tagName) || normalizedText(block.textContent ?? '').length > 0)) {
    const plainTextLeaves = collectPlainTextLeafElements(block);

    if (plainTextLeaves.length > 0) {
      plainTextLeaves.forEach((leaf, index) => {
        const paddingOwner = findPaddingOwner(leaf, block) ?? leaf;
        const styleOwner = findStyleOwner(leaf, block);
        targets.push({
          id: makeTargetId('text', elementPathFrom(block, leaf)),
          kind: 'text',
          label: `Text ${index + 1}`,
          path: elementPathFrom(block, leaf),
          stylePath: elementPathFrom(block, styleOwner),
          paddingPath: elementPathFrom(block, paddingOwner),
          textContent: textPreview(leaf),
          paddingDefaults: findPaddingDefault(leaf, block) ?? expandPaddingShorthand([]),
          styleDefaults: extractStyleDefaults(styleOwner, block),
          textTag: leaf.tagName.toLowerCase(),
          styleTag: styleOwner.tagName.toLowerCase(),
          paddingTag: paddingOwner.tagName.toLowerCase(),
        });
      });
    } else {
      const leaf = isStandalonePrimitive(block) ? block : firstTextBearingLeaf(block) ?? block;
      const paddingOwner = findPaddingOwner(leaf, block) ?? leaf;
      const styleOwner = findStyleOwner(leaf, block);
      targets.push({
        id: makeTargetId('text', elementPathFrom(block, leaf)),
        kind: 'text',
        label: 'Text',
        path: elementPathFrom(block, leaf),
        stylePath: elementPathFrom(block, styleOwner),
        paddingPath: elementPathFrom(block, paddingOwner),
        textContent: textPreview(leaf),
        paddingDefaults: findPaddingDefault(leaf, block) ?? expandPaddingShorthand([]),
        styleDefaults: extractStyleDefaults(styleOwner, block),
        textTag: leaf.tagName.toLowerCase(),
        styleTag: styleOwner.tagName.toLowerCase(),
        paddingTag: paddingOwner.tagName.toLowerCase(),
      });
    }
  }

  return targets;
}

function makeSourceBlock(root: Element, element: Element, index: number, repeated = false): SourceBlock {
  const type = detectBlockType(element, repeated);
  return {
    id: `block-${index + 1}`,
    type,
    label: createLabel(type, element, index),
    originalHtml: element.outerHTML,
    path: elementPathFrom(root, element),
    structureSignature: signatureForElement(element),
    previewSurfaceStyle: extractPreviewSurfaceStyle(element, root),
    editableTargets: collectEditableTargets(element, type),
  };
}

export function extractRepeatedBlocks(container: Element, root: Element): SourceBlock[] {
  return getMeaningfulChildren(container).map((child, index) => {
    const block = makeSourceBlock(root, child, index, true);
    return block;
  });
}

function collectSingleSectionBlocks(container: Element, blocks: Element[]): void {
  const children = getMeaningfulChildren(container);
  if (children.length === 0) return;

  if (hasRepeatedSiblingPattern(children)) {
    children.forEach((child) => blocks.push(child));
    return;
  }

  children.forEach((child) => {
    if (isStyledRepeatedColumnSet(child)) {
      blocks.push(child);
      return;
    }

    if (isStyledSingleColumnStrip(child)) {
      blocks.push(child);
      return;
    }

    if (isTableHorizontalContentRow(child)) {
      blocks.push(child);
      return;
    }

    if (isTableMultiColumnRow(child)) {
      blocks.push(child);
      return;
    }

    const buttonDescendant = findButtonOnlyDescendant(child);
    if (buttonDescendant) {
      blocks.push(promotedPrimitiveBlock(buttonDescendant, container));
      return;
    }

    if (isCompositeLayoutContainer(child)) {
      blocks.push(child);
      return;
    }

    if (hasMixedMediaAndTextContent(child)) {
      collectSingleSectionBlocks(child, blocks);
      return;
    }

    if (isStandalonePrimitive(child) || isMediaContainer(child)) {
      blocks.push(promotedPrimitiveBlock(child, container));
      return;
    }

    const meaningfulGrandchildren = getMeaningfulChildren(child);
    if (meaningfulGrandchildren.length === 0) {
      blocks.push(child);
      return;
    }

    if (meaningfulGrandchildren.length === 1 && !hasRepeatedSiblingPattern(meaningfulGrandchildren)) {
      collectSingleSectionBlocks(child, blocks);
      return;
    }

    if (child.querySelector('h1,h2,h3,h4,h5,h6,p') && meaningfulGrandchildren.length > 1) {
      collectSingleSectionBlocks(child, blocks);
      return;
    }

    if (isMediaContainer(child)) {
      blocks.push(child);
      return;
    }

    collectSingleSectionBlocks(child, blocks);
  });
}

export function extractSingleSectionBlocks(container: Element, root: Element): SourceBlock[] {
  const elements: Element[] = [];
  collectSingleSectionBlocks(container, elements);

  const uniqueElements = elements.filter((element, index) => {
    return elements.findIndex((candidate) => candidate === element) === index;
  });

  return uniqueElements.map((element, index) => makeSourceBlock(root, element, index, false));
}

export function classifyLayoutRegion(container: Element): 'repeated' | 'single' {
  const children = getMeaningfulChildren(container);
  return hasRepeatedSiblingPattern(children) ? 'repeated' : 'single';
}

export function parseUploadedTemplate(fileName: string, rawHtml: string): UploadedTemplate {
  const doc = parseDocument(rawHtml);
  return {
    fileName,
    rawHtml,
    doctype: serializeDoctype(doc),
    headHtml: doc.head.innerHTML,
    bodyAttributes: readAttributes(doc.body),
  };
}

export function extractBlocks(rawHtml: string): SourceBlock[] {
  const doc = parseDocument(rawHtml);
  const root = findPrimaryContainer(doc.body);
  const regionType = classifyLayoutRegion(root);
  return regionType === 'repeated'
    ? extractRepeatedBlocks(root, doc.body)
    : extractSingleSectionBlocks(root, doc.body);
}

function createFragmentRoot(html: string): Element {
  const template = document.createElement('template');
  const trimmed = html.trim();
  const tagMatch = trimmed.match(/^<([a-z0-9-]+)/i);
  const tagName = tagMatch?.[1]?.toLowerCase();

  if (tagName === 'tr') {
    template.innerHTML = `<table><tbody>${trimmed}</tbody></table>`;
    const element = template.content.querySelector('tr');
    if (!element) {
      throw new Error('Unable to parse block HTML.');
    }
    return element;
  }

  if (tagName === 'td' || tagName === 'th') {
    template.innerHTML = `<table><tbody><tr>${trimmed}</tr></tbody></table>`;
    const element = template.content.querySelector(tagName);
    if (!element) {
      throw new Error('Unable to parse block HTML.');
    }
    return element;
  }

  if (tagName === 'tbody' || tagName === 'thead' || tagName === 'tfoot') {
    template.innerHTML = `<table>${trimmed}</table>`;
    const element = template.content.querySelector(tagName);
    if (!element) {
      throw new Error('Unable to parse block HTML.');
    }
    return element;
  }

  template.innerHTML = trimmed;
  const firstElement = template.content.firstElementChild;
  if (!firstElement) {
    throw new Error('Unable to parse block HTML.');
  }
  return firstElement as Element;
}

export function replaceInlineStyleProperty(
  styleAttribute: string,
  property: StyleProperty,
  nextValue: string,
): string {
  const styleMap = parseStyleAttribute(styleAttribute);
  if (nextValue.trim()) {
    styleMap[property] = nextValue.trim();
  } else {
    delete styleMap[property];
  }

  return Object.entries(styleMap)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}

export function replaceTextContent(element: Element, textContent: string): void {
  element.textContent = textContent;
}

function composeCssValue(value: string, unit: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return `${trimmed}${unit}`;
}

function withTargetDefaults(target: EditableTarget, override: CanvasItem['overrides'][string]): CanvasItem['overrides'][string] {
  return {
    ...override,
    style: {
      ...override.style,
      paddingTopValue: override.style.paddingTopValue || target.paddingDefaults.top.value,
      paddingTopUnit: override.style.paddingTopUnit || target.paddingDefaults.top.unit || 'px',
      paddingRightValue: override.style.paddingRightValue || target.paddingDefaults.right.value,
      paddingRightUnit: override.style.paddingRightUnit || target.paddingDefaults.right.unit || 'px',
      paddingBottomValue: override.style.paddingBottomValue || target.paddingDefaults.bottom.value,
      paddingBottomUnit: override.style.paddingBottomUnit || target.paddingDefaults.bottom.unit || 'px',
      paddingLeftValue: override.style.paddingLeftValue || target.paddingDefaults.left.value,
      paddingLeftUnit: override.style.paddingLeftUnit || target.paddingDefaults.left.unit || 'px',
      fontSizeValue: override.style.fontSizeValue || target.styleDefaults['font-size']?.value || '',
      fontSizeUnit: override.style.fontSizeUnit || target.styleDefaults['font-size']?.unit || 'px',
      lineHeightValue: override.style.lineHeightValue || target.styleDefaults['line-height']?.value || '',
      lineHeightUnit: override.style.lineHeightUnit || target.styleDefaults['line-height']?.unit || '',
    },
  };
}

function replacePaddingProperties(
  styleAttribute: string,
  padding: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  },
): string {
  const styleMap = parseStyleAttribute(styleAttribute);
  delete styleMap.padding;
  delete styleMap['padding-top'];
  delete styleMap['padding-right'];
  delete styleMap['padding-bottom'];
  delete styleMap['padding-left'];

  const values = [padding.top, padding.right, padding.bottom, padding.left].map((value) => value.trim());
  if (values.every(Boolean)) {
    styleMap.padding = values.join(' ');
  } else {
    if (values[0]) styleMap['padding-top'] = values[0];
    if (values[1]) styleMap['padding-right'] = values[1];
    if (values[2]) styleMap['padding-bottom'] = values[2];
    if (values[3]) styleMap['padding-left'] = values[3];
  }

  return Object.entries(styleMap)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}

function applyOverrideToElement(element: Element, override: CanvasItem['overrides'][string]): void {
  if (override.textContent !== '') {
    replaceTextContent(element, override.textContent);
  }

  let styleAttribute = element.getAttribute('style') ?? '';
  const nextFontSize = composeCssValue(override.style.fontSizeValue, override.style.fontSizeUnit);
  const nextLineHeight = composeCssValue(override.style.lineHeightValue, override.style.lineHeightUnit);

  styleAttribute = replaceInlineStyleProperty(styleAttribute, 'font-size', nextFontSize);
  styleAttribute = replaceInlineStyleProperty(styleAttribute, 'line-height', nextLineHeight);

  if (styleAttribute) {
    element.setAttribute('style', styleAttribute);
  } else {
    element.removeAttribute('style');
  }
}

export function renderCanvasItemHtml(block: SourceBlock, item: CanvasItem): string {
  const root = createFragmentRoot(block.originalHtml);
  Object.entries(item.overrides).forEach(([targetId, override]) => {
    const target = block.editableTargets.find((editableTarget) => editableTarget.id === targetId);
    if (!target) return;
    const effectiveOverride = withTargetDefaults(target, override);
    const element = descendantByPath(root, target.path);
    if (!element) return;
    const styleElement = descendantByPath(root, target.stylePath) ?? element;
    if (effectiveOverride.removed && target.kind !== 'container') {
      element.remove();
      return;
    }
    if (target.kind !== 'container') {
      if (effectiveOverride.textContent !== '') {
        replaceTextContent(element, effectiveOverride.textContent);
      }
      if (styleElement) {
        const styleOnlyOverride = {
          ...effectiveOverride,
          textContent: '',
        };
        applyOverrideToElement(styleElement, styleOnlyOverride);
      }
    } else {
      const styleOnlyOverride = {
        ...effectiveOverride,
        textContent: '',
      };
      applyOverrideToElement(styleElement, styleOnlyOverride);
    }

    const paddingElement = descendantByPath(root, target.paddingPath);
    if (paddingElement) {
      if (paddingElement !== styleElement) {
        const elementStyleAttribute = replacePaddingProperties(element.getAttribute('style') ?? '', {
          top: '',
          right: '',
          bottom: '',
          left: '',
        });
        if (elementStyleAttribute) {
          element.setAttribute('style', elementStyleAttribute);
        } else {
          element.removeAttribute('style');
        }
      }

      let styleAttribute = paddingElement.getAttribute('style') ?? '';
      styleAttribute = replacePaddingProperties(styleAttribute, {
        top: composeCssValue(effectiveOverride.style.paddingTopValue, effectiveOverride.style.paddingTopUnit),
        right: composeCssValue(effectiveOverride.style.paddingRightValue, effectiveOverride.style.paddingRightUnit),
        bottom: composeCssValue(effectiveOverride.style.paddingBottomValue, effectiveOverride.style.paddingBottomUnit),
        left: composeCssValue(effectiveOverride.style.paddingLeftValue, effectiveOverride.style.paddingLeftUnit),
      });
      if (styleAttribute) {
        paddingElement.setAttribute('style', styleAttribute);
      } else {
        paddingElement.removeAttribute('style');
      }
    }
  });

  if (block.previewSurfaceStyle) {
    const surfaceTarget =
      root.tagName === 'TR'
        ? Array.from(root.children).find((child) => child.tagName === 'TD' || child.tagName === 'TH') ?? root
        : root;
    const styleMap = parseStyleAttribute(surfaceTarget.getAttribute('style') ?? '');
    if (block.previewSurfaceStyle.background && !styleMap.background) {
      styleMap.background = block.previewSurfaceStyle.background;
    }
    if (block.previewSurfaceStyle.backgroundColor && !styleMap['background-color']) {
      styleMap['background-color'] = block.previewSurfaceStyle.backgroundColor;
    }
    if (block.previewSurfaceStyle.color && !styleMap.color) {
      styleMap.color = block.previewSurfaceStyle.color;
    }
    const nextStyle = Object.entries(styleMap)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
    if (nextStyle) {
      surfaceTarget.setAttribute('style', nextStyle);
    }
  }

  return root.outerHTML;
}

export function buildRenderableFragmentHtml(fragmentHtml: string): string {
  const root = createFragmentRoot(fragmentHtml);

  switch (root.tagName) {
    case 'TD':
    case 'TH':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tbody><tr>${root.outerHTML}</tr></tbody></table>`;
    case 'TR':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tbody>${root.outerHTML}</tbody></table>`;
    case 'TBODY':
    case 'THEAD':
    case 'TFOOT':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${root.outerHTML}</table>`;
    default:
      return root.outerHTML;
  }
}

function bodyAttributesToString(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([name, value]) => `${name}="${value.replace(/"/g, '&quot;')}"`)
    .join(' ');
}

export function buildOutputHtml(
  template: UploadedTemplate,
  items: CanvasItem[],
  blocks: SourceBlock[],
): string {
  const fragments = items
    .map((item) => {
      const block = blocks.find((candidate) => candidate.id === item.sourceBlockId);
      return block ? renderCanvasItemHtml(block, item) : '';
    })
    .filter(Boolean)
    .join('\n');

  const doc = parseDocument(template.rawHtml);
  const root = findPrimaryContainer(doc.body);
  root.innerHTML = fragments;
  if (!template.rawHtml.toLowerCase().includes('<html')) {
    const snippetRoot = getMeaningfulChildren(doc.body)[0] ?? root;
    return snippetRoot.outerHTML;
  }

  return `${template.doctype ? `${template.doctype}\n` : ''}${doc.documentElement.outerHTML}`;
}

export function buildFinalPreviewHtml(
  template: UploadedTemplate,
  items: CanvasItem[],
  blocks: SourceBlock[],
): string {
  return buildOutputHtml(template, items, blocks);
}

export function buildAnalysisPreviewHtml(template: UploadedTemplate, blocks: SourceBlock[]): string {
  const doc = parseDocument(template.rawHtml);
  blocks.forEach((block) => {
    const element = descendantByPath(doc.body, block.path);
    if (element) {
      if (block.type === 'button') {
        let buttonProxy: Element | null = null;
        let current: Element | null = element;
        while (current) {
          if (
            (current.tagName === 'TD' || current.tagName === 'TH') &&
            current.querySelector('a,button') &&
            !current.querySelector('h1,h2,h3,h4,h5,h6,p,img,svg,picture,video,canvas')
          ) {
            buttonProxy = current;
          }
          current = current.parentElement;
        }

        if (buttonProxy) {
          buttonProxy.setAttribute('data-builder-block', block.id);
          buttonProxy.setAttribute('data-builder-block-proxy', 'button-cell');
          return;
        }
      }

      if (element.tagName === 'TR') {
        const firstCell = Array.from(element.children).find((child) => child.tagName === 'TD' || child.tagName === 'TH');
        if (firstCell) {
          firstCell.setAttribute('data-builder-block', block.id);
          firstCell.setAttribute('data-builder-block-proxy', 'row-cell');
          return;
        }
      }

      element.setAttribute('data-builder-block', block.id);

    }
  });

  const style = doc.createElement('style');
  style.textContent = `
    [data-builder-block] {
      outline: 2px dashed #2a6df4 !important;
      outline-offset: 4px;
    }
    [data-builder-block-proxy="row-cell"] {
      outline-offset: -2px;
    }
    [data-builder-block-proxy="button-cell"] {
      outline-offset: -2px;
    }
  `;
  doc.head.appendChild(style);
  return `${template.doctype ? `${template.doctype}\n` : ''}${doc.documentElement.outerHTML}`;
}

export function createDefaultCanvasOverride(target: EditableTarget): CanvasItem['overrides'][string] {
  return {
    textContent: target.textContent,
    style: {
      paddingTopValue: target.paddingDefaults.top.value,
      paddingTopUnit: target.paddingDefaults.top.unit || 'px',
      paddingRightValue: target.paddingDefaults.right.value,
      paddingRightUnit: target.paddingDefaults.right.unit || 'px',
      paddingBottomValue: target.paddingDefaults.bottom.value,
      paddingBottomUnit: target.paddingDefaults.bottom.unit || 'px',
      paddingLeftValue: target.paddingDefaults.left.value,
      paddingLeftUnit: target.paddingDefaults.left.unit || 'px',
      fontSizeValue: target.styleDefaults['font-size']?.value ?? '',
      fontSizeUnit: target.styleDefaults['font-size']?.unit || 'px',
      lineHeightValue: target.styleDefaults['line-height']?.value ?? '',
      lineHeightUnit: target.styleDefaults['line-height']?.unit ?? '',
    },
    removed: false,
  };
}
