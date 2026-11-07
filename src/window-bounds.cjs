'use strict';
const { constrain } = require('./core.cjs');
// Always write the intended size, never read a rounded size and feed it back to Windows.
// Electron's setPosition does that internally and grows at fractional display scales.
function applyPetBounds(win, point, size, area) {
  let target = constrain(point, area, size);
  const write = p => {
    win.setMinimumSize(1, 1); win.setMaximumSize(0, 0);
    win.setBounds({ x: Math.round(p.x), y: Math.round(p.y), width: size.width, height: size.height }, false);
  };
  write(target);
  const actual = win.getBounds();
  const safe = constrain({ x: actual.x, y: actual.y }, area, actual);
  // getBounds can round the outer frame up a little. Use it only to check containment.
  if (safe.x !== actual.x || safe.y !== actual.y) { target = safe; write(target); }
  return target;
}
module.exports = { applyPetBounds };
