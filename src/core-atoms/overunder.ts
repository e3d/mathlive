import { Atom, ToLatexOptions } from '../core/atom-class';
import { Box, BoxType, makeSVGBox } from '../core/box';
import { VBox } from '../core/v-box';
import { Context, PrivateStyle } from '../core/context';
import { makeNullDelimiter } from '../core/delimiters';

// An `overunder` atom has the following attributes:
// - body: atoms[]: atoms displayed on the base line
// - svgBody: string. A SVG graphic displayed on the base line (if present, the body is ignored)
// - above: atoms[]: atoms displayed above the body
// - svgAbove: string. A named SVG graphic above the element
// - below: atoms[]: atoms displayed below the body
// - svgBelow: string. A named SVG graphic below the element
export class OverunderAtom extends Atom {
  svgAbove?: string;
  svgBelow?: string;
  svgBody?: string;
  boxType: BoxType;
  padded?: boolean;
  constructor(
    command: string,
    options: {
      body?: Atom[];
      above?: Atom[];
      below?: Atom[];
      svgBody?: string;
      svgAbove?: string;
      svgBelow?: string;
      skipBoundary?: boolean;
      style: PrivateStyle;
      boxType?: BoxType;
      supsubPlacement?: 'over-under' | 'adjacent';
      padded?: boolean;
      serialize?: (atom: OverunderAtom, options: ToLatexOptions) => string;
    }
  ) {
    super('overunder', {
      command,
      serialize: options.serialize,
      style: options.style,
    });
    this.skipBoundary = options.skipBoundary ?? true;
    this.subsupPlacement = options.supsubPlacement;

    this.body = options.body;
    this.svgAbove = options.svgAbove;
    this.svgBelow = options.svgBelow;
    this.svgBody = options.svgBody;
    this.above = options.above;
    this.below = options.below;
    this.boxType = options.boxType ?? 'mord';
    this.padded = options.padded ?? false;
  }

  /**
   * Combine a base with an atom above and an atom below.
   *
   * See http://tug.ctan.org/macros/latex/required/amsmath/amsmath.dtx
   *
   * > \newcommand{\overset}[2]{\binrel@{#2}%
   * > \binrel@@{\mathop{\kern\z@#2}\limits^{#1}}}
   *
   */

  render(parentContext: Context): Box {
    let body: Box = this.svgBody
      ? makeSVGBox(this.svgBody)
      : Atom.createBox(parentContext, this.body, { newList: true });
    const annotationContext = new Context(
      parentContext,
      this.style,
      'scriptstyle'
    );
    let above: Box;
    // let aboveShift: number;
    if (this.svgAbove) {
      above = makeSVGBox(this.svgAbove);
      // aboveShift = 0;
      // aboveShift = -above.depth;
    } else if (this.above) {
      above = Atom.createBox(annotationContext, this.above, { newList: true });
    }

    let below: Box;
    // let belowShift: number;
    if (this.svgBelow) {
      below = makeSVGBox(this.svgBelow);
      // belowShift = 0;
      // belowShift = below.height;
    } else if (this.below) {
      below = Atom.createBox(annotationContext, this.below, { newList: true });
    }

    if (this.padded) {
      // The base of \overset are padded, but \overbrace aren't
      body = new Box(
        [
          makeNullDelimiter(parentContext, 'mopen'),
          body,
          makeNullDelimiter(parentContext, 'mclose'),
        ],
        { newList: true }
      );
    }

    // this.bind(parentContext, base);

    let base = makeOverunderStack(parentContext, {
      base: body,
      above,
      // aboveShift,
      below,
      // belowShift,
      type:
        this.boxType === 'mbin' || this.boxType === 'mrel'
          ? this.boxType
          : 'mord',
    });
    // base.height += parentContext.metrics.bigOpSpacing1;
    // base.depth += parentContext.metrics.bigOpSpacing1;

    // this.bind(parentContext, result);

    if (this.subsupPlacement === 'over-under') {
      base = this.attachLimits(parentContext, { base, type: base.type });
    } else {
      base = this.attachSupsub(parentContext, { base });
    }
    if (this.caret) base.caret = this.caret;

    // Bind the generated box so its components can be selected
    return this.bind(parentContext, base);
  }
}

/**
 * Combine a nucleus with an atom above and an atom below. Used to form
 * stacks for the 'overunder' atom type .
 *
 * @param nucleus The base over and under which the atoms will
 * be placed.
 * @param type The type ('mop', 'mrel', etc...) of the result
 */
function makeOverunderStack(
  context: Context,
  options: {
    base: Box;
    above: Box;
    below: Box;
    type: BoxType;
  }
): Box {
  // If nothing above and nothing below, nothing to do.
  if (!options.above && !options.below) {
    const box = new Box(options.base, { type: options.type });
    box.setStyle('position', 'relative');
    return box;
  }

  let aboveShift = 0;

  if (options.above) {
    aboveShift = -options.above.depth + context.metrics.bigOpSpacing2; // Empirical
  }

  let result = null;
  const base = options.base;

  const baseShift = 0;
  // (wrappedNucleus.height - wrappedNucleus.depth) / 2 -
  // context.mathstyle.metrics.axisHeight;

  if (options.below && options.above) {
    const bottom =
      context.metrics.bigOpSpacing5 +
      options.below.height +
      options.below.depth +
      base.depth +
      baseShift;

    result = new VBox({
      bottom,
      children: [
        context.metrics.bigOpSpacing5,
        { box: options.below, classes: ['ML__center'] },
        { box: base, classes: ['ML__center'] },
        aboveShift,
        { box: options.above, classes: ['ML__center'] },
        context.metrics.bigOpSpacing5,
      ],
    });
  } else if (options.below) {
    result = new VBox({
      top: base.height - baseShift,
      children: [
        context.metrics.bigOpSpacing5,
        { box: options.below, classes: ['ML__center'] },
        { box: base, classes: ['ML__center'] },
      ],
    });
  } else if (options.above) {
    result = new VBox({
      bottom: base.depth + baseShift,
      children: [
        // base.depth,
        { box: base, classes: ['ML__center'] },
        aboveShift,
        { box: options.above, classes: ['ML__center'] },
        context.metrics.bigOpSpacing5,
      ],
    });
  }

  return new Box(result, { type: options.type });
}
