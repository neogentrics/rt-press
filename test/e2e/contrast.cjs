'use strict';
// Measures the contrast of the text a person can see, as WCAG asks: each piece of text's own colour against the background really
// behind it (clear layers are laid over what is under them). Runs inside the window.
module.exports = function measureContrast() {
  const parse = (value) => {
    const srgb = /^color\(srgb ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+)(?: \/ ([\d.]+))?\)/.exec(value);
    if (srgb) return [srgb[1] * 255, srgb[2] * 255, srgb[3] * 255, srgb[4] === undefined ? 1 : Number(srgb[4])].map(Number);
    const rgb = /^rgba?\(([^)]+)\)/.exec(value);
    if (rgb) {
      const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    }
    throw new Error(`A colour this can't read: ${value}`);
  };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const probe = document.createElement('div');
  probe.style.background = 'Canvas';
  document.body.append(probe);
  const canvas = parse(getComputedStyle(probe).backgroundColor);
  probe.remove();
  const background = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const colour = parse(getComputedStyle(node).backgroundColor);
      if (colour[3] > 0) layers.push(colour);
      if (colour[3] === 1) break;
    }
    return layers.reverse().reduce((under, layer) => over(layer, under), canvas);
  };
  const luminance = (c) => [0, 1, 2].map((i) => { const v = c[i] / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  const scope = document.querySelector('dialog[open]') ?? document.body;
  const failures = [];
  let measured = 0;
  for (const element of [scope, ...scope.querySelectorAll('*')]) {
    const text = [...element.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue.trim()).join(' ').trim()
      || (element.matches('input:not([type=checkbox]), select') ? element.value : '');
    const box = element.getBoundingClientRect();
    if (!text || !box.width || !box.height || element.closest('[hidden], :disabled, .visually-hidden') || (element.matches('option'))) continue;
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible') continue;
    const behind = background(element);
    const found = ratio(over(parse(style.color), behind), behind);
    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
    measured += 1;
    if (found < (large ? 3 : 4.5)) failures.push(`${found.toFixed(2)} "${text.slice(0, 40)}" <${element.tagName.toLowerCase()} class="${element.className}">`);
  }
  return { measured, failures };
};
