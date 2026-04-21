export type BlockType =
  | 'repeated-item'
  | 'composite-item'
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'button'
  | 'text';

export type EditableTargetKind =
  | 'container'
  | 'heading'
  | 'paragraph'
  | 'button'
  | 'text';

export type StyleProperty = 'padding' | 'font-size' | 'line-height';

export interface StyleValue {
  value: string;
  unit: string;
  raw: string;
}

export interface PaddingBoxValues {
  top: StyleValue;
  right: StyleValue;
  bottom: StyleValue;
  left: StyleValue;
}

export interface EditableTarget {
  id: string;
  kind: EditableTargetKind;
  label: string;
  path: number[];
  stylePath: number[];
  paddingPath: number[];
  scope?: 'block' | 'document';
  documentPath?: number[];
  documentStylePath?: number[];
  documentPaddingPath?: number[];
  textContent: string;
  paddingDefaults: PaddingBoxValues;
  styleDefaults: Partial<Record<StyleProperty, StyleValue>>;
  textTag: string;
  styleTag: string;
  paddingTag: string;
}

export interface SourceBlock {
  id: string;
  type: BlockType;
  label: string;
  originalHtml: string;
  path: number[];
  structureSignature: string;
  previewSurfaceStyle?: {
    background?: string;
    backgroundColor?: string;
    color?: string;
  };
  editableTargets: EditableTarget[];
}

export interface UploadedTemplate {
  fileName: string;
  rawHtml: string;
  doctype: string;
  headHtml: string;
  bodyAttributes: Record<string, string>;
}

export interface StyleOverride {
  paddingTopValue: string;
  paddingTopUnit: string;
  paddingRightValue: string;
  paddingRightUnit: string;
  paddingBottomValue: string;
  paddingBottomUnit: string;
  paddingLeftValue: string;
  paddingLeftUnit: string;
  fontSizeValue: string;
  fontSizeUnit: string;
  lineHeightValue: string;
  lineHeightUnit: string;
}

export interface TargetOverride {
  textContent: string;
  style: StyleOverride;
  removed: boolean;
}

export interface CanvasItem {
  instanceId: string;
  sourceBlockId: string;
  overrides: Record<string, TargetOverride>;
}
