import { readFileSync, existsSync } from 'fs';
import {
  buildFinalPreviewHtml,
  buildRenderableFragmentHtml,
  buildOutputHtml,
  extractBlocks,
  parseUploadedTemplate,
  replaceInlineStyleProperty,
  renderCanvasItemHtml,
} from './htmlBuilder';
import { CanvasItem } from '../types';

describe('extractBlocks', () => {
  it('extracts one block per repeated feature item', () => {
    const html = `
      <html><body>
        <section>
          <div class="item"><img src="a.png" /><h2 style="font-size: 30px">Energy Efficiency</h2><p style="line-height: 1.4">Consumes less energy.</p></div>
          <div class="item"><img src="b.png" /><h2>Reduced Carbon Footprint</h2><p>Runs on electricity.</p></div>
          <div class="item"><img src="c.png" /><h2>Use Your Existing Air Ducts</h2><p>Works with the same infrastructure.</p></div>
          <div class="item"><img src="d.png" /><h2>Customizable Comfort</h2><p>Allows spaces to be heated.</p></div>
        </section>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(4);
    expect(blocks[0].type).toBe('composite-item');
    expect(blocks[0].editableTargets.some((target) => target.kind === 'heading')).toBe(true);
    expect(blocks[0].editableTargets.some((target) => target.kind === 'paragraph')).toBe(true);
  });

  it('extracts bullet rows as repeated blocks', () => {
    const html = `
      <html><body>
        <div>
          <div class="row"><span>•</span><span style="font-size: 24px">Joyce from Pickering won $250</span></div>
          <div class="row"><span>•</span><span>Owen from Whitby won $250</span></div>
          <div class="row"><span>•</span><span>Robert from Brooklyn won $250</span></div>
          <div class="row"><span>•</span><span>Marco and Susane from Bowmanville won $250</span></div>
          <div class="row"><span>•</span><span>Jonathon from Guelph won $1500</span></div>
        </div>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(5);
    expect(blocks.every((block) => block.type === 'repeated-item')).toBe(true);
    expect(blocks[0].editableTargets.some((target) => target.kind === 'text')).toBe(true);
  });

  it('fetches padding defaults from a nearest regular text wrapper in the original file', () => {
    const html = `
      <html><body>
        <section>
          <div class="item">
            <div style="padding: 18px 0;">
              <h2>Heading</h2>
              <p>Copy</p>
            </div>
          </div>
          <div class="item">
            <div style="padding: 12px 0;">
              <h2>Heading 2</h2>
              <p>Copy 2</p>
            </div>
          </div>
        </section>
      </body></html>
    `;

    const [block] = extractBlocks(html);
    const headingTarget = block.editableTargets.find((target) => target.kind === 'heading');
    expect(headingTarget?.paddingDefaults.top.value).toBe('18');
    expect(headingTarget?.paddingDefaults.top.unit).toBe('px');
    expect(headingTarget?.paddingDefaults.right.value).toBe('0');
  });

  it('reads four-side padding values from the target element itself', () => {
    const html = `
      <html><body>
        <section>
          <div class="item">
            <h2 style="padding: 0 12px 24px 6px;">Heading</h2>
            <p>Copy</p>
          </div>
          <div class="item">
            <h2>Heading 2</h2>
            <p>Copy 2</p>
          </div>
        </section>
      </body></html>
    `;

    const [block] = extractBlocks(html);
    const headingTarget = block.editableTargets.find((target) => target.kind === 'heading');
    expect(headingTarget?.paddingDefaults.top.value).toBe('0');
    expect(headingTarget?.paddingDefaults.bottom.value).toBe('24');
    expect(headingTarget?.paddingDefaults.right.value).toBe('12');
    expect(headingTarget?.paddingDefaults.left.value).toBe('6');
    expect(headingTarget?.paddingDefaults.bottom.unit).toBe('px');
  });

  it('fetches padding defaults from a nearest text-only wrapper in the original file', () => {
    const html = `
      <html><body>
        <section>
          <div class="item" style="display:flex; gap:20px;">
            <img src="a.png" />
            <div style="padding: 4px 0;">
              <h2>Energy Efficiency</h2>
              <p>Consumes less energy.</p>
            </div>
          </div>
          <div class="item" style="display:flex; gap:20px;">
            <img src="b.png" />
            <div style="padding: 6px 0;">
              <h2>Reduced Carbon Footprint</h2>
              <p>Runs on electricity.</p>
            </div>
          </div>
        </section>
      </body></html>
    `;

    const [block] = extractBlocks(html);
    const paragraphTarget = block.editableTargets.find((target) => target.kind === 'paragraph');
    expect(paragraphTarget?.paddingDefaults.top.value).toBe('4');
    expect(paragraphTarget?.paddingDefaults.bottom.value).toBe('4');
    expect(paragraphTarget?.paddingDefaults.left.value).toBe('0');
  });

  it('extracts hero layouts into image, heading, and paragraph blocks', () => {
    const html = `
      <html><body>
        <section>
          <div class="hero-media"><div class="circle"></div><img src="reward.png" /></div>
          <div class="hero-copy">
            <h1>Your opinion could make you a winner</h1>
            <p>For each survey you complete, you will have a chance to win.</p>
            <p>Look out for the first survey in 2 days.</p>
          </div>
        </section>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(4);
    expect(blocks.map((block) => block.type)).toEqual(['image', 'heading', 'paragraph', 'paragraph']);
  });

  it('splits a mixed hero wrapper into separate image and heading blocks', () => {
    const html = `
      <html><body>
        <section>
          <div class="hero-wrapper">
            <div class="hero-media">
              <div class="circle"></div>
              <img src="reward.png" />
            </div>
            <h1>Your opinion could make you a winner</h1>
          </div>
        </section>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.type)).toEqual(['image', 'heading']);
  });

  it('keeps a lower multi-column media-copy row as one composite block under a separate heading row', () => {
    const html = `
      <html><body>
        <section>
          <div class="hero-heading">
            <h1>READY TO EXPERIENCE THE CLUB?</h1>
          </div>
          <div class="hero-grid">
            <div class="hero-image">
              <img src="club.jpg" />
            </div>
            <div class="hero-copy">
              <h2>Stay a night. Stay often.</h2>
              <p>However you arrive, the difference is clear the moment you check in.</p>
              <a href="#" style="display:inline-block;padding:12px 24px;background:#222;color:#fff;">BOOK A STAY</a>
            </div>
          </div>
        </section>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'composite-item']);
    expect(blocks[1].editableTargets.some((target) => target.kind === 'button')).toBe(true);
  });

  it('treats each stacked visual row as its own block', () => {
    const html = `
      <html><body>
        <section>
          <div class="row row-heading">
            <h1>READY TO EXPERIENCE THE CLUB?</h1>
          </div>
          <div class="row row-feature">
            <div class="feature-image">
              <img src="club.jpg" />
            </div>
            <div class="feature-copy">
              <h2>Stay a night. Stay often.</h2>
              <p>However you arrive, the difference is clear the moment you check in.</p>
              <a href="#" style="display:inline-block;padding:12px 24px;background:#222;color:#fff;">BOOK A STAY</a>
            </div>
          </div>
        </section>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[1].type).toBe('composite-item');
  });

  it('handles a single-column CTA section as separate heading, paragraph, and button blocks', () => {
    const html = `
      <html><body>
        <section>
          <div class="single-row">
            <h2>One column story</h2>
            <p>Single-column content can still split into meaningful child blocks.</p>
            <a href="#" style="display:inline-block;padding:12px 24px;background:#222;color:#fff;">Learn more</a>
          </div>
        </section>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'button']);
  });

  it('treats a two-column table row as a single composite block', () => {
    const html = `
      <html><body>
        <table role="presentation" width="100%">
          <tbody>
            <tr>
              <td><img src="a.jpg" /><p>Column A</p></td>
              <td><img src="b.jpg" /><p>Column B</p></td>
            </tr>
          </tbody>
        </table>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('composite-item');
  });

  it('treats a three-column table row as a single composite block', () => {
    const html = `
      <html><body>
        <table role="presentation" width="100%">
          <tbody>
            <tr>
              <td><img src="a.jpg" /><p>Alpha copy.</p></td>
              <td><img src="b.jpg" /><p>Beta copy.</p></td>
              <td><img src="c.jpg" /><p>Gamma copy.</p></td>
            </tr>
          </tbody>
        </table>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('composite-item');
  });

  it('treats a four-column table row as a single composite block', () => {
    const html = `
      <html><body>
        <table role="presentation" width="100%">
          <tbody>
            <tr>
              <td><img src="a.jpg" /><p>Copy 1</p></td>
              <td><img src="b.jpg" /><p>Copy 2</p></td>
              <td><img src="c.jpg" /><p>Copy 3</p></td>
              <td><img src="d.jpg" /><p>Copy 4</p></td>
            </tr>
          </tbody>
        </table>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('composite-item');
  });

  it('treats a styled four-column section as a single block', () => {
    const html = `
      <html><body>
        <section>
          <div class="feature-strip" style="background:#333333;padding:32px;">
            <div class="feature"><img src="a.png" /><p>The right product for you</p></div>
            <div class="feature"><img src="b.png" /><p>No-mess, no-guess installation day</p></div>
            <div class="feature"><img src="c.png" /><p>Pella Care Guarantee</p></div>
            <div class="feature"><img src="d.png" /><p>Simple step-by-step process</p></div>
          </div>
        </section>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('composite-item');
    expect(blocks[0].previewSurfaceStyle?.background).toBe('#333333');
  });

  it('keeps a dark single-column disclaimer strip as one block with inherited surface style', () => {
    const html = `
      <html><body>
        <section>
          <div style="background:#1e1e1e;color:#f4efe2;padding:20px;">
            <p>THIS ADVERTISEMENT IS BEING USED FOR THE PURPOSE OF SOLICITING VACATION OWNERSHIP INTEREST SALES.</p>
            <p>NY: CP #24-0055.</p>
          </div>
        </section>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
    expect(blocks[0].previewSurfaceStyle?.background).toBe('#1e1e1e');
    expect(blocks[0].previewSurfaceStyle?.color).toBe('#f4efe2');
  });

  it('treats a horizontal media-plus-text row as a single reusable block', () => {
    const html = `
      <html><body>
        <table role="presentation" width="100%">
          <tbody>
            <tr>
              <td width="120" valign="top">
                <img src="logo.png" width="90" />
              </td>
              <td valign="top">
                <table role="presentation" width="100%">
                  <tbody>
                    <tr><td>Name</td></tr>
                    <tr><td>Title</td></tr>
                    <tr><td>TFN - Primary</td></tr>
                    <tr><td>Location</td></tr>
                    <tr><td>Address</td></tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('composite-item');
    expect(blocks[0].originalHtml.trim().startsWith('<tr>')).toBe(true);
    const textTargets = blocks[0].editableTargets.filter((target) => target.kind === 'text');
    expect(textTargets.length).toBeGreaterThanOrEqual(5);
  });

  it('renders editable typography and padding overrides for a horizontal media-plus-text row', () => {
    const html = `
      <html><body>
        <table role="presentation" width="100%">
          <tbody>
            <tr>
              <td width="120" valign="top">
                <img src="logo.png" width="90" />
              </td>
              <td valign="top" style="background-color:#f7f3e8;color:#1a1a1a;">
                <table role="presentation" width="100%">
                  <tbody>
                    <tr><td style="font-size:16px;line-height:20px;padding:2px 0;">Name</td></tr>
                    <tr><td style="font-size:14px;line-height:18px;padding:1px 0;">Title</td></tr>
                    <tr><td style="font-size:18px;line-height:22px;padding:3px 0;">TFN - Primary</td></tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body></html>
    `;

    const [block] = extractBlocks(html);
    const firstTextTarget = block.editableTargets.find((target) => target.kind === 'text' && target.textContent === 'Name');
    expect(firstTextTarget).toBeDefined();

    const item: CanvasItem = {
      instanceId: 'instance-horizontal-row',
      sourceBlockId: block.id,
      overrides: {
        [firstTextTarget!.id]: {
          textContent: 'Full Name',
          style: {
            paddingTopValue: '10',
            paddingTopUnit: 'px',
            paddingRightValue: '0',
            paddingRightUnit: 'px',
            paddingBottomValue: '10',
            paddingBottomUnit: 'px',
            paddingLeftValue: '0',
            paddingLeftUnit: 'px',
            fontSizeValue: '24',
            fontSizeUnit: 'px',
            lineHeightValue: '28',
            lineHeightUnit: 'px',
          },
          removed: false,
        },
      },
    };

    const rendered = renderCanvasItemHtml(block, item);
    expect(rendered).toContain('Full Name');
    expect(rendered).toContain('font-size: 24px');
    expect(rendered).toContain('line-height: 28px');
    expect(rendered).toContain('padding: 10px 0px 10px 0px');
    expect(rendered).toContain('background-color:#f7f3e8');
  });

  it('extracts heading, paragraph, and button for CTA sections', () => {
    const html = `
      <html><body>
        <section>
          <h1>YOUR MEMBERSHIP, YOUR WAY</h1>
          <p>Your experience matters.</p>
          <a href="#" style="padding: 10px 20px">UPDATE PREFERENCES</a>
        </section>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'button']);
  });

  it('promotes table-based cta blocks to their parent row', () => {
    const html = `
      <html><body>
        <table role="presentation" width="100%">
          <tbody>
            <tr>
              <td align="center" style="padding: 0 24px 20px;">
                <table role="presentation"><tbody><tr><td bgcolor="#C7370F">
                  <a href="#" style="display:inline-block;padding:16px 28px;background:#d9480f;color:#ffffff;text-decoration:none;">UPDATE PREFERENCES</a>
                </td></tr></tbody></table>
              </td>
            </tr>
          </tbody>
        </table>
      </body></html>
    `;

    const [block] = extractBlocks(html);
    expect(block.type).toBe('button');
    expect(block.originalHtml.trim().startsWith('<tr>')).toBe(true);
    expect(block.originalHtml).toContain('padding: 0 24px 20px;');
    const containerTarget = block.editableTargets.find((target) => target.kind === 'container');
    expect(containerTarget?.paddingTag).toBe('td');
  });
});

