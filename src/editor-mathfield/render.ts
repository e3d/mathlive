import { adjustInterAtomSpacing, makeStruts } from '../core/box';

import {
  Rect,
  getSelectionBounds,
  isValidMathfield,
  getAtomBounds,
  adjustForScrolling,
} from './utils';
import type { MathfieldPrivate } from './mathfield-private';

import { atomsToMathML } from '../addons/math-ml';
import { Atom, Context, DEFAULT_FONT_SIZE } from '../core/core';
import { updatePopoverPosition } from '../editor/popover';

/*
 * Return a hash (32-bit integer) representing the content of the mathfield
 * (but not the selection state)
 */
function hash(latex: string): number {
  let result = 0;
  for (let i = 0; i < latex.length; i++) {
    result = result * 31 + latex.charCodeAt(i);
    result = result | 0; // Force it to a 32-bit integer
  }

  return Math.abs(result);
}

export function requestUpdate(
  mathfield: MathfieldPrivate,
  options?: { interactive: boolean }
): void {
  if (!mathfield.dirty) {
    mathfield.dirty = true;
    requestAnimationFrame(() => {
      if (isValidMathfield(mathfield) && mathfield.dirty) {
        mathfield._atomBoundsCache = new Map<string, Rect>();
        render(mathfield, options);
        mathfield._atomBoundsCache = undefined;
      }
    });
  }
}

/**
 * Lay-out the mathfield and generate the DOM.
 *
 * This is usually done automatically, but if the font-size, or other geometric
 * attributes are modified, outside of MathLive, this function may need to be
 * called explicitly.
 *
 */
export function render(
  mathfield: MathfieldPrivate,
  renderOptions?: { forHighlighting?: boolean; interactive?: boolean }
): void {
  renderOptions = renderOptions ?? {};
  mathfield.dirty = false;
  const { model } = mathfield;

  //
  // 1. Stop and reset read aloud state
  //
  if (window.mathlive === undefined) {
    window.mathlive = {};
  }

  //
  // 2. Update selection state and blinking cursor (caret)
  //
  model.root.caret = undefined;
  model.root.isSelected = false;
  model.root.containsCaret = true;
  for (const atom of model.atoms) {
    atom.caret = undefined;
    atom.isSelected = false;
    atom.containsCaret = false;
  }
  const hasFocus = mathfield.hasFocus() && !mathfield.options.readOnly;
  if (model.selectionIsCollapsed) {
    model.at(model.position).caret = hasFocus ? mathfield.mode : '';
  } else {
    for (const atom of model.getAtoms(model.selection, {
      includeChildren: true,
    })) {
      atom.isSelected = true;
    }
  }

  if (hasFocus) {
    let ancestor = model.at(model.position).parent;
    while (ancestor) {
      ancestor.containsCaret = true;
      ancestor = ancestor.parent;
    }
  }

  //
  // 3. Render boxes
  //
  const base = model.root.render(
    new Context(
      {
        macros: mathfield.options.macros,
        atomIdsSettings: {
          // Using the hash as a seed for the ID
          // keeps the IDs the same until the content of the field changes.
          seed: hash(
            Atom.serialize(model.root, {
              expandMacro: false,
              defaultMode: mathfield.options.defaultMode,
            })
          ),
          // The `groupNumbers` flag indicates that extra boxes should be generated
          // to represent group of atoms, for example, a box to group
          // consecutive digits to represent a number.
          groupNumbers: renderOptions.forHighlighting,
        },
        smartFence: mathfield.options.smartFence,
        renderPlaceholder: undefined,
        isSelected: model.root.isSelected,
      },
      {
        fontSize: DEFAULT_FONT_SIZE,
        letterShapeStyle: mathfield.options.letterShapeStyle,
      },
      mathfield.options.defaultMode === 'inline-math'
        ? 'textstyle'
        : 'displaystyle'
    )
  );

  //
  // 4. Construct struts around the boxes
  //
  const wrapper = makeStruts(
    adjustInterAtomSpacing(base, mathfield.options.horizontalSpacingScale),
    {
      classes: 'ML__mathlive',
      attributes: {
        // Sometimes Google Translate kicks in an attempts to 'translate' math
        // This doesn't work very well, so turn off translate
        'translate': 'no',
        // Hint to screen readers to not attempt to read this <span>.
        // They should use instead the 'aria-label' attribute.
        'aria-hidden': 'true',
      },
    }
  );

  //
  // 5. Generate markup and accessible node
  //
  const isFocused = mathfield.field.classList.contains('ML__focused');
  if (isFocused && !hasFocus) {
    mathfield.field.classList.remove('ML__focused');
  } else if (!isFocused && hasFocus) {
    mathfield.field.classList.add('ML__focused');
  }

  mathfield.field.innerHTML = mathfield.options.createHTML(wrapper.toMarkup());
  mathfield.fieldContent = mathfield.field.querySelector('.ML__mathlive');

  mathfield.accessibleNode.innerHTML = mathfield.options.createHTML(
    '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
      atomsToMathML(model.root, mathfield.options) +
      '</math>'
  );

  //
  // 6. Render the selection/caret
  //
  renderSelection(mathfield);
  if (!(renderOptions.interactive ?? false)) {
    // (re-render a bit later because the layout may not be up to date right
    //  now. This happens in particular when first loading and the fonts are
    //  not yet available. )
    setTimeout(() => renderSelection(mathfield), 32);
  }
}

