import { describe, expect, it } from 'vitest';
import { documentTargetKey, isDocumentScopedTargetAvailable } from './App';
import { CanvasItem, EditableTarget, SourceBlock } from './types';

function makeContainerTarget(overrides: Partial<EditableTarget> = {}): EditableTarget {
  return {
    id: 'container',
    kind: 'container',
    label: 'Block container',
    path: [],
    stylePath: [],
    paddingPath: [],
    textContent: '',
    paddingDefaults: {
      top: { value: '0', unit: 'px', raw: '0px' },
      right: { value: '0', unit: 'px', raw: '0px' },
      bottom: { value: '0', unit: 'px', raw: '0px' },
      left: { value: '0', unit: 'px', raw: '0px' },
    },
    styleDefaults: {},
    textTag: 'td',
    styleTag: 'td',
    paddingTag: 'td',
    ...overrides,
  };
}

function makeBlock(id: string, editableTargets: EditableTarget[]): SourceBlock {
  return {
    id,
    type: 'paragraph',
    label: id,
    originalHtml: '<td><p>copy</p></td>',
    path: [],
    structureSignature: id,
    editableTargets,
  };
}

function makeItem(instanceId: string, sourceBlockId: string): CanvasItem {
  return {
    instanceId,
    sourceBlockId,
    overrides: {},
  };
}

describe('document target ownership', () => {
  it('keeps parent container visible only for the first instance that shares the same document path', () => {
    const sharedParentTarget = makeContainerTarget({
      id: 'parent-container',
      label: 'Parent container',
      scope: 'document',
      documentPath: [0, 0],
      documentStylePath: [0, 0],
      documentPaddingPath: [0, 0],
    });

    const paragraphBlock = makeBlock('paragraph-block', [
      makeContainerTarget(),
      sharedParentTarget,
    ]);
    const buttonBlock = makeBlock('button-block', [
      makeContainerTarget({ id: 'button-container' }),
      {
        ...sharedParentTarget,
        id: 'button-parent-container',
      },
    ]);

    const allBlocks = [paragraphBlock, buttonBlock];
    const canvasItems = [
      makeItem('instance-1', paragraphBlock.id),
      makeItem('instance-2', buttonBlock.id),
    ];

    expect(documentTargetKey(sharedParentTarget)).toBe('container|0.0|0.0|0.0');
    expect(
      isDocumentScopedTargetAvailable(canvasItems[0], paragraphBlock.editableTargets[1], canvasItems, allBlocks),
    ).toBe(true);
    expect(
      isDocumentScopedTargetAvailable(canvasItems[1], buttonBlock.editableTargets[1], canvasItems, allBlocks),
    ).toBe(false);
    expect(
      isDocumentScopedTargetAvailable(canvasItems[1], buttonBlock.editableTargets[0], canvasItems, allBlocks),
    ).toBe(true);
  });
});