describe('style replacement and rendering', () => {
  it('replaces an existing inline property without duplication', () => {
    const updated = replaceInlineStyleProperty('padding: 10px; font-size: 20px', 'padding', '18%');
    expect(updated).toContain('padding: 18%');
    expect(updated.match(/padding:/g)).toHaveLength(1);
  });

  it('renders a block with independent heading and paragraph overrides', () => {
    const html = `
      <html><body>
        <section>
        <div class="item" style="padding: 12px">
          <h2 style="font-size: 30px">Energy Efficiency</h2>
          <p style="line-height: 1.4">Consumes less energy.</p>
        </div>
        <div class="item"><h2>Other</h2><p>Other copy</p></div>
        </section>
      </body></html>
    `;
    const [block] = extractBlocks(html);
    const headingTarget = block.editableTargets.find((target) => target.kind === 'heading');
    const paragraphTarget = block.editableTargets.find((target) => target.kind === 'paragraph');

    const item: CanvasItem = {
      instanceId: 'instance-1',
      sourceBlockId: block.id,
      overrides: {
        [headingTarget!.id]: {
          textContent: 'Reduced Carbon Footprint',
          style: {
            paddingTopValue: '',
            paddingTopUnit: 'px',
            paddingRightValue: '',
            paddingRightUnit: 'px',
            paddingBottomValue: '',
            paddingBottomUnit: 'px',
            paddingLeftValue: '',
            paddingLeftUnit: 'px',
            fontSizeValue: '42',
            fontSizeUnit: 'px',
            lineHeightValue: '',
            lineHeightUnit: '',
          },
          removed: false,
        },
        [paragraphTarget!.id]: {
          textContent: 'Runs on electricity.',
          style: {
            paddingTopValue: '12',
            paddingTopUnit: '%',
            paddingRightValue: '12',
            paddingRightUnit: '%',
            paddingBottomValue: '12',
            paddingBottomUnit: '%',
            paddingLeftValue: '12',
            paddingLeftUnit: '%',
            fontSizeValue: '',
            fontSizeUnit: 'px',
            lineHeightValue: '1.8',
            lineHeightUnit: '',
          },
          removed: false,
        },
      },
    };

    const rendered = renderCanvasItemHtml(block, item);
    expect(rendered).toContain('Reduced Carbon Footprint');
    expect(rendered).toContain('font-size: 42px');
    expect(rendered).toContain('padding: 12% 12% 12% 12%');
    expect(rendered).toContain('line-height: 1.8');
    expect(rendered).toContain('Runs on electricity.');
  });

  it('builds a final document preserving head html and only selected blocks', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><style>body { color: red; }</style></head>
        <body class="email-body">
          <h1>Hello</h1>
          <p>World</p>
        </body>
      </html>
    `;
    const blocks = extractBlocks(html);
    const template = parseUploadedTemplate('sample.html', html);
    const output = buildOutputHtml(template, [
      {
        instanceId: 'instance-1',
        sourceBlockId: blocks[0].id,
        overrides: {},
      },
    ], blocks);

    expect(output).toContain('<style>body { color: red; }</style>');
    expect(output).toContain('<body class="email-body">');
    expect(output).toContain('<h1>Hello</h1>');
    expect(output).not.toContain('<p>World</p>');
  });

  it('preserves the outer email table structure when exporting a selected cta block', () => {
    const html = `
      <html><body>
        <table aria-label="Manage your profile" cellpadding="0" cellspacing="0" role="main" width="100%">
          <tbody><tr>
            <td style="padding:40px 0px 40px 0px;">
              <table cellpadding="0" cellspacing="0" role="presentation" width="100%">
                <tbody><tr><td align="center" style="padding:0px 7% 0px 7%;"><h1>YOUR MEMBERSHIP, YOUR WAY</h1></td></tr></tbody>
              </table>
              <table cellpadding="0" cellspacing="0" role="presentation" width="100%">
                <tbody><tr><td align="center" style="padding:30px 7% 30px 7%;"><p>Your experience matters.</p></td></tr></tbody>
              </table>
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
                <tbody><tr>
                  <td align="center" style="font-family:'Montserrat', Arial, Helvetica, sans-serif;" valign="top">
                    <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                      <tbody><tr>
                        <td align="center" bgcolor="#C7370F" class="innertd buttonblock" valign="top">
                          <a href="#" style="color:#FFFFFF;text-decoration:none;display:block;padding:10px 40px;">UPDATE PREFERENCES</a>
                        </td>
                      </tr></tbody>
                    </table>
                  </td>
                </tr></tbody>
              </table>
            </td>
          </tr></tbody>
        </table>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    const template = parseUploadedTemplate('sample.html', html);
    const buttonBlock = blocks.find((block) => block.type === 'button');

    const output = buildOutputHtml(template, [
      {
        instanceId: 'instance-cta',
        sourceBlockId: buttonBlock!.id,
        overrides: {},
      },
    ], blocks);

    expect(output).toContain('<table aria-label="Manage your profile" cellpadding="0" cellspacing="0" role="main" width="100%">');
    expect(output).toContain('<td style="padding:40px 0px 40px 0px;">');
    expect(output).toContain('UPDATE PREFERENCES');
    expect(output).not.toContain('Your experience matters.');
  });

  it('preserves outer wrapper padding for snippet-only table exports', () => {
    const html = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tbody><tr>
          <td style="padding:30px 24px 30px 24px;background-color:#1A1A1A;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tbody><tr>
                <td style="padding:12px 0px 0px 0px;background-color:#1A1A1A;">
                  <p style="font-size:8px;line-height:125%;color:#E8E3D4;">Disclaimer copy</p>
                </td>
              </tr></tbody>
            </table>
          </td>
        </tr></tbody>
      </table>
    `;

    const blocks = extractBlocks(html);
    const template = parseUploadedTemplate('snippet.html', html);
    const output = buildOutputHtml(
      template,
      [
        {
          instanceId: 'instance-snippet-wrapper',
          sourceBlockId: blocks[0].id,
          overrides: {},
        },
      ],
      blocks,
    );

    expect(output).toContain('<td style="padding:30px 24px 30px 24px;background-color:#1A1A1A;">');
    expect(output).toContain('<td style="padding:12px 0px 0px 0px;background-color:#1A1A1A;">');
  });

  it('fetches parent container padding defaults from the source file', () => {
    const html = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tbody><tr>
          <td style="padding:30px 24px 30px 24px;background-color:#1A1A1A;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tbody><tr>
                <td style="padding:12px 0px 0px 0px;background-color:#1A1A1A;">
                  <p style="font-size:8px;line-height:125%;color:#E8E3D4;">Disclaimer copy</p>
                </td>
              </tr></tbody>
            </table>
          </td>
        </tr></tbody>
      </table>
    `;

    const [block] = extractBlocks(html);
    const parentTarget = block.editableTargets.find((target) => target.label === 'Parent container');
    expect(parentTarget).toBeDefined();
    expect(parentTarget?.paddingDefaults.top.value).toBe('30');
    expect(parentTarget?.paddingDefaults.right.value).toBe('24');
    expect(parentTarget?.paddingDefaults.bottom.value).toBe('30');
    expect(parentTarget?.paddingDefaults.left.value).toBe('24');
  });

  it('applies parent container padding overrides in generated html', () => {
    const html = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tbody><tr>
          <td style="padding:30px 24px 30px 24px;background-color:#1A1A1A;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tbody><tr>
                <td style="padding:12px 0px 0px 0px;background-color:#1A1A1A;">
                  <p style="font-size:8px;line-height:125%;color:#E8E3D4;">Disclaimer copy</p>
                </td>
              </tr></tbody>
            </table>
          </td>
        </tr></tbody>
      </table>
    `;

    const [block] = extractBlocks(html);
    const template = parseUploadedTemplate('snippet.html', html);
    const parentTarget = block.editableTargets.find((target) => target.label === 'Parent container');
    expect(parentTarget).toBeDefined();

    const output = buildOutputHtml(
      template,
      [
        {
          instanceId: 'instance-parent-padding',
          sourceBlockId: block.id,
          overrides: {
            [parentTarget!.id]: {
              textContent: '',
              style: {
                paddingTopValue: '40',
                paddingTopUnit: 'px',
                paddingRightValue: '32',
                paddingRightUnit: 'px',
                paddingBottomValue: '40',
                paddingBottomUnit: 'px',
                paddingLeftValue: '32',
                paddingLeftUnit: 'px',
                fontSizeValue: '',
                fontSizeUnit: 'px',
                lineHeightValue: '',
                lineHeightUnit: '',
              },
              removed: false,
            },
          },
        },
      ],
      [block],
    );

    expect(output).toContain('padding: 40px 32px 40px 32px');
    expect(output).toContain('background-color: #1A1A1A');
  });

  it('does not repeat identical outer wrapper padding in nested footer rows', () => {
    const html = `
      <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="background-color: #1A1A1A; min-width: 100%;" class="stylingblock-content-wrapper">
        <tbody><tr>
          <td style="padding: 40px 32px 24px 32px" class="stylingblock-content-wrapper camarker-inner">
            <table align="center" cellpadding="0" cellspacing="0" role="presentation" width="100%">
              <tbody><tr>
                <td>
                  <table align="center" cellpadding="0" cellspacing="0" role="presentation" width="100%">
                    <tbody>
                      <tr>
                        <td style="padding: 40px 32px 24px 32px; background-color: #1A1A1A">
                          <table cellpadding="0" cellspacing="0" role="presentation" width="100%">
                            <tbody><tr>
                              <th align="left" width="33%"><a href="mailto:info@kimptonclub.com">info@kimptonclub.com</a></th>
                              <th align="left" width="34%"><a href="tel:123-345-5678">212-257-2066</a></th>
                              <th align="left" width="33%"><a href="https://kimptonclub.com">kimptonclub.com</a></th>
                            </tr></tbody>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0px 0px 0px; background-color: #1A1A1A">
                          <p role="contentinfo" style="font-family: 'rotunda-variable', sans-serif; font-size: 8px; font-weight: 300; line-height: 125%; letter-spacing: 0.32px; color: #E8E3D4">
                            THIS ADVERTISEMENT IS BEING USED FOR THE PURPOSE OF SOLICITING VACATION OWNERSHIP INTEREST SALES.
                          </p>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr></tbody>
            </table>
          </td>
        </tr></tbody>
      </table>
    `;

    const blocks = extractBlocks(html);
    const template = parseUploadedTemplate('footer.html', html);
    const output = buildOutputHtml(
      template,
      [
        {
          instanceId: 'instance-footer-row',
          sourceBlockId: blocks[0].id,
          overrides: {},
        },
        {
          instanceId: 'instance-footer-disclaimer',
          sourceBlockId: blocks[1].id,
          overrides: {},
        },
      ],
      blocks,
    );

    expect(output.match(/padding:\s*40px 32px 24px 32px/g)?.length).toBe(1);
    expect(output).toContain('padding: 12px 0px 0px 0px');
  });

  it('wraps exported table row fragments in tables for valid standalone output', () => {
    const html = `
      <html><body>
        <table role="presentation" width="100%">
          <tbody>
            <tr><td style="padding-bottom:20px"><table role="presentation"><tbody><tr><td width="20" style="color:#da1b27">•</td><td style="font-size:16px;line-height:22px">Joyce from Pickering won $250</td></tr></tbody></table></td></tr>
            <tr><td style="padding-bottom:20px"><table role="presentation"><tbody><tr><td width="20" style="color:#da1b27">•</td><td style="font-size:16px;line-height:22px">Jonathon from Guelph won $1500</td></tr></tbody></table></td></tr>
          </tbody>
        </table>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    const template = parseUploadedTemplate('sample.html', html);
    const output = buildOutputHtml(template, [
      {
        instanceId: 'instance-standalone',
        sourceBlockId: blocks[1].id,
        overrides: {},
      },
    ], blocks);

    expect(output).toContain('<table role="presentation" width="100%">');
    expect(output).toContain('<tbody><tr><td style="padding-bottom:20px">');
    expect(output).toContain('Jonathon from Guelph won $1500');
  });

  it('applies container padding to td instead of tr for repeated row blocks', () => {
    const html = `
      <html><body>
        <table role="presentation" width="100%">
          <tbody>
            <tr><td style="padding: 0 0 20px 0"><table role="presentation"><tbody><tr><td width="20">•</td><td style="font-size:16px;line-height:22px">Jonathon from Guelph won $1500</td></tr></tbody></table></td></tr>
            <tr><td style="padding: 0 0 10px 0"><table role="presentation"><tbody><tr><td width="20">•</td><td style="font-size:16px;line-height:22px">Marco and Susane from Bowmanville won $250</td></tr></tbody></table></td></tr>
          </tbody>
        </table>
      </body></html>
    `;

    const blocks = extractBlocks(html);
    const firstBlock = blocks[0];
    const containerTarget = firstBlock.editableTargets.find((target) => target.kind === 'container');

    expect(firstBlock.originalHtml.trim().startsWith('<tr>')).toBe(true);
    expect(containerTarget?.paddingTag).toBe('td');
    expect(containerTarget?.paddingPath).toEqual([0]);

    const rendered = renderCanvasItemHtml(firstBlock, {
      instanceId: 'instance-padding-owner',
      sourceBlockId: firstBlock.id,
      overrides: {
        [containerTarget!.id]: {
          textContent: '',
          style: {
            paddingTopValue: '10',
            paddingTopUnit: 'px',
            paddingRightValue: '0',
            paddingRightUnit: 'px',
            paddingBottomValue: '10',
            paddingBottomUnit: 'px',
            paddingLeftValue: '0',
            paddingLeftUnit: 'px',
            fontSizeValue: '',
            fontSizeUnit: 'px',
            lineHeightValue: '',
            lineHeightUnit: '',
          },
          removed: false,
        },
      },
    });

    expect(rendered).toContain('<tr><td style="padding: 10px 0px 10px 0px"');
    expect(rendered).not.toContain('<tr style="padding: 10px 0px 10px 0px"');
  });

  it('wraps table cell fragments for preview rendering', () => {
    const wrapped = buildRenderableFragmentHtml(
      '<td style="padding-bottom:20px"><table role="presentation"><tbody><tr><td width="20" style="color:#da1b27">•</td><td style="font-size:16px;line-height:22px">Jonathon from Guelph won $1500</td></tr></tbody></table></td>',
    );

    expect(wrapped).toContain('<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tbody><tr>');
    expect(wrapped).toContain('padding-bottom:20px');
    expect(wrapped).toContain('Jonathon from Guelph won $1500');
  });

  it('builds final preview html using render-safe wrapped fragments', () => {
    const html = `
      <html><body>
        <table role="presentation" width="100%">
          <tbody>
            <tr><td style="padding-bottom:20px"><table role="presentation"><tbody><tr><td width="20" style="color:#da1b27">•</td><td style="font-size:16px;line-height:22px">Jonathon from Guelph won $1500</td></tr></tbody></table></td></tr>
          </tbody>
        </table>
      </body></html>
    `;

    const template = parseUploadedTemplate('sample.html', html);
    const preview = buildFinalPreviewHtml(template, [], []);

    expect(preview).toContain('<body>');
  });

  it('removes an individual editable target without affecting siblings', () => {
    const html = `
      <html><body>
        <section>
        <div class="item">
          <h2>Heading</h2>
          <p>Paragraph</p>
        </div>
        <div class="item"><h2>Heading 2</h2><p>Paragraph 2</p></div>
        </section>
      </body></html>
    `;
    const [block] = extractBlocks(html);
    const headingTarget = block.editableTargets.find((target) => target.kind === 'heading');
    const paragraphTarget = block.editableTargets.find((target) => target.kind === 'paragraph');

    const rendered = renderCanvasItemHtml(block, {
      instanceId: 'instance-2',
      sourceBlockId: block.id,
      overrides: {
        [headingTarget!.id]: {
          textContent: 'Heading',
          style: {
            paddingTopValue: '',
            paddingTopUnit: 'px',
            paddingRightValue: '',
            paddingRightUnit: 'px',
            paddingBottomValue: '',
            paddingBottomUnit: 'px',
            paddingLeftValue: '',
            paddingLeftUnit: 'px',
            fontSizeValue: '',
            fontSizeUnit: 'px',
            lineHeightValue: '',
            lineHeightUnit: '',
          },
          removed: true,
        },
        [paragraphTarget!.id]: {
          textContent: 'Paragraph',
          style: {
            paddingTopValue: '',
            paddingTopUnit: 'px',
            paddingRightValue: '',
            paddingRightUnit: 'px',
            paddingBottomValue: '',
            paddingBottomUnit: 'px',
            paddingLeftValue: '',
            paddingLeftUnit: 'px',
            fontSizeValue: '',
            fontSizeUnit: 'px',
            lineHeightValue: '',
            lineHeightUnit: '',
          },
          removed: false,
        },
      },
    });

    expect(rendered).not.toContain('<h2>Heading</h2>');
    expect(rendered).toContain('<p>Paragraph</p>');
  });

  it('replaces ancestor cell padding instead of writing paragraph padding in table layouts', () => {
    const html = `
      <html><body>
        <table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="padding: 10px">
          <tbody>
            <tr>
              <td align="center" style="padding:30px 7% 30px 7%;font-family:'Montserrat', Arial, Helvetica, sans-serif;" valign="top">
                <p style="text-align: center; font-size: 20px; line-height: 28px; font-family: 'Montserrat', Arial, Helvetica, sans-serif; margin: 0px; padding: 10px">
                  Your experience matters. The more you share, the more we can personalise it just for you.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body></html>
    `;

    const [block] = extractBlocks(html);
    const paragraphTarget = block.editableTargets.find((target) => target.kind === 'paragraph');
    expect(paragraphTarget?.paddingDefaults.top.value).toBe('30');
    expect(paragraphTarget?.paddingDefaults.right.value).toBe('7');
    expect(paragraphTarget?.paddingDefaults.right.unit).toBe('%');

    const rendered = renderCanvasItemHtml(block, {
      instanceId: 'instance-3',
      sourceBlockId: block.id,
      overrides: {
        [paragraphTarget!.id]: {
          textContent: 'Your experience matters. The more you share, the more we can personalise it just for you.',
          style: {
            paddingTopValue: '10',
            paddingTopUnit: 'px',
            paddingRightValue: '7',
            paddingRightUnit: '%',
            paddingBottomValue: '10',
            paddingBottomUnit: 'px',
            paddingLeftValue: '7',
            paddingLeftUnit: '%',
            fontSizeValue: '20',
            fontSizeUnit: 'px',
            lineHeightValue: '28',
            lineHeightUnit: 'px',
          },
          removed: false,
        },
      },
    });

    expect(rendered).toContain('padding: 10px 7% 10px 7%');
    expect(rendered).toContain("<p style=\"text-align: center; font-size: 20px; line-height: 28px;");
    expect(rendered).not.toContain("margin: 0px; padding: 10px");
  });
});