export function renderSelection(mathfield: MathfieldPrivate): void {
  // Remove existing selection
  for (const element of mathfield.field.querySelectorAll(
    '.ML__selection, .ML__contains-highlight'
  )) {
    element.remove();
  }

  if (!mathfield.hasFocus() || mathfield.options.readOnly) return;

  const model = mathfield.model;

  if (model.selectionIsCollapsed) {
    //
    // 1.1. Display the popover relative to the location of the caret
    //
    setTimeout(() => updatePopoverPosition(mathfield), 32);

    //
    // 1.2. Display the 'contains' highlight
    //
    let atom = model.at(model.position);
    while (atom && !(atom.containsCaret && atom.displayContainsHighlight)) {
      atom = atom.parent;
    }
    if (atom?.containsCaret && atom.displayContainsHighlight) {
      let bounds = getAtomBounds(mathfield, atom);
      if (bounds) {
        bounds = adjustForScrolling(mathfield, bounds);
        const element = document.createElement('div');
        element.classList.add('ML__contains-highlight');
        element.style.position = 'absolute';
        element.style.left = `${bounds.left}px`;
        element.style.top = `${bounds.top}px`;
        element.style.width = `${Math.ceil(bounds.right - bounds.left)}px`;
        element.style.height = `${Math.ceil(bounds.bottom - bounds.top - 1)}px`;
        mathfield.field.insertBefore(element, mathfield.field.childNodes[0]);
      }
    }

    return;
  }

  //
  // 2. Display the non-collapsed selection
  //

  for (const x of unionRects(
    getSelectionBounds(mathfield, { excludeAtomsWithBackground: true })
  )) {
    const selectionElement = document.createElement('div');
    selectionElement.classList.add('ML__selection');
    selectionElement.style.position = 'absolute';
    selectionElement.style.left = `${x.left}px`;
    selectionElement.style.top = `${x.top}px`;
    selectionElement.style.width = `${Math.ceil(x.right - x.left)}px`;
    selectionElement.style.height = `${Math.ceil(x.bottom - x.top - 1)}px`;
    mathfield.field.insertBefore(
      selectionElement,
      mathfield.field.childNodes[0]
    );
  }
}

/**
 * Return the rects that are not entirely contained by other rects.
 */
function unionRects(rects: Rect[]): Rect[] {
  const result = [];

  // Remove duplicate rects
  for (const rect of rects) {
    let found = false;
    for (const rect2 of result) {
      if (
        rect.left === rect2.left &&
        rect.right === rect2.right &&
        rect.top === rect2.top &&
        rect.bottom === rect2.bottom
      ) {
        found = true;
        break;
      }
    }
    if (!found) result.push(rect);
  }

  for (const rect of rects) {
    let count = 0;
    for (const rect2 of rects) {
      if (
        rect.left >= rect2.left &&
        rect.right <= rect2.right &&
        rect.top >= rect2.top &&
        rect.bottom <= rect2.bottom
      ) {
        count += 1;
        if (count > 1) break;
      }
    }
    if (count === 1) result.push(rect);
  }
  return result;
}
