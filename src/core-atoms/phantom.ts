import { Atom } from '../core/atom-class';
import { Box } from '../core/box';
import { VBox } from '../core/v-box';
import { Context } from '../core/context';
import type { Style } from '../public/core';

export class PhantomAtom extends Atom {
  private readonly isInvisible: boolean;
  private readonly smashHeight: boolean;
  private readonly smashDepth: boolean;
  private readonly smashWidth: boolean;
  constructor(
    command: string,
    body: Atom[],
    options: {
      smashHeight?: boolean;
      smashDepth?: boolean;
      smashWidth?: boolean;
      isInvisible?: boolean;
      style: Style;
    }
  ) {
    super('phantom', { command, style: options.style });
    this.captureSelection = true;
    this.body = body;
    this.isInvisible = options.isInvisible ?? false;
    this.smashDepth = options.smashDepth ?? false;
    this.smashHeight = options.smashHeight ?? false;
    this.smashWidth = options.smashWidth ?? false;
  }

  render(context: Context): Box {
    const phantom = new Context(context, { isPhantom: true });

    if (!this.smashDepth && !this.smashHeight && !this.smashWidth) {
      console.assert(this.isInvisible);
      return Atom.createBox(phantom, this.body, { classes: 'inner' });
    }

    const content = Atom.createBox(
      this.isInvisible ? phantom : context,
      this.body
    );

    if (this.smashWidth) {
      const fix = new Box(null, { classes: 'fix' });
      return new Box([content, fix], { classes: 'rlap' }).wrap(context);
    }

    if (!this.smashHeight && !this.smashDepth) return content;

    if (this.smashHeight) content.height = 0;
    if (this.smashDepth) content.depth = 0;

    for (const box of content.children) {
      if (this.smashHeight) box.height = 0;
      if (this.smashDepth) box.depth = 0;
    }

    // We create a stack to suppress the HTML line height by setting
    // the display to 'table-cell' which prevents the browser from
    // acting on that height.
    return new VBox(
      { firstBaseline: [{ box: content }] },
      { type: 'mord' }
    ).wrap(context);
  }
}