describe('real file validation', () => {
  const ecFilePath = '/Users/rambabu.chappa/Desktop/EC.html';
  const ihgFilePath = '/Users/rambabu.chappa/Documents/New project/samples/Test_IHG.html';
  const ec02FilePath = '/Users/rambabu.chappa/Documents/New project/samples/EC_02.html';
  const ec03FilePath = '/Users/rambabu.chappa/Documents/New project/samples/EC_03.html';

  it.runIf(existsSync(ecFilePath))('extracts the expected composite items from EC.html', () => {
    const html = readFileSync(ecFilePath, 'utf8');
    const blocks = extractBlocks(html);

    expect(blocks).toHaveLength(4);
    expect(blocks.every((block) => block.type === 'composite-item')).toBe(true);

    const firstBlock = blocks[0];
    const containerTarget = firstBlock.editableTargets.find((target) => target.kind === 'container');
    const paragraphTargets = firstBlock.editableTargets.filter((target) => target.kind === 'paragraph');

    expect(containerTarget?.paddingDefaults.bottom.value).toBe('20');
    expect(containerTarget?.paddingDefaults.bottom.unit).toBe('px');
    expect(paragraphTargets).toHaveLength(2);
    expect(paragraphTargets[0].textContent).toContain('Energy Efficiency');
    expect(paragraphTargets[1].textContent).toContain('Consumes less energy');

    expect(paragraphTargets[0].paddingDefaults.left.value).toBe('20');
    expect(paragraphTargets[0].paddingDefaults.left.unit).toBe('px');
    expect(paragraphTargets[1].paddingDefaults.left.value).toBe('20');
    expect(paragraphTargets[1].paddingDefaults.top.value).toBe('5');

    expect(paragraphTargets[0].styleDefaults['font-size']?.value).toBe('18');
    expect(paragraphTargets[0].styleDefaults['line-height']?.value).toBe('24');
    expect(paragraphTargets[1].styleDefaults['font-size']?.value).toBe('16');
    expect(paragraphTargets[1].styleDefaults['line-height']?.value).toBe('22');
  });

  it.runIf(existsSync(ihgFilePath))('extracts paragraph block padding defaults from Test_IHG.html', () => {
    const html = readFileSync(ihgFilePath, 'utf8');
    const blocks = extractBlocks(html);

    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.type)).toEqual(['composite-item', 'paragraph', 'button']);

    const paragraphBlock = blocks[1];
    const paragraphTarget = paragraphBlock.editableTargets.find((target) => target.kind === 'paragraph');

    expect(paragraphTarget?.textContent).toContain('Your experience matters');
    expect(paragraphTarget?.paddingDefaults.top.value).toBe('30');
    expect(paragraphTarget?.paddingDefaults.top.unit).toBe('px');
    expect(paragraphTarget?.paddingDefaults.right.value).toBe('7');
    expect(paragraphTarget?.paddingDefaults.right.unit).toBe('%');
    expect(paragraphTarget?.paddingDefaults.bottom.value).toBe('30');
    expect(paragraphTarget?.paddingDefaults.left.value).toBe('7');
  });

  it.runIf(existsSync(ec02FilePath))('keeps text styling bound to the styled text cell in EC_02.html', () => {
    const html = readFileSync(ec02FilePath, 'utf8');
    const blocks = extractBlocks(html);

    expect(blocks).toHaveLength(5);
    expect(blocks.every((block) => block.type === 'repeated-item')).toBe(true);

    const finalBlock = blocks[4];
    const textTarget = finalBlock.editableTargets.find((target) => target.kind === 'text');

    expect(textTarget?.textContent).toContain('Jonathon from Guelph won $1500');
    expect(textTarget?.textTag).toBe('span');
    expect(textTarget?.styleTag).toBe('td');
    expect(textTarget?.styleDefaults['font-size']?.value).toBe('16');
    expect(textTarget?.styleDefaults['font-size']?.unit).toBe('px');
    expect(textTarget?.styleDefaults['line-height']?.value).toBe('22');
  });

  it.runIf(existsSync(ec03FilePath))('splits EC_03.html into image, heading, and paragraph blocks', () => {
    const html = readFileSync(ec03FilePath, 'utf8');
    const blocks = extractBlocks(html);

    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.type)).toEqual(['image', 'heading', 'paragraph']);
  });
});
